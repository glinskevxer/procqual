import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { ProcedureStore } from '../../../src/store/procedureStore.js';
import { samplePqr } from '../../support/pqr.js';
import { passingBends, passingTensiles } from '../../support/specimens.js';
import { sampleWps } from '../../support/wps.js';

let journal: MemoryJournal;
let store: ProcedureStore;

beforeEach(() => {
  journal = new MemoryJournal();
  store = new ProcedureStore(journal, new FixedClock('2024-10-10T09:00:00.000Z'));
});

describe('qualification records', () => {
  it('records one and reads it back whole', () => {
    const original = samplePqr({
      tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    });
    store.recordQualification(original, 'kd');
    const read = store.requireRecord('PQR-0042');
    expect(read.weldedBy).toBe('W-118');
    expect(read.couponThickness.toFraction()).toBe('3/8');
    expect(read.layers[0]?.filler.classification).toBe('E7018');
    expect(read.tests.tensile).toHaveLength(2);
    expect(read.certifiedOn?.toString()).toBe('2024-03-11');
  });

  it('keeps a pipe coupon diameter and leaves it off a plate one', () => {
    store.recordQualification(
      samplePqr({ productForm: 'pipe', outsideDiameter: inches('6') }),
      'kd',
    );
    expect(store.requireRecord('PQR-0042').outsideDiameter?.toFraction()).toBe('6');
    store.recordQualification(samplePqr({ number: DocumentNumber.parse('PQR-0043') }), 'kd');
    expect(store.requireRecord('PQR-0043').outsideDiameter).toBeUndefined();
  });

  it('refuses the same record twice', () => {
    store.recordQualification(samplePqr(), 'kd');
    expect(() => store.recordQualification(samplePqr(), 'kd')).toThrow(ConflictError);
  });

  it('refuses to answer for one nobody recorded', () => {
    expect(() => store.requireRecord('PQR-9999')).toThrow(NotFoundError);
    expect(store.record('PQR-9999')).toBeUndefined();
  });

  it('certifies one after the fact without rewriting it', () => {
    store.recordQualification(samplePqr({ witnessedBy: undefined, certifiedOn: undefined }), 'kd');
    store.certify(DocumentNumber.parse('PQR-0042'), 'QA-3', date('2024-04-01'), 'qa');
    const read = store.requireRecord('PQR-0042');
    expect(read.witnessedBy).toBe('QA-3');
    expect(read.certifiedOn?.toString()).toBe('2024-04-01');
    expect(journal.read().map((entry) => entry.type)).toEqual(['pqr.recorded', 'pqr.certified']);
  });

  it('supersedes one and keeps the wrong one on the file', () => {
    store.recordQualification(samplePqr(), 'kd');
    store.supersede(
      DocumentNumber.parse('PQR-0042'),
      DocumentNumber.parse('PQR-0055'),
      'tensile loads transcribed wrongly',
      'qa',
    );
    expect(store.record('PQR-0042')).toBeDefined();
    expect(store.supersededBy('PQR-0042')?.by).toBe('PQR-0055');
    expect(store.supersededBy('PQR-0043')).toBeUndefined();
  });

  it('lists records in number order', () => {
    store.recordQualification(samplePqr({ number: DocumentNumber.parse('PQR-0100') }), 'kd');
    store.recordQualification(samplePqr(), 'kd');
    expect(store.records().map((item) => item.number.key())).toEqual(['PQR-0042', 'PQR-0100']);
  });
});

describe('procedures', () => {
  it('issues one and reads it back', () => {
    store.issue(sampleWps(), 'engineer');
    const read = store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 0'));
    expect(read.title).toContain('carbon steel shell seams');
    expect(read.layers[0]?.fNumbers).toEqual([4]);
  });

  it('keeps every revision as its own document', () => {
    store.issue(sampleWps(), 'engineer');
    store.issue(
      sampleWps({
        number: DocumentNumber.parse('WPS-0110 Rev 1'),
        title: 'reworded',
        issuedOn: date('2024-06-01'),
      }),
      'engineer',
    );
    expect(store.procedures()).toHaveLength(2);
    expect(store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 0')).title).toContain(
      'carbon steel',
    );
    expect(store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 1')).title).toBe('reworded');
  });

  it('gives the latest revision when none is asked for', () => {
    store.issue(sampleWps(), 'engineer');
    store.issue(
      sampleWps({ number: DocumentNumber.parse('WPS-0110 Rev 1'), title: 'reworded' }),
      'engineer',
    );
    expect(store.procedure(DocumentNumber.parse('WPS-0110'))?.title).toBe('reworded');
  });

  it('refuses the same revision twice', () => {
    store.issue(sampleWps(), 'engineer');
    expect(() => store.issue(sampleWps(), 'engineer')).toThrow(ConflictError);
  });

  it('withdraws one revision without touching the others', () => {
    store.issue(sampleWps(), 'engineer');
    store.issue(sampleWps({ number: DocumentNumber.parse('WPS-0110 Rev 1') }), 'engineer');
    store.withdraw(
      DocumentNumber.parse('WPS-0110 Rev 0'),
      date('2024-06-01'),
      'replaced by revision one',
      'engineer',
    );
    expect(
      store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 0')).withdrawnOn?.toString(),
    ).toBe('2024-06-01');
    expect(
      store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 1')).withdrawnOn,
    ).toBeUndefined();
  });

  it('refuses to withdraw one nobody issued', () => {
    expect(() =>
      store.withdraw(DocumentNumber.parse('WPS-9999 Rev 0'), date('2024-06-01'), 'x', 'kd'),
    ).toThrow(NotFoundError);
  });
});

describe('the records behind a procedure', () => {
  it('finds the ones that have been recorded', () => {
    store.recordQualification(samplePqr(), 'kd');
    store.issue(sampleWps({ supportedBy: ['PQR-0042', 'PQR-9999'] }), 'engineer');
    const procedure = store.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 0'));
    expect(store.recordsBehind(procedure).map((item) => item.number.key())).toEqual(['PQR-0042']);
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    store.recordQualification(samplePqr(), 'kd');
    store.issue(sampleWps(), 'engineer');
    store.withdraw(DocumentNumber.parse('WPS-0110 Rev 0'), date('2025-01-01'), 'x', 'kd');
    const rebuilt = new ProcedureStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2025-02-01T09:00:00.000Z'),
    );
    expect(rebuilt.records()).toHaveLength(1);
    expect(
      rebuilt.requireProcedure(DocumentNumber.parse('WPS-0110 Rev 0')).withdrawnOn?.toString(),
    ).toBe('2025-01-01');
  });
});
