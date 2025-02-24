import { ConflictError, NotFoundError } from '../core/errors.js';
import { PlainDate } from '../core/plainDate.js';
import { parseWith } from '../core/schema.js';
import type { Joint, RadiographyLevel } from '../fabrication/joint.js';
import type { WeldLogEntry } from '../fabrication/weldLog.js';
import { encodeDate, encodeDocumentNumber, encodeLength, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * The weld map and the weld log, held as events.
 *
 * A joint is mapped once and then changes rarely, and when it does change the
 * change matters: a joint moved from full radiography to spot is a design
 * decision with a signature behind it, so it is its own event rather than an
 * edit. Log entries are never changed at all. A run that was recorded wrongly
 * is voided by a later entry and both stay on the record, because the shop
 * floor writing something down and the office deciding it was wrong are two
 * separate facts and an inspector is entitled to see both.
 */

export const FABRICATION_EVENTS = [
  'joint.mapped',
  'joint.examination_level_changed',
  'weld.logged',
  'weld.voided',
] as const;

export type FabricationEvent = (typeof FABRICATION_EVENTS)[number];

const jointReader = readers.record({
  id: readers.text,
  vessel: readers.text,
  description: readers.text,
  category: readers.oneOf(['A', 'B', 'C', 'D'] as const),
  type: readers.integer,
  weldType: readers.oneOf(['groove', 'fillet'] as const),
  productForm: readers.oneOf(['plate', 'pipe'] as const),
  position: readers.oneOf(['flat', 'horizontal', 'vertical', 'overhead'] as const),
  thickness: readers.length,
  lengthOfWeld: readers.length,
  outsideDiameter: readers.optional(readers.length),
  baseMetalLeft: readers.text,
  baseMetalRight: readers.text,
  heatLeft: readers.text,
  heatRight: readers.text,
  procedure: readers.documentNumber,
  radiography: readers.oneOf(['full', 'spot', 'none'] as const),
});

const levelReader = readers.record({
  id: readers.text,
  radiography: readers.oneOf(['full', 'spot', 'none'] as const),
  reason: readers.text,
});

const logReader = readers.record({
  id: readers.text,
  joint: readers.text,
  stencil: readers.text,
  process: readers.oneOf(['SMAW', 'GTAW', 'GMAW', 'FCAW', 'SAW', 'PAW'] as const),
  procedure: readers.documentNumber,
  weldedOn: readers.date,
  role: readers.oneOf(['root', 'fill', 'cap', 'repair', 'tack'] as const),
  consumable: readers.text,
  consumableLot: readers.text,
  depositThickness: readers.length,
  foreman: readers.text,
});

const voidReader = readers.record({ id: readers.text, reason: readers.text });

interface Projection {
  joints: Map<string, Joint>;
  entries: Map<string, WeldLogEntry>;
  voided: Map<string, string>;
}

export class FabricationStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { joints: new Map(), entries: new Map(), voided: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  mapJoint(joint: Joint, actor: string): void {
    if (this.projection().joints.has(joint.id)) {
      throw new ConflictError(`${joint.id} is already on the weld map`, { id: joint.id });
    }
    this.write('joint.mapped', actor, {
      ...joint,
      thickness: encodeLength(joint.thickness),
      lengthOfWeld: encodeLength(joint.lengthOfWeld),
      outsideDiameter:
        joint.outsideDiameter === undefined ? null : encodeLength(joint.outsideDiameter),
      procedure: encodeDocumentNumber(joint.procedure),
    });
  }

  changeExaminationLevel(
    id: string,
    radiography: RadiographyLevel,
    reason: string,
    actor: string,
  ): void {
    this.requireJoint(id);
    this.write('joint.examination_level_changed', actor, { id, radiography, reason });
  }

  logWeld(entry: WeldLogEntry, actor: string): void {
    this.requireJoint(entry.joint);
    if (this.projection().entries.has(entry.id)) {
      throw new ConflictError(`${entry.id} is already logged`, { id: entry.id });
    }
    this.write('weld.logged', actor, {
      ...entry,
      procedure: encodeDocumentNumber(entry.procedure),
      weldedOn: encodeDate(entry.weldedOn),
      depositThickness: encodeLength(entry.depositThickness),
    });
  }

  voidEntry(id: string, reason: string, actor: string): void {
    if (!this.projection().entries.has(id)) {
      throw new NotFoundError('weld log entry', id);
    }
    this.write('weld.voided', actor, { id, reason });
  }

  joint(id: string): Joint | undefined {
    return this.projection().joints.get(id);
  }

  requireJoint(id: string): Joint {
    const found = this.joint(id);
    if (found === undefined) {
      throw new NotFoundError('joint', id);
    }
    return found;
  }

  joints(vessel?: string): readonly Joint[] {
    return [...this.projection().joints.values()]
      .filter((joint) => vessel === undefined || joint.vessel === vessel)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Days a welder deposited metal with a process, from live entries only. */
  usageDates(stencil: string, process: WeldLogEntry['process']): readonly PlainDate[] {
    const days = new Set(
      this.entries()
        .filter((entry) => entry.stencil === stencil && entry.process === process)
        .map((entry) => entry.weldedOn.toString()),
    );
    return [...days].sort().map((day) => PlainDate.parse(day));
  }

  /** Live entries, with anything voided left out. */
  entries(joint?: string): readonly WeldLogEntry[] {
    const projection = this.projection();
    return [...projection.entries.values()]
      .filter((entry) => !projection.voided.has(entry.id))
      .filter((entry) => joint === undefined || entry.joint === joint)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  voidedEntries(): readonly { entry: WeldLogEntry; reason: string }[] {
    const projection = this.projection();
    return [...projection.voided.entries()]
      .map(([id, reason]) => ({ entry: projection.entries.get(id), reason }))
      .filter((row): row is { entry: WeldLogEntry; reason: string } => row.entry !== undefined);
  }

  usageDatesFor(stencil: string): readonly { process: WeldLogEntry['process']; on: PlainDate }[] {
    return this.entries()
      .filter((entry) => entry.stencil === stencil)
      .map((entry) => ({ process: entry.process, on: entry.weldedOn }));
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'joint.mapped': {
      const read = orThrow('a joint', parseWith(jointReader, entry.payload));
      projection.joints.set(read.id, { ...read, type: read.type as Joint['type'] });
      break;
    }
    case 'joint.examination_level_changed': {
      const read = orThrow('an examination level', parseWith(levelReader, entry.payload));
      const held = projection.joints.get(read.id);
      if (held !== undefined) {
        projection.joints.set(read.id, { ...held, radiography: read.radiography });
      }
      break;
    }
    case 'weld.logged': {
      const read = orThrow('a weld log entry', parseWith(logReader, entry.payload));
      projection.entries.set(read.id, read);
      break;
    }
    case 'weld.voided': {
      const read = orThrow('a void', parseWith(voidReader, entry.payload));
      projection.voided.set(read.id, read.reason);
      break;
    }
    default:
      break;
  }
}
