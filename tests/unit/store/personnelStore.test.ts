import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { PersonnelStore } from '../../../src/store/personnelStore.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';

let journal: MemoryJournal;
let store: PersonnelStore;

beforeEach(() => {
  journal = new MemoryJournal();
  store = new PersonnelStore(journal, new FixedClock('2024-06-25T09:00:00.000Z'));
});

describe('registering a welder', () => {
  it('puts them on the register and writes one entry', () => {
    store.registerWelder(sampleWelder(), 'kd');
    expect(store.welder('W-118')?.name).toBe('R Ashworth');
    expect(journal.length()).toBe(1);
    expect(journal.read()[0]?.type).toBe('welder.registered');
  });

  it('normalises the stencil on the way in and on the way out', () => {
    store.registerWelder(sampleWelder({ stencil: 'w118' }), 'kd');
    expect(store.welder('W-118')).toBeDefined();
    expect(store.welder('w-118')).toBeDefined();
  });

  it('refuses the same stencil twice', () => {
    store.registerWelder(sampleWelder(), 'kd');
    expect(() => store.registerWelder(sampleWelder(), 'kd')).toThrow(ConflictError);
  });

  it('lists welders in stencil order', () => {
    store.registerWelder(sampleWelder({ stencil: 'W-205' }), 'kd');
    store.registerWelder(sampleWelder({ stencil: 'W-090' }), 'kd');
    expect(store.welders().map((welder) => welder.stencil)).toEqual(['W-090', 'W-205']);
  });
});

describe('leaving', () => {
  it('records the leaving date on the welder', () => {
    store.registerWelder(sampleWelder(), 'kd');
    store.recordLeaving('W-118', date('2024-08-31'), 'kd');
    expect(store.welder('W-118')?.employedUntil?.toString()).toBe('2024-08-31');
  });

  it('refuses a stencil nobody holds', () => {
    expect(() => store.recordLeaving('W-999', date('2024-08-31'), 'kd')).toThrow(NotFoundError);
  });
});

describe('qualifications', () => {
  beforeEach(() => {
    store.registerWelder(sampleWelder(), 'kd');
  });

  it('records one and reads it back whole', () => {
    store.recordQualification(sampleQualification(), '1', 'kd');
    const entry = store.entries()[0];
    expect(entry?.qualification.number.key()).toBe('WPQ-0231');
    expect(entry?.qualification.depositThickness.toFraction()).toBe('3/8');
    expect(entry?.couponPNumber).toBe('1');
    expect(entry?.qualification.outsideDiameter).toBeUndefined();
  });

  it('keeps the diameter of a pipe coupon', () => {
    store.recordQualification(
      sampleQualification({ productForm: 'pipe', outsideDiameter: inches('6') }),
      '1',
      'kd',
    );
    expect(store.entries()[0]?.qualification.outsideDiameter?.toFraction()).toBe('6');
  });

  it('refuses a coupon for a welder nobody has registered', () => {
    expect(() =>
      store.recordQualification(sampleQualification({ stencil: 'W-999' }), '1', 'kd'),
    ).toThrow(NotFoundError);
  });

  it('refuses the same coupon number twice', () => {
    store.recordQualification(sampleQualification(), '1', 'kd');
    expect(() => store.recordQualification(sampleQualification(), '1', 'kd')).toThrow(
      ConflictError,
    );
  });

  it('lists coupons in number order', () => {
    store.recordQualification(
      sampleQualification({ number: DocumentNumber.parse('WPQ-0400') }),
      '1',
      'kd',
    );
    store.recordQualification(sampleQualification(), '1', 'kd');
    expect(store.entries().map((entry) => entry.qualification.number.key())).toEqual([
      'WPQ-0231',
      'WPQ-0400',
    ]);
  });

  it('filters by welder', () => {
    store.registerWelder(sampleWelder({ stencil: 'W-205' }), 'kd');
    store.recordQualification(sampleQualification(), '1', 'kd');
    store.recordQualification(
      sampleQualification({ number: DocumentNumber.parse('WPQ-0400'), stencil: 'W-205' }),
      '1',
      'kd',
    );
    expect(store.entriesFor('W-205')).toHaveLength(1);
    expect(store.entriesFor('W-118')[0]?.qualification.number.key()).toBe('WPQ-0231');
  });
});

describe('revocation', () => {
  beforeEach(() => {
    store.registerWelder(sampleWelder(), 'kd');
    store.recordQualification(sampleQualification(), '1', 'kd');
  });

  it('lands on the qualification without rewriting the original entry', () => {
    store.revoke(DocumentNumber.parse('WPQ-0231'), date('2024-05-01'), 'repair rate', 'qa');
    const qualification = store.entries()[0]?.qualification;
    expect(qualification?.revokedOn?.toString()).toBe('2024-05-01');
    expect(qualification?.revokedReason).toBe('repair rate');
    expect(journal.read()[1]?.type).toBe('wpq.recorded');
    expect(journal.length()).toBe(3);
  });

  it('refuses a coupon nobody recorded', () => {
    expect(() =>
      store.revoke(DocumentNumber.parse('WPQ-9999'), date('2024-05-01'), 'x', 'qa'),
    ).toThrow(NotFoundError);
  });
});

describe('uses', () => {
  beforeEach(() => {
    store.registerWelder(sampleWelder(), 'kd');
    store.recordQualification(sampleQualification(), '1', 'kd');
  });

  it('gathers the days a welder ran the process', () => {
    store.recordUse('W-118', 'SMAW', date('2024-04-02'), 'foreman');
    store.recordUse('W-118', 'SMAW', date('2024-05-20'), 'foreman');
    expect(store.entries()[0]?.usageDates.map(String)).toEqual(['2024-04-02', '2024-05-20']);
  });

  it('keeps the processes apart', () => {
    store.recordUse('W-118', 'GTAW', date('2024-05-20'), 'foreman');
    expect(store.entries()[0]?.usageDates).toEqual([]);
  });

  it('refuses a use for a welder nobody holds', () => {
    expect(() => store.recordUse('W-999', 'SMAW', date('2024-05-20'), 'foreman')).toThrow(
      NotFoundError,
    );
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal rather than kept beside it', () => {
    store.registerWelder(sampleWelder(), 'kd');
    store.recordQualification(sampleQualification(), '1', 'kd');
    const rebuilt = new PersonnelStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2024-07-01T09:00:00.000Z'),
    );
    expect(rebuilt.welders().map((welder) => welder.stencil)).toEqual(['W-118']);
    expect(rebuilt.entries()).toHaveLength(1);
  });

  it('ignores an entry type it does not know, so an older journal still reads', () => {
    journal.append({
      type: 'something.else',
      actor: 'kd',
      payload: { anything: true },
      at: '2024-06-25T09:00:00.000Z',
    });
    store.registerWelder(sampleWelder(), 'kd');
    expect(store.welders()).toHaveLength(1);
  });
});
