import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import { FabricationStore } from '../../../src/store/fabricationStore.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleEntry } from '../../support/weldLog.js';

let journal: MemoryJournal;
let store: FabricationStore;

beforeEach(() => {
  journal = new MemoryJournal();
  store = new FabricationStore(journal, new FixedClock('2024-09-15T09:00:00.000Z'));
});

describe('mapping joints', () => {
  it('records one and reads it back whole', () => {
    store.mapJoint(sampleJoint(), 'kd');
    const joint = store.joint('J-14');
    expect(joint?.category).toBe('A');
    expect(joint?.type).toBe(1);
    expect(joint?.thickness.toFraction()).toBe('1/2');
    expect(joint?.procedure.key()).toBe('WPS-0110');
    expect(joint?.outsideDiameter).toBeUndefined();
  });

  it('keeps a pipe diameter', () => {
    store.mapJoint(sampleJoint({ productForm: 'pipe', outsideDiameter: inches('6') }), 'kd');
    expect(store.joint('J-14')?.outsideDiameter?.toFraction()).toBe('6');
  });

  it('refuses the same joint twice', () => {
    store.mapJoint(sampleJoint(), 'kd');
    expect(() => store.mapJoint(sampleJoint(), 'kd')).toThrow(ConflictError);
  });

  it('lists them in order and filters by vessel', () => {
    store.mapJoint(sampleJoint({ id: 'J-20' }), 'kd');
    store.mapJoint(sampleJoint({ id: 'J-14' }), 'kd');
    store.mapJoint(sampleJoint({ id: 'J-30', vessel: 'V-3300' }), 'kd');
    expect(store.joints().map((joint) => joint.id)).toEqual(['J-14', 'J-20', 'J-30']);
    expect(store.joints('V-3300').map((joint) => joint.id)).toEqual(['J-30']);
  });

  it('refuses to answer for a joint nobody mapped', () => {
    expect(() => store.requireJoint('J-99')).toThrow(NotFoundError);
    expect(store.joint('J-99')).toBeUndefined();
  });
});

describe('changing the examination level', () => {
  beforeEach(() => {
    store.mapJoint(sampleJoint(), 'kd');
  });

  it('is its own event rather than an edit', () => {
    store.changeExaminationLevel('J-14', 'spot', 'client agreed the reduction', 'engineer');
    expect(store.joint('J-14')?.radiography).toBe('spot');
    expect(journal.read().map((entry) => entry.type)).toEqual([
      'joint.mapped',
      'joint.examination_level_changed',
    ]);
    expect(journal.read()[1]?.payload.reason).toBe('client agreed the reduction');
  });

  it('refuses a joint nobody mapped', () => {
    expect(() => store.changeExaminationLevel('J-99', 'spot', 'x', 'kd')).toThrow(NotFoundError);
  });
});

describe('the weld log', () => {
  beforeEach(() => {
    store.mapJoint(sampleJoint(), 'kd');
  });

  it('records an entry against a mapped joint', () => {
    store.logWeld(sampleEntry(), 'foreman');
    const entry = store.entries()[0];
    expect(entry?.id).toBe('L-1001');
    expect(entry?.depositThickness.toFraction()).toBe('1/4');
    expect(entry?.weldedOn.toString()).toBe('2024-07-02');
  });

  it('refuses an entry against a joint that is not on the map', () => {
    expect(() => store.logWeld(sampleEntry({ joint: 'J-99' }), 'foreman')).toThrow(NotFoundError);
  });

  it('refuses the same entry number twice', () => {
    store.logWeld(sampleEntry(), 'foreman');
    expect(() => store.logWeld(sampleEntry(), 'foreman')).toThrow(ConflictError);
  });

  it('filters by joint', () => {
    store.mapJoint(sampleJoint({ id: 'J-15' }), 'kd');
    store.logWeld(sampleEntry(), 'foreman');
    store.logWeld(sampleEntry({ id: 'L-1002', joint: 'J-15' }), 'foreman');
    expect(store.entries('J-15').map((entry) => entry.id)).toEqual(['L-1002']);
  });
});

describe('voiding an entry', () => {
  beforeEach(() => {
    store.mapJoint(sampleJoint(), 'kd');
    store.logWeld(sampleEntry(), 'foreman');
    store.logWeld(sampleEntry({ id: 'L-1002' }), 'foreman');
  });

  it('takes it out of the live list and leaves both facts on the record', () => {
    store.voidEntry('L-1001', 'logged against the wrong joint', 'qa');
    expect(store.entries().map((entry) => entry.id)).toEqual(['L-1002']);
    expect(store.voidedEntries()[0]?.reason).toBe('logged against the wrong joint');
    expect(journal.read().map((entry) => entry.type)).toContain('weld.logged');
    expect(journal.length()).toBe(4);
  });

  it('refuses to void an entry nobody logged', () => {
    expect(() => store.voidEntry('L-9999', 'x', 'qa')).toThrow(NotFoundError);
  });

  it('leaves a voided entry out of the usage dates', () => {
    store.voidEntry('L-1001', 'x', 'qa');
    store.voidEntry('L-1002', 'x', 'qa');
    expect(store.usageDates('W-118', 'SMAW')).toEqual([]);
  });
});

describe('the usage dates', () => {
  beforeEach(() => {
    store.mapJoint(sampleJoint(), 'kd');
    store.logWeld(sampleEntry({ id: 'L-1', weldedOn: date('2024-07-02') }), 'foreman');
    store.logWeld(sampleEntry({ id: 'L-2', weldedOn: date('2024-07-02') }), 'foreman');
    store.logWeld(sampleEntry({ id: 'L-3', weldedOn: date('2024-08-11') }), 'foreman');
    store.logWeld(sampleEntry({ id: 'L-4', process: 'GTAW' }), 'foreman');
  });

  it('gives one date per day for one process', () => {
    expect(store.usageDates('W-118', 'SMAW').map(String)).toEqual(['2024-07-02', '2024-08-11']);
  });

  it('keeps the processes apart', () => {
    expect(store.usageDates('W-118', 'GTAW')).toHaveLength(1);
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    store.mapJoint(sampleJoint(), 'kd');
    store.logWeld(sampleEntry(), 'foreman');
    store.changeExaminationLevel('J-14', 'none', 'client change', 'engineer');
    const rebuilt = new FabricationStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2024-10-01T09:00:00.000Z'),
    );
    expect(rebuilt.joint('J-14')?.radiography).toBe('none');
    expect(rebuilt.entries()).toHaveLength(1);
  });
});
