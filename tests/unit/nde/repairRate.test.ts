import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import {
  allReadings,
  rateFindings,
  rateOf,
  reading,
  SHOP_POLICY,
  suspended,
  windowFrom,
  type WeldRecord,
} from '../../../src/nde/repairRate.js';

const on = date('2024-08-31');

const records = (
  count: number,
  repaired: number,
  overrides: Partial<WeldRecord> = {},
): WeldRecord[] =>
  Array.from({ length: count }, (_unused, index) => ({
    stencil: 'W-118',
    process: 'SMAW' as const,
    joint: `J-${index}`,
    examinedOn: date('2024-08-01'),
    repaired: index < repaired,
    ...overrides,
  }));

describe('the arithmetic', () => {
  it('divides repairs by joints', () => {
    expect(rateOf(20, 1).toString()).toBe('0.05');
    expect(rateOf(3, 1).toString()).toBe('0.3333');
  });

  it('is zero when nothing was examined', () => {
    expect(rateOf(0, 0).toString()).toBe('0');
  });

  it('works out the start of the window', () => {
    expect(windowFrom(on).toString()).toBe('2024-06-02');
    expect(() => windowFrom(on, { ...SHOP_POLICY, windowDays: 0 })).toThrow(ValidationError);
  });
});

describe('the window', () => {
  it('leaves out anything older than it', () => {
    const mixed = [...records(10, 0), ...records(5, 5, { examinedOn: date('2024-01-01') })];
    const item = reading(mixed, 'W-118', 'SMAW', on);
    expect(item.examined).toBe(10);
    expect(item.repaired).toBe(0);
  });

  it('includes both ends of it', () => {
    const edge = [
      ...records(1, 1, { examinedOn: date('2024-06-02') }),
      ...records(1, 1, { examinedOn: on }),
      ...records(1, 1, { examinedOn: date('2024-06-01') }),
    ];
    expect(reading(edge, 'W-118', 'SMAW', on).examined).toBe(2);
  });

  it('keeps welders and processes apart', () => {
    const mixed = [
      ...records(10, 0),
      ...records(10, 10, { stencil: 'W-205' }),
      ...records(10, 10, { process: 'GTAW' }),
    ];
    expect(reading(mixed, 'W-118', 'SMAW', on).repaired).toBe(0);
    expect(reading(mixed, 'W-118', 'GTAW', on).repaired).toBe(10);
  });
});

describe('the sample size', () => {
  it('will not act on too few joints however bad the number looks', () => {
    const item = reading(records(3, 1), 'W-118', 'SMAW', on);
    expect(item.rate.toString()).toBe('0.3333');
    expect(item.state).toBe('insufficient-sample');
  });

  it('reports a small sample with a repair on it as an advisory only', () => {
    const findings = rateFindings(reading(records(3, 1), 'W-118', 'SMAW', on));
    expect(findings[0]?.severity).toBe('advisory');
    expect(findings[0]?.message).toMatch(/too few to act on/);
  });

  it('says nothing at all about a small clean sample', () => {
    expect(rateFindings(reading(records(3, 0), 'W-118', 'SMAW', on))).toEqual([]);
  });

  it('starts acting at the minimum sample', () => {
    expect(reading(records(9, 3), 'W-118', 'SMAW', on).state).toBe('insufficient-sample');
    expect(reading(records(10, 3), 'W-118', 'SMAW', on).state).toBe('suspend');
  });
});

describe('the thresholds', () => {
  it('leaves a clean welder alone', () => {
    const item = reading(records(20, 0), 'W-118', 'SMAW', on);
    expect(item.state).toBe('clear');
    expect(rateFindings(item)).toEqual([]);
  });

  it('puts one over the watch level on the watch list', () => {
    const item = reading(records(50, 4), 'W-118', 'SMAW', on);
    expect(item.rate.toString()).toBe('0.08');
    expect(item.state).toBe('watch');
    expect(rateFindings(item)[0]?.severity).toBe('deficiency');
  });

  it('suspends one over the suspend level', () => {
    const item = reading(records(20, 3), 'W-118', 'SMAW', on);
    expect(item.state).toBe('suspend');
    expect(rateFindings(item)[0]?.severity).toBe('blocking');
    expect(rateFindings(item)[0]?.message).toMatch(/15 percent over 20 joints/);
  });

  it('treats the thresholds as exclusive, so exactly at the level is not over it', () => {
    expect(reading(records(20, 1), 'W-118', 'SMAW', on).state).toBe('clear');
    expect(reading(records(20, 2), 'W-118', 'SMAW', on).state).toBe('watch');
  });

  it('reads a different shop policy', () => {
    const strict = { ...SHOP_POLICY, minimumSample: 2, watchAt: SHOP_POLICY.watchAt };
    expect(reading(records(3, 1), 'W-118', 'SMAW', on, strict).state).toBe('suspend');
  });
});

describe('reading the whole shop at once', () => {
  const mixed = [
    ...records(20, 3),
    ...records(20, 0, { stencil: 'W-205' }),
    ...records(20, 2, { stencil: 'W-090' }),
  ];

  it('gives a row for every welder and process pair, worst first', () => {
    const rows = allReadings(mixed, on);
    expect(rows.map((row) => row.stencil)).toEqual(['W-118', 'W-090', 'W-205']);
  });

  it('picks out the suspended ones', () => {
    expect(suspended(allReadings(mixed, on)).map((row) => row.stencil)).toEqual(['W-118']);
  });

  it('has nothing to say about no records at all', () => {
    expect(allReadings([], on)).toEqual([]);
  });
});
