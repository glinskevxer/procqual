import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import type { Repair } from '../../../src/nde/repair.js';
import { ExaminationStore } from '../../../src/store/examinationStore.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { sampleExamination, sampleTechnician } from '../../support/nde.js';

let journal: MemoryJournal;
let store: ExaminationStore;

const repair = (overrides: Partial<Repair> = {}): Repair => ({
  id: 'R-77',
  joint: 'J-14',
  raisedBy: 'X-4410',
  method: 'RT',
  defect: 'slag',
  attempt: 1,
  excavationLength: inches('4'),
  excavationDepth: inches('1/8'),
  jointThickness: inches('1/2'),
  excavatedOn: date('2024-11-08'),
  rewelderStencil: 'W-118',
  ...overrides,
});

beforeEach(() => {
  journal = new MemoryJournal();
  store = new ExaminationStore(journal, new FixedClock('2024-11-10T09:00:00.000Z'));
});

describe('technicians', () => {
  it('registers one and reads them back', () => {
    store.registerTechnician(sampleTechnician(), 'qa');
    expect(store.technician('J Pilling')?.level).toBe('II');
    expect(store.technicians()).toHaveLength(1);
  });

  it('lets a renewal replace the earlier certification', () => {
    store.registerTechnician(sampleTechnician(), 'qa');
    store.registerTechnician(sampleTechnician({ certifiedUntil: date('2029-03-31') }), 'qa');
    expect(store.technician('J Pilling')?.certifiedUntil.toString()).toBe('2029-03-31');
    expect(store.technicians()).toHaveLength(1);
  });

  it('reports nothing for somebody nobody registered', () => {
    expect(store.technician('nobody')).toBeUndefined();
  });
});

describe('examinations', () => {
  it('files one and reads it back whole', () => {
    store.file(
      sampleExamination({
        indications: [
          { type: 'slag', size: inches('1/8'), fromDatum: inches('12'), note: 'mid seam' },
        ],
      }),
      'qa',
    );
    const read = store.requireExamination('X-4410');
    expect(read.method).toBe('RT');
    expect(read.coverage.toFraction()).toBe('96');
    expect(read.indications[0]?.note).toBe('mid seam');
    expect(read.indications[0]?.throughWallDepth).toBeUndefined();
  });

  it('keeps the technician as they stood, not as they are now', () => {
    store.file(sampleExamination(), 'qa');
    store.registerTechnician(sampleTechnician({ level: 'I' }), 'qa');
    expect(store.requireExamination('X-4410').technician.level).toBe('II');
    expect(store.technician('J Pilling')?.level).toBe('I');
  });

  it('refuses the same report twice', () => {
    store.file(sampleExamination(), 'qa');
    expect(() => store.file(sampleExamination(), 'qa')).toThrow(ConflictError);
  });

  it('filters by joint', () => {
    store.file(sampleExamination(), 'qa');
    store.file(sampleExamination({ id: 'X-4411', joint: 'J-15' }), 'qa');
    expect(store.examinations('J-15').map((item) => item.id)).toEqual(['X-4411']);
    expect(store.examinations()).toHaveLength(2);
  });

  it('refuses one nobody filed', () => {
    expect(() => store.requireExamination('X-9999')).toThrow(NotFoundError);
  });
});

describe('repairs', () => {
  it('raises one and reads it back', () => {
    store.raiseRepair(repair(), 'qa');
    const read = store.requireRepair('R-77');
    expect(read.attempt).toBe(1);
    expect(read.excavationLength.toFraction()).toBe('4');
    expect(read.reweldedOn).toBeUndefined();
    expect(read.engineeringApproval).toBeUndefined();
  });

  it('keeps the approval when there is one', () => {
    store.raiseRepair(repair({ attempt: 2, engineeringApproval: 'DE-118' }), 'qa');
    expect(store.requireRepair('R-77').engineeringApproval).toBe('DE-118');
  });

  it('records the reweld and the closure as their own events', () => {
    store.raiseRepair(repair(), 'qa');
    store.recordReweld('R-77', 'W-205', date('2024-11-09'), 'foreman');
    store.closeRepair('R-77', 'X-4470', 'qa');
    const read = store.requireRepair('R-77');
    expect(read.reweldedOn?.toString()).toBe('2024-11-09');
    expect(read.rewelderStencil).toBe('W-205');
    expect(read.reExaminedBy).toBe('X-4470');
    expect(journal.length()).toBe(3);
  });

  it('refuses a reweld or a closure against a repair nobody raised', () => {
    expect(() => store.recordReweld('R-99', 'W-118', date('2024-11-09'), 'kd')).toThrow(
      NotFoundError,
    );
    expect(() => store.closeRepair('R-99', 'X-1', 'kd')).toThrow(NotFoundError);
  });

  it('refuses the same repair twice and filters by joint', () => {
    store.raiseRepair(repair(), 'qa');
    expect(() => store.raiseRepair(repair(), 'qa')).toThrow(ConflictError);
    store.raiseRepair(repair({ id: 'R-78', joint: 'J-15' }), 'qa');
    expect(store.repairs('J-14').map((item) => item.id)).toEqual(['R-77']);
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    store.registerTechnician(sampleTechnician(), 'qa');
    store.file(sampleExamination(), 'qa');
    store.raiseRepair(repair(), 'qa');
    store.recordReweld('R-77', 'W-205', date('2024-11-09'), 'foreman');
    const rebuilt = new ExaminationStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2025-01-01T09:00:00.000Z'),
    );
    expect(rebuilt.technicians()).toHaveLength(1);
    expect(rebuilt.examinations()).toHaveLength(1);
    expect(rebuilt.requireRepair('R-77').rewelderStencil).toBe('W-205');
  });
});
