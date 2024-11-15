import type { ProcessCode } from '../codes/process.js';
import { ConflictError, NotFoundError } from '../core/errors.js';
import { type DocumentNumber } from '../core/identifier.js';
import type { PlainDate } from '../core/plainDate.js';
import { parseWith } from '../core/schema.js';
import type { RegisterEntry } from '../personnel/register.js';
import {
  normaliseStencil,
  type PerformanceQualification,
  type Welder,
} from '../personnel/welder.js';
import { encodeDate, encodeDocumentNumber, encodeLength, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * Welders and their coupons, held as events.
 *
 * The projection is rebuilt from the journal rather than kept alongside it.
 * That is slower and it is the point: there is exactly one place the truth
 * lives, and a projection that has drifted from the journal is a bug that
 * shows up immediately rather than a quiet difference between what the screen
 * says and what the record says.
 *
 * Usage days are their own event because they arrive constantly and from a
 * different direction. A weld log entry is a use, a coupon is a use, and both
 * restart the continuity clock without changing anything else.
 */

export const PERSONNEL_EVENTS = [
  'welder.registered',
  'welder.left',
  'wpq.recorded',
  'wpq.revoked',
  'process.used',
] as const;

export type PersonnelEvent = (typeof PERSONNEL_EVENTS)[number];

interface Projection {
  welders: Map<string, Welder>;
  qualifications: Map<string, { qualification: PerformanceQualification; couponPNumber: string }>;
  uses: Map<string, PlainDate[]>;
}

const welderReader = readers.record({
  stencil: readers.text,
  name: readers.text,
  employedFrom: readers.date,
});

const leavingReader = readers.record({ stencil: readers.text, employedUntil: readers.date });

const qualificationReader = readers.record({
  number: readers.documentNumber,
  stencil: readers.text,
  weldedOn: readers.date,
  process: readers.oneOf(['SMAW', 'GTAW', 'GMAW', 'FCAW', 'SAW', 'PAW'] as const),
  weldType: readers.oneOf(['groove', 'fillet'] as const),
  productForm: readers.oneOf(['plate', 'pipe'] as const),
  position: readers.text,
  verticalProgression: readers.oneOf(['uphill', 'downhill', 'not-applicable'] as const),
  fNumber: readers.integer,
  backing: readers.boolean,
  depositThickness: readers.length,
  layers: readers.integer,
  outsideDiameter: readers.optional(readers.length),
  testMethod: readers.oneOf(['bend', 'radiograph', 'macro'] as const),
  passed: readers.boolean,
  witnessedBy: readers.text,
  couponPNumber: readers.text,
});

const revocationReader = readers.record({
  number: readers.documentNumber,
  revokedOn: readers.date,
  revokedReason: readers.text,
});

const useReader = readers.record({
  stencil: readers.text,
  process: readers.oneOf(['SMAW', 'GTAW', 'GMAW', 'FCAW', 'SAW', 'PAW'] as const),
  on: readers.date,
});

export class PersonnelStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { welders: new Map(), qualifications: new Map(), uses: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    applyEntry(projection, entry);
  }

  registerWelder(welder: Welder, actor: string): Welder {
    const stencil = normaliseStencil(welder.stencil);
    if (this.welder(stencil) !== undefined) {
      throw new ConflictError(`${stencil} is already on the register`, { stencil });
    }
    this.write('welder.registered', actor, {
      stencil,
      name: welder.name,
      employedFrom: encodeDate(welder.employedFrom),
    });
    return { ...welder, stencil };
  }

  recordLeaving(stencil: string, on: PlainDate, actor: string): void {
    const key = normaliseStencil(stencil);
    this.requireWelder(key);
    this.write('welder.left', actor, { stencil: key, employedUntil: encodeDate(on) });
  }

  recordQualification(
    qualification: PerformanceQualification,
    couponPNumber: string,
    actor: string,
  ): void {
    const stencil = normaliseStencil(qualification.stencil);
    this.requireWelder(stencil);
    const key = qualification.number.key();
    if (this.projection().qualifications.has(key)) {
      throw new ConflictError(`${key} is already recorded`, { number: key });
    }
    this.write('wpq.recorded', actor, {
      number: encodeDocumentNumber(qualification.number),
      stencil,
      weldedOn: encodeDate(qualification.weldedOn),
      process: qualification.process,
      weldType: qualification.weldType,
      productForm: qualification.productForm,
      position: qualification.position,
      verticalProgression: qualification.verticalProgression,
      fNumber: qualification.fNumber,
      backing: qualification.backing,
      depositThickness: encodeLength(qualification.depositThickness),
      layers: qualification.layers,
      outsideDiameter:
        qualification.outsideDiameter === undefined
          ? null
          : encodeLength(qualification.outsideDiameter),
      testMethod: qualification.testMethod,
      passed: qualification.passed,
      witnessedBy: qualification.witnessedBy,
      couponPNumber,
    });
  }

  revoke(number: DocumentNumber, on: PlainDate, reason: string, actor: string): void {
    const key = number.key();
    if (!this.projection().qualifications.has(key)) {
      throw new NotFoundError('qualification', key);
    }
    this.write('wpq.revoked', actor, {
      number: encodeDocumentNumber(number),
      revokedOn: encodeDate(on),
      revokedReason: reason,
    });
  }

  recordUse(stencil: string, process: ProcessCode, on: PlainDate, actor: string): void {
    const key = normaliseStencil(stencil);
    this.requireWelder(key);
    this.write('process.used', actor, { stencil: key, process, on: encodeDate(on) });
  }

  welder(stencil: string): Welder | undefined {
    return this.projection().welders.get(normaliseStencil(stencil));
  }

  requireWelder(stencil: string): Welder {
    const found = this.welder(stencil);
    if (found === undefined) {
      throw new NotFoundError('welder', stencil);
    }
    return found;
  }

  welders(): readonly Welder[] {
    return [...this.projection().welders.values()].sort((left, right) =>
      left.stencil.localeCompare(right.stencil),
    );
  }

  entries(): readonly RegisterEntry[] {
    const projection = this.projection();
    return [...projection.qualifications.values()]
      .map(({ qualification, couponPNumber }) => ({
        qualification,
        couponPNumber,
        usageDates: projection.uses.get(useKey(qualification.stencil, qualification.process)) ?? [],
      }))
      .sort((left, right) => left.qualification.number.compare(right.qualification.number));
  }

  entriesFor(stencil: string): readonly RegisterEntry[] {
    const key = normaliseStencil(stencil);
    return this.entries().filter((entry) => entry.qualification.stencil === key);
  }
}

function applyEntry(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'welder.registered': {
      const read = orThrow('a welder', parseWith(welderReader, entry.payload));
      projection.welders.set(read.stencil, read);
      break;
    }
    case 'welder.left': {
      const read = orThrow('a leaving date', parseWith(leavingReader, entry.payload));
      const existing = projection.welders.get(read.stencil);
      if (existing !== undefined) {
        projection.welders.set(read.stencil, {
          ...existing,
          employedUntil: read.employedUntil,
        });
      }
      break;
    }
    case 'wpq.recorded': {
      const read = orThrow('a qualification', parseWith(qualificationReader, entry.payload));
      const { couponPNumber, position, ...rest } = read;
      const qualification: PerformanceQualification = {
        ...rest,
        position: position as PerformanceQualification['position'],
      };
      projection.qualifications.set(qualification.number.key(), {
        qualification,
        couponPNumber,
      });
      break;
    }
    case 'wpq.revoked': {
      const read = orThrow('a revocation', parseWith(revocationReader, entry.payload));
      const key = read.number.key();
      const held = projection.qualifications.get(key);
      if (held !== undefined) {
        projection.qualifications.set(key, {
          ...held,
          qualification: {
            ...held.qualification,
            revokedOn: read.revokedOn,
            revokedReason: read.revokedReason,
          },
        });
      }
      break;
    }
    case 'process.used': {
      const read = orThrow('a use', parseWith(useReader, entry.payload));
      const key = useKey(read.stencil, read.process);
      const days = projection.uses.get(key) ?? [];
      days.push(read.on);
      projection.uses.set(key, days);
      break;
    }
    default:
      break;
  }
}

function useKey(stencil: string, process: ProcessCode): string {
  return `${stencil}|${process}`;
}
