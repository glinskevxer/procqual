import { ConflictError, NotFoundError } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import type { PlainDate } from '../core/plainDate.js';
import { parseWith } from '../core/schema.js';
import type { ProcedureQualificationRecord } from '../qualification/pqr.js';
import type { WeldingProcedureSpecification } from '../qualification/wps.js';
import { encodeDate, encodeDocumentNumber, encodeLength, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import {
  encodeProcedure,
  encodeVariables,
  procedureReader,
  variablesReader,
} from './procedureCodec.js';
import { ProjectingStore } from './projectingStore.js';
import { encodeTests, testsReader } from './testResultsCodec.js';

/**
 * Qualification records and procedure specifications.
 *
 * A record is written once and never touched again. That is not a storage
 * decision, it is what a qualification record is: a statement about a coupon
 * that was welded on a particular day, and the coupon does not change. If the
 * numbers were transcribed wrongly the record is superseded by a new one with
 * a note, and the wrong one stays in the file.
 *
 * A procedure is different. It is revised, and every revision is its own
 * document with its own number, so the store holds all of them and the caller
 * says which revision it wants. Asking for a procedure without a revision
 * gives the latest, which is nearly always what a foreman means and almost
 * never what an auditor means.
 */

export const PROCEDURE_EVENTS = [
  'pqr.recorded',
  'pqr.certified',
  'pqr.superseded',
  'wps.issued',
  'wps.withdrawn',
] as const;

export type ProcedureEvent = (typeof PROCEDURE_EVENTS)[number];

const recordReader = readers.record({
  number: readers.documentNumber,
  weldedOn: readers.date,
  weldedBy: readers.text,
  weldType: readers.oneOf(['groove', 'fillet'] as const),
  productForm: readers.oneOf(['plate', 'pipe'] as const),
  baseMetalLeft: readers.text,
  baseMetalRight: readers.text,
  heatLeft: readers.text,
  heatRight: readers.text,
  couponThickness: readers.length,
  outsideDiameter: readers.optional(readers.length),
  layers: readers.array(variablesReader),
  toughnessRequired: readers.boolean,
  tests: testsReader,
  witnessedBy: readers.optional(readers.text),
  certifiedOn: readers.optional(readers.date),
});

const certifiedReader = readers.record({
  number: readers.documentNumber,
  witnessedBy: readers.text,
  certifiedOn: readers.date,
});

const supersededReader = readers.record({
  number: readers.documentNumber,
  by: readers.documentNumber,
  reason: readers.text,
});

const withdrawnReader = readers.record({
  number: readers.documentNumber,
  withdrawnOn: readers.date,
  reason: readers.text,
});

interface Projection {
  records: Map<string, ProcedureQualificationRecord>;
  superseded: Map<string, { by: string; reason: string }>;
  procedures: Map<string, WeldingProcedureSpecification>;
}

function revisionKey(number: DocumentNumber): string {
  return `${number.key()}|${number.revision ?? 0}`;
}

export class ProcedureStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { records: new Map(), superseded: new Map(), procedures: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  recordQualification(record: ProcedureQualificationRecord, actor: string): void {
    const key = record.number.key();
    if (this.projection().records.has(key)) {
      throw new ConflictError(`${key} is already recorded`, { number: key });
    }
    this.write('pqr.recorded', actor, {
      number: encodeDocumentNumber(record.number),
      weldedOn: encodeDate(record.weldedOn),
      weldedBy: record.weldedBy,
      weldType: record.weldType,
      productForm: record.productForm,
      baseMetalLeft: record.baseMetalLeft,
      baseMetalRight: record.baseMetalRight,
      heatLeft: record.heatLeft,
      heatRight: record.heatRight,
      couponThickness: encodeLength(record.couponThickness),
      outsideDiameter:
        record.outsideDiameter === undefined ? null : encodeLength(record.outsideDiameter),
      layers: record.layers.map((layer) => encodeVariables(layer)),
      toughnessRequired: record.toughnessRequired,
      tests: encodeTests(record.tests),
      witnessedBy: record.witnessedBy ?? null,
      certifiedOn: record.certifiedOn === undefined ? null : encodeDate(record.certifiedOn),
    });
  }

  certify(number: DocumentNumber, witnessedBy: string, on: PlainDate, actor: string): void {
    this.requireRecord(number.key());
    this.write('pqr.certified', actor, {
      number: encodeDocumentNumber(number),
      witnessedBy,
      certifiedOn: encodeDate(on),
    });
  }

  supersede(number: DocumentNumber, by: DocumentNumber, reason: string, actor: string): void {
    this.requireRecord(number.key());
    this.write('pqr.superseded', actor, {
      number: encodeDocumentNumber(number),
      by: encodeDocumentNumber(by),
      reason,
    });
  }

  issue(procedure: WeldingProcedureSpecification, actor: string): void {
    const key = revisionKey(procedure.number);
    if (this.projection().procedures.has(key)) {
      throw new ConflictError(`${procedure.number.toString()} has already been issued`, { key });
    }
    this.write('wps.issued', actor, encodeProcedure(procedure));
  }

  withdraw(number: DocumentNumber, on: PlainDate, reason: string, actor: string): void {
    if (!this.projection().procedures.has(revisionKey(number))) {
      throw new NotFoundError('procedure', number.toString());
    }
    this.write('wps.withdrawn', actor, {
      number: encodeDocumentNumber(number),
      withdrawnOn: encodeDate(on),
      reason,
    });
  }

  record(key: string): ProcedureQualificationRecord | undefined {
    return this.projection().records.get(key);
  }

  requireRecord(key: string): ProcedureQualificationRecord {
    const found = this.record(key);
    if (found === undefined) {
      throw new NotFoundError('qualification record', key);
    }
    return found;
  }

  records(): readonly ProcedureQualificationRecord[] {
    return [...this.projection().records.values()].sort((left, right) =>
      left.number.compare(right.number),
    );
  }

  supersededBy(key: string): { by: string; reason: string } | undefined {
    return this.projection().superseded.get(key);
  }

  /** Every revision of every procedure, oldest first. */
  procedures(): readonly WeldingProcedureSpecification[] {
    return [...this.projection().procedures.values()].sort((left, right) =>
      left.number.compare(right.number),
    );
  }

  /** The latest revision of one procedure, or one particular revision. */
  procedure(number: DocumentNumber): WeldingProcedureSpecification | undefined {
    if (number.revision !== undefined) {
      return this.projection().procedures.get(revisionKey(number));
    }
    const revisions = this.procedures().filter((item) => item.number.isSameDocument(number));
    return revisions[revisions.length - 1];
  }

  requireProcedure(number: DocumentNumber): WeldingProcedureSpecification {
    const found = this.procedure(number);
    if (found === undefined) {
      throw new NotFoundError('procedure', number.toString());
    }
    return found;
  }

  /** The records a procedure names, as far as they have been recorded. */
  recordsBehind(procedure: WeldingProcedureSpecification): readonly ProcedureQualificationRecord[] {
    return procedure.supportedBy
      .map((key) => this.record(key))
      .filter((item): item is ProcedureQualificationRecord => item !== undefined);
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'pqr.recorded': {
      const read = orThrow('a qualification record', parseWith(recordReader, entry.payload));
      const { outsideDiameter, witnessedBy, certifiedOn, ...rest } = read;
      projection.records.set(read.number.key(), {
        ...rest,
        ...(outsideDiameter === undefined ? {} : { outsideDiameter }),
        ...(witnessedBy === undefined ? {} : { witnessedBy }),
        ...(certifiedOn === undefined ? {} : { certifiedOn }),
      });
      break;
    }
    case 'pqr.certified': {
      const read = orThrow('a certification', parseWith(certifiedReader, entry.payload));
      const held = projection.records.get(read.number.key());
      if (held !== undefined) {
        projection.records.set(read.number.key(), {
          ...held,
          witnessedBy: read.witnessedBy,
          certifiedOn: read.certifiedOn,
        });
      }
      break;
    }
    case 'pqr.superseded': {
      const read = orThrow('a supersession', parseWith(supersededReader, entry.payload));
      projection.superseded.set(read.number.key(), {
        by: read.by.key(),
        reason: read.reason,
      });
      break;
    }
    case 'wps.issued': {
      const read = orThrow('a procedure', parseWith(procedureReader, entry.payload));
      const { withdrawnOn, ...rest } = read;
      projection.procedures.set(revisionKey(read.number), {
        ...rest,
        ...(withdrawnOn === undefined ? {} : { withdrawnOn }),
      });
      break;
    }
    case 'wps.withdrawn': {
      const read = orThrow('a withdrawal', parseWith(withdrawnReader, entry.payload));
      const key = revisionKey(read.number);
      const held = projection.procedures.get(key);
      if (held !== undefined) {
        projection.procedures.set(key, { ...held, withdrawnOn: read.withdrawnOn });
      }
      break;
    }
    default:
      break;
  }
}
