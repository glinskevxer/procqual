import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  depositInJoint,
  entriesBetween,
  jointsUsingLot,
  processesOnJoint,
  reviewEntry,
  usageDates,
  weldersOnJoint,
} from '../../../src/fabrication/weldLog.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleEntry } from '../../support/weldLog.js';

const joint = sampleJoint();

describe('reviewing an entry', () => {
  it('passes a clean one', () => {
    expect(reviewEntry(sampleEntry(), joint)).toEqual([]);
  });

  it('refuses an entry against a joint nobody mapped', () => {
    expect(reviewEntry(sampleEntry(), undefined).map((item) => item.code)).toContain(
      'log.unknown_joint',
    );
  });

  it('refuses an entry naming a different procedure from the map', () => {
    const findings = reviewEntry(
      sampleEntry({ procedure: DocumentNumber.parse('WPS-0999') }),
      joint,
    );
    expect(findings.map((item) => item.code)).toContain('log.wrong_procedure');
  });

  it('does not mind a different revision of the same procedure', () => {
    expect(
      reviewEntry(sampleEntry({ procedure: DocumentNumber.parse('WPS-0110 Rev 3') }), joint),
    ).toEqual([]);
  });

  it('insists on a consumable lot', () => {
    expect(
      reviewEntry(sampleEntry({ consumableLot: '  ' }), joint).map((item) => item.code),
    ).toContain('log.no_consumable_lot');
  });

  it('insists on some deposit', () => {
    expect(
      reviewEntry(sampleEntry({ depositThickness: inches('0') }), joint).map((item) => item.code),
    ).toContain('log.no_deposit');
  });

  it('notes an entry the welder signed for themselves', () => {
    const findings = reviewEntry(sampleEntry({ foreman: 'W-118' }), joint);
    expect(findings.map((item) => item.code)).toContain('log.unsigned');
    expect(findings[0]?.severity).toBe('deficiency');
  });
});

describe('what went into a joint', () => {
  const entries = [
    sampleEntry({ id: 'L-1', role: 'root', depositThickness: inches('1/8') }),
    sampleEntry({ id: 'L-2', role: 'fill', depositThickness: inches('1/4') }),
    sampleEntry({ id: 'L-3', role: 'cap', depositThickness: inches('1/8'), stencil: 'W-205' }),
    sampleEntry({ id: 'L-4', role: 'repair', depositThickness: inches('1/16') }),
    sampleEntry({ id: 'L-5', joint: 'J-15', depositThickness: inches('1/2') }),
  ];

  it('adds the runs up and leaves the repairs out', () => {
    expect(depositInJoint(entries, 'J-14')?.toFraction()).toBe('1/2');
  });

  it('reports nothing for a joint with no entries', () => {
    expect(depositInJoint(entries, 'J-99')).toBeUndefined();
  });

  it('lists the welders who worked on it', () => {
    expect(weldersOnJoint(entries, 'J-14')).toEqual(['W-118', 'W-205']);
  });

  it('lists the processes used on it', () => {
    const mixed = [...entries, sampleEntry({ id: 'L-6', process: 'GTAW' })];
    expect(processesOnJoint(mixed, 'J-14')).toEqual(['GTAW', 'SMAW']);
  });
});

describe('tracing a consumable lot forward', () => {
  const entries = [
    sampleEntry({ id: 'L-1', joint: 'J-14', consumableLot: 'LOT-88214' }),
    sampleEntry({ id: 'L-2', joint: 'J-15', consumableLot: 'LOT-88214' }),
    sampleEntry({ id: 'L-3', joint: 'J-16', consumableLot: 'LOT-90001' }),
    sampleEntry({ id: 'L-4', joint: 'J-17', consumable: 'E6010-1/8', consumableLot: 'LOT-88214' }),
  ];

  it('finds every joint a lot went into', () => {
    expect(jointsUsingLot(entries, 'E7018-1/8', 'LOT-88214')).toEqual(['J-14', 'J-15']);
  });

  it('keeps two consumables with the same lot number apart', () => {
    expect(jointsUsingLot(entries, 'E6010-1/8', 'LOT-88214')).toEqual(['J-17']);
  });

  it('finds nothing for a lot nobody used', () => {
    expect(jointsUsingLot(entries, 'E7018-1/8', 'LOT-00000')).toEqual([]);
  });
});

describe('feeding the continuity clock', () => {
  const entries = [
    sampleEntry({ id: 'L-1', weldedOn: date('2024-05-02') }),
    sampleEntry({ id: 'L-2', weldedOn: date('2024-05-02') }),
    sampleEntry({ id: 'L-3', weldedOn: date('2024-06-11') }),
    sampleEntry({ id: 'L-4', weldedOn: date('2024-06-20'), process: 'GTAW' }),
    sampleEntry({ id: 'L-5', weldedOn: date('2024-06-25'), stencil: 'W-205' }),
  ];

  it('gives one date per day, in order', () => {
    expect(usageDates(entries, 'W-118', 'SMAW').map(String)).toEqual(['2024-05-02', '2024-06-11']);
  });

  it('keeps the processes apart', () => {
    expect(usageDates(entries, 'W-118', 'GTAW').map(String)).toEqual(['2024-06-20']);
  });

  it('keeps the welders apart', () => {
    expect(usageDates(entries, 'W-205', 'SMAW').map(String)).toEqual(['2024-06-25']);
  });
});

describe('a window of entries', () => {
  const entries = [
    sampleEntry({ id: 'L-1', weldedOn: date('2024-05-02') }),
    sampleEntry({ id: 'L-2', weldedOn: date('2024-06-11') }),
    sampleEntry({ id: 'L-3', weldedOn: date('2024-07-20') }),
  ];

  it('includes both ends', () => {
    const found = entriesBetween(entries, date('2024-05-02'), date('2024-06-11'));
    expect(found.map((entry) => entry.id)).toEqual(['L-1', 'L-2']);
  });

  it('refuses a window that runs backwards', () => {
    expect(() => entriesBetween(entries, date('2024-07-01'), date('2024-05-01'))).toThrow(
      ValidationError,
    );
  });
});
