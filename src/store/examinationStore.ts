import { ConflictError, NotFoundError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { parseWith } from '../core/schema.js';
import type { Examination, Technician } from '../nde/examination.js';
import type { Repair } from '../nde/repair.js';
import { encodeDate, encodeLength, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * Examinations and repairs.
 *
 * Technicians are held separately from the examinations they signed, and that
 * is worth explaining. A certification runs out and gets renewed, and an
 * examination signed in 2023 was signed by whoever that person was in 2023.
 * If the examination carried a reference to a technician record that later
 * changed, a report that was properly signed at the time would start reading
 * as improperly signed the moment the certification lapsed. So the technician
 * as they stood is copied onto the examination and the register is only used
 * for looking people up before the work.
 */

export const EXAMINATION_EVENTS = [
  'technician.registered',
  'examination.filed',
  'repair.raised',
  'repair.rewelded',
  'repair.closed',
] as const;

export type ExaminationEvent = (typeof EXAMINATION_EVENTS)[number];

const methods = ['RT', 'UT', 'MT', 'PT', 'VT'] as const;

const technicianReader = readers.record({
  name: readers.text,
  level: readers.oneOf(['I', 'II', 'III'] as const),
  methods: readers.array(readers.oneOf(methods)),
  certifiedUntil: readers.date,
});

const indicationReader = readers.record({
  type: readers.oneOf([
    'crack',
    'incomplete-fusion',
    'incomplete-penetration',
    'slag',
    'porosity',
    'undercut',
    'geometric',
  ] as const),
  size: readers.length,
  fromDatum: readers.length,
  throughWallDepth: readers.optional(readers.length),
  note: readers.optional(readers.text),
});

const examinationReader = readers.record({
  id: readers.text,
  joint: readers.text,
  method: readers.oneOf(methods),
  extent: readers.oneOf(['full', 'spot', 'partial', 'none'] as const),
  performedOn: readers.date,
  technician: technicianReader,
  reportNumber: readers.text,
  coverage: readers.length,
  indications: readers.array(indicationReader),
  afterHeatTreatment: readers.boolean,
});

const repairReader = readers.record({
  id: readers.text,
  joint: readers.text,
  raisedBy: readers.text,
  method: readers.oneOf(methods),
  defect: readers.oneOf([
    'crack',
    'incomplete-fusion',
    'incomplete-penetration',
    'slag',
    'porosity',
    'undercut',
    'geometric',
  ] as const),
  attempt: readers.integer,
  excavationLength: readers.length,
  excavationDepth: readers.length,
  jointThickness: readers.length,
  excavatedOn: readers.date,
  rewelderStencil: readers.text,
  engineeringApproval: readers.optional(readers.text),
});

const reweldReader = readers.record({
  id: readers.text,
  reweldedOn: readers.date,
  rewelderStencil: readers.text,
});

const closeReader = readers.record({ id: readers.text, reExaminedBy: readers.text });

interface Projection {
  technicians: Map<string, Technician>;
  examinations: Map<string, Examination>;
  repairs: Map<string, Repair>;
}

export class ExaminationStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { technicians: new Map(), examinations: new Map(), repairs: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  registerTechnician(technician: Technician, actor: string): void {
    this.write('technician.registered', actor, {
      name: technician.name,
      level: technician.level,
      methods: [...technician.methods],
      certifiedUntil: encodeDate(technician.certifiedUntil),
    });
  }

  technician(name: string): Technician | undefined {
    return this.projection().technicians.get(name);
  }

  technicians(): readonly Technician[] {
    return [...this.projection().technicians.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  file(examination: Examination, actor: string): void {
    if (this.projection().examinations.has(examination.id)) {
      throw new ConflictError(`${examination.id} is already filed`, { id: examination.id });
    }
    this.write('examination.filed', actor, {
      id: examination.id,
      joint: examination.joint,
      method: examination.method,
      extent: examination.extent,
      performedOn: encodeDate(examination.performedOn),
      technician: {
        name: examination.technician.name,
        level: examination.technician.level,
        methods: [...examination.technician.methods],
        certifiedUntil: encodeDate(examination.technician.certifiedUntil),
      },
      reportNumber: examination.reportNumber,
      coverage: encodeLength(examination.coverage),
      indications: examination.indications.map((item) => ({
        type: item.type,
        size: encodeLength(item.size),
        fromDatum: encodeLength(item.fromDatum),
        throughWallDepth:
          item.throughWallDepth === undefined ? null : encodeLength(item.throughWallDepth),
        note: item.note ?? null,
      })),
      afterHeatTreatment: examination.afterHeatTreatment,
    });
  }

  raiseRepair(repair: Repair, actor: string): void {
    if (this.projection().repairs.has(repair.id)) {
      throw new ConflictError(`${repair.id} is already raised`, { id: repair.id });
    }
    this.write('repair.raised', actor, {
      id: repair.id,
      joint: repair.joint,
      raisedBy: repair.raisedBy,
      method: repair.method,
      defect: repair.defect,
      attempt: repair.attempt,
      excavationLength: encodeLength(repair.excavationLength),
      excavationDepth: encodeLength(repair.excavationDepth),
      jointThickness: encodeLength(repair.jointThickness),
      excavatedOn: encodeDate(repair.excavatedOn),
      rewelderStencil: repair.rewelderStencil,
      engineeringApproval: repair.engineeringApproval ?? null,
    });
  }

  recordReweld(id: string, stencil: string, on: PlainDate, actor: string): void {
    this.requireRepair(id);
    this.write('repair.rewelded', actor, {
      id,
      reweldedOn: encodeDate(on),
      rewelderStencil: stencil,
    });
  }

  closeRepair(id: string, reExaminedBy: string, actor: string): void {
    this.requireRepair(id);
    this.write('repair.closed', actor, { id, reExaminedBy });
  }

  examination(id: string): Examination | undefined {
    return this.projection().examinations.get(id);
  }

  requireExamination(id: string): Examination {
    const found = this.examination(id);
    if (found === undefined) {
      throw new NotFoundError('examination', id);
    }
    return found;
  }

  examinations(joint?: string): readonly Examination[] {
    return [...this.projection().examinations.values()]
      .filter((item) => joint === undefined || item.joint === joint)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  repair(id: string): Repair | undefined {
    return this.projection().repairs.get(id);
  }

  requireRepair(id: string): Repair {
    const found = this.repair(id);
    if (found === undefined) {
      throw new NotFoundError('repair', id);
    }
    return found;
  }

  repairs(joint?: string): readonly Repair[] {
    return [...this.projection().repairs.values()]
      .filter((item) => joint === undefined || item.joint === joint)
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'technician.registered': {
      const read = orThrow('a technician', parseWith(technicianReader, entry.payload));
      projection.technicians.set(read.name, read);
      break;
    }
    case 'examination.filed': {
      const read = orThrow('an examination', parseWith(examinationReader, entry.payload));
      projection.examinations.set(read.id, {
        ...read,
        indications: read.indications.map((item) => {
          const { throughWallDepth, note, ...rest } = item;
          return {
            ...rest,
            ...(throughWallDepth === undefined ? {} : { throughWallDepth }),
            ...(note === undefined ? {} : { note }),
          };
        }),
      });
      break;
    }
    case 'repair.raised': {
      const read = orThrow('a repair', parseWith(repairReader, entry.payload));
      const { engineeringApproval, ...rest } = read;
      projection.repairs.set(read.id, {
        ...rest,
        ...(engineeringApproval === undefined ? {} : { engineeringApproval }),
      });
      break;
    }
    case 'repair.rewelded': {
      const read = orThrow('a reweld', parseWith(reweldReader, entry.payload));
      const held = projection.repairs.get(read.id);
      if (held !== undefined) {
        projection.repairs.set(read.id, {
          ...held,
          reweldedOn: read.reweldedOn,
          rewelderStencil: read.rewelderStencil,
        });
      }
      break;
    }
    case 'repair.closed': {
      const read = orThrow('a repair closure', parseWith(closeReader, entry.payload));
      const held = projection.repairs.get(read.id);
      if (held !== undefined) {
        projection.repairs.set(read.id, { ...held, reExaminedBy: read.reExaminedBy });
      }
      break;
    }
    default:
      break;
  }
}
