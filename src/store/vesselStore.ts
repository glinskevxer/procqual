import { ConflictError, NotFoundError } from '../core/errors.js';
import { parseWith } from '../core/schema.js';
import type { Vessel } from '../fabrication/vessel.js';
import { encodeDate, encodeDecimal, encodeTemperature, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * Vessels and their design conditions.
 *
 * The design conditions change. A customer moves a minimum design metal
 * temperature down twenty degrees three weeks into fabrication, and that is
 * not a correction, it is a change with consequences: joints that needed no
 * toughness now need it, and procedures that covered the work may not any
 * more. So a change is its own event with a reason on it, and the old
 * conditions stay on the record, because somebody will need to show which
 * conditions were in force when each joint was welded.
 */

export const VESSEL_EVENTS = ['vessel.recorded', 'vessel.conditions_changed'] as const;

export type VesselEvent = (typeof VESSEL_EVENTS)[number];

const vesselReader = readers.record({
  tag: readers.text,
  description: readers.text,
  customer: readers.text,
  service: readers.oneOf(['general', 'lethal', 'steam', 'sour'] as const),
  minimumDesignMetalTemperature: readers.temperature,
  designPressurePsi: readers.decimal,
  designTemperature: readers.temperature,
  orderedOn: readers.date,
  normalisedHeats: readers.array(readers.text),
});

const conditionsReader = readers.record({
  tag: readers.text,
  minimumDesignMetalTemperature: readers.temperature,
  designPressurePsi: readers.decimal,
  designTemperature: readers.temperature,
  service: readers.oneOf(['general', 'lethal', 'steam', 'sour'] as const),
  reason: readers.text,
});

interface Projection {
  vessels: Map<string, Vessel>;
  changes: Map<string, string[]>;
}

function encodeVessel(vessel: Vessel): Record<string, unknown> {
  return {
    tag: vessel.tag,
    description: vessel.description,
    customer: vessel.customer,
    service: vessel.service,
    minimumDesignMetalTemperature: encodeTemperature(vessel.minimumDesignMetalTemperature),
    designPressurePsi: encodeDecimal(vessel.designPressurePsi),
    designTemperature: encodeTemperature(vessel.designTemperature),
    orderedOn: encodeDate(vessel.orderedOn),
    normalisedHeats: [...vessel.normalisedHeats],
  };
}

export class VesselStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { vessels: new Map(), changes: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  record(vessel: Vessel, actor: string): void {
    if (this.projection().vessels.has(vessel.tag)) {
      throw new ConflictError(`${vessel.tag} is already on the books`, { tag: vessel.tag });
    }
    this.write('vessel.recorded', actor, encodeVessel(vessel));
  }

  changeConditions(
    tag: string,
    conditions: Pick<
      Vessel,
      'minimumDesignMetalTemperature' | 'designPressurePsi' | 'designTemperature' | 'service'
    >,
    reason: string,
    actor: string,
  ): void {
    this.requireVessel(tag);
    this.write('vessel.conditions_changed', actor, {
      tag,
      minimumDesignMetalTemperature: encodeTemperature(conditions.minimumDesignMetalTemperature),
      designPressurePsi: encodeDecimal(conditions.designPressurePsi),
      designTemperature: encodeTemperature(conditions.designTemperature),
      service: conditions.service,
      reason,
    });
  }

  vessel(tag: string): Vessel | undefined {
    return this.projection().vessels.get(tag);
  }

  requireVessel(tag: string): Vessel {
    const found = this.vessel(tag);
    if (found === undefined) {
      throw new NotFoundError('vessel', tag);
    }
    return found;
  }

  vessels(): readonly Vessel[] {
    return [...this.projection().vessels.values()].sort((left, right) =>
      left.tag.localeCompare(right.tag),
    );
  }

  /** Reasons the design conditions have been changed, oldest first. */
  changeHistory(tag: string): readonly string[] {
    return this.projection().changes.get(tag) ?? [];
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'vessel.recorded': {
      const read = orThrow('a vessel', parseWith(vesselReader, entry.payload));
      projection.vessels.set(read.tag, read);
      break;
    }
    case 'vessel.conditions_changed': {
      const read = orThrow('a design change', parseWith(conditionsReader, entry.payload));
      const held = projection.vessels.get(read.tag);
      if (held !== undefined) {
        projection.vessels.set(read.tag, {
          ...held,
          minimumDesignMetalTemperature: read.minimumDesignMetalTemperature,
          designPressurePsi: read.designPressurePsi,
          designTemperature: read.designTemperature,
          service: read.service,
        });
        const reasons = projection.changes.get(read.tag) ?? [];
        reasons.push(read.reason);
        projection.changes.set(read.tag, reasons);
      }
      break;
    }
    default:
      break;
  }
}
