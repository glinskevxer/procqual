import { describe, expect, it } from 'vitest';

import { Interval } from '../../../src/core/interval.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  claimFor,
  describeProcedure,
  isInForce,
  isWithdrawn,
  processesOf,
  reviewProcedure,
} from '../../../src/qualification/wps.js';
import { sampleWps } from '../../support/wps.js';

describe('reading a procedure', () => {
  it('lists its processes', () => {
    expect(processesOf(sampleWps())).toEqual(['SMAW']);
  });

  it('finds a claim by process', () => {
    expect(claimFor(sampleWps(), 'SMAW')?.fNumbers).toEqual([4]);
    expect(claimFor(sampleWps(), 'GTAW')).toBeUndefined();
  });

  it('reads back as one line for the index', () => {
    expect(describeProcedure(sampleWps())).toBe(
      'WPS-0110 Rev 0 | carbon steel shell seams, shielded metal arc | SMAW | P-No 1 | [0.0625 in, 0.75 in] | flat, horizontal, vertical, overhead',
    );
  });
});

describe('when it is in force', () => {
  it('is not in force before it was issued', () => {
    expect(isInForce(sampleWps(), date('2024-03-17'))).toBe(false);
    expect(isInForce(sampleWps(), date('2024-03-18'))).toBe(true);
  });

  it('stops being in force on the day it is withdrawn', () => {
    const withdrawn = sampleWps({ withdrawnOn: date('2024-09-01') });
    expect(isInForce(withdrawn, date('2024-08-31'))).toBe(true);
    expect(isWithdrawn(withdrawn, date('2024-09-01'))).toBe(true);
    expect(isInForce(withdrawn, date('2024-09-01'))).toBe(false);
  });

  it('is never withdrawn when no date was set', () => {
    expect(isWithdrawn(sampleWps(), date('2030-01-01'))).toBe(false);
  });
});

describe('reviewing what is written on it', () => {
  it('passes a clean procedure', () => {
    expect(reviewProcedure(sampleWps())).toEqual([]);
  });

  it('refuses one with no process', () => {
    expect(reviewProcedure(sampleWps({ layers: [] })).map((item) => item.code)).toContain(
      'wps.no_process',
    );
  });

  it('refuses the same process claimed twice', () => {
    const layers = sampleWps().layers;
    const codes = reviewProcedure(sampleWps({ layers: [...layers, ...layers] })).map(
      (item) => item.code,
    );
    expect(codes).toContain('wps.duplicate_process');
  });

  it('refuses a claim with no filler group', () => {
    const codes = reviewProcedure(
      sampleWps({ layers: [{ ...sampleWps().layers[0]!, fNumbers: [] }] }),
    ).map((item) => item.code);
    expect(codes).toContain('wps.no_filler_group');
  });

  it('refuses a preheat above its own interpass maximum', () => {
    const codes = reviewProcedure(
      sampleWps({
        layers: [{ ...sampleWps().layers[0]!, preheatMinimum: fahrenheit('600') }],
      }),
    ).map((item) => item.code);
    expect(codes).toContain('wps.preheat_above_interpass');
  });

  it('refuses claiming no base metal or no position', () => {
    expect(reviewProcedure(sampleWps({ pNumbers: [] })).map((item) => item.code)).toContain(
      'wps.no_base_metal',
    );
    expect(reviewProcedure(sampleWps({ positions: [] })).map((item) => item.code)).toContain(
      'wps.no_position',
    );
  });

  it('refuses an empty thickness range', () => {
    const empty = new Interval(inches('1'), inches('1'), { upperInclusive: false });
    expect(
      reviewProcedure(sampleWps({ baseMetalThickness: empty })).map((item) => item.code),
    ).toContain('wps.empty_thickness_range');
  });

  it('refuses a withdrawal dated before the issue', () => {
    const codes = reviewProcedure(sampleWps({ withdrawnOn: date('2024-01-01') })).map(
      (item) => item.code,
    );
    expect(codes).toContain('wps.withdrawn_before_issue');
  });

  it('lets a draft with no record behind it exist as a deficiency', () => {
    const findings = reviewProcedure(sampleWps({ supportedBy: [] }));
    expect(findings.map((item) => item.code)).toEqual(['wps.unsupported']);
    expect(findings[0]?.severity).toBe('deficiency');
  });
});
