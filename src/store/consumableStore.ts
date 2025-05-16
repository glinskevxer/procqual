import { Decimal } from '../core/decimal.js';
import { ConflictError, NotFoundError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { parseWith } from '../core/schema.js';
import type { ElectrodeIssue, OvenReading } from '../fabrication/consumables.js';
import { hoursBetween } from '../fabrication/consumables.js';
import { encodeDate, encodeDecimal, encodeTemperature, orThrow, readers } from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * The store room: what went out of the oven, what came back, and what the
 * oven itself was doing.
 *
 * The exposure clock is the reason this is a store rather than a spreadsheet.
 * It has to survive a shift change, and a tin issued at seven in the morning
 * and returned at four by a different person is one running clock, not two
 * unrelated notes. Prior exposure carries forward across issues of the same
 * lot for the same reason.
 */

export const CONSUMABLE_EVENTS = [
  'consumable.issued',
  'consumable.returned',
  'oven.logged',
] as const;

export type ConsumableEvent = (typeof CONSUMABLE_EVENTS)[number];

const issueReader = readers.record({
  id: readers.text,
  consumable: readers.text,
  lot: readers.text,
  oven: readers.text,
  issuedTo: readers.text,
  issuedAt: readers.text,
  priorExposureHours: readers.decimal,
  rebakes: readers.integer,
  issuedOn: readers.date,
});

const returnReader = readers.record({ id: readers.text, returnedAt: readers.text });

const ovenReader = readers.record({
  oven: readers.text,
  at: readers.text,
  temperature: readers.temperature,
});

interface Projection {
  issues: Map<string, ElectrodeIssue>;
  readings: OvenReading[];
}

export class ConsumableStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { issues: new Map(), readings: [] };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  /**
   * Issue a tin, carrying forward whatever exposure the same lot has already
   * had out of the oven.
   */
  issue(
    id: string,
    consumable: string,
    lot: string,
    oven: string,
    issuedTo: string,
    on: PlainDate,
    at: string,
    actor: string,
  ): ElectrodeIssue {
    if (this.projection().issues.has(id)) {
      throw new ConflictError(`${id} has already been issued`, { id });
    }
    const held = this.exposureOf(consumable, lot);
    const issue: ElectrodeIssue = {
      id,
      consumable,
      lot,
      oven,
      issuedTo,
      issuedAt: at,
      priorExposureHours: held.hours,
      rebakes: held.rebakes,
      issuedOn: on,
    };
    this.write('consumable.issued', actor, {
      id,
      consumable,
      lot,
      oven,
      issuedTo,
      issuedAt: at,
      priorExposureHours: encodeDecimal(issue.priorExposureHours),
      rebakes: issue.rebakes,
      issuedOn: encodeDate(on),
    });
    return issue;
  }

  recordReturn(id: string, at: string, actor: string): void {
    if (!this.projection().issues.has(id)) {
      throw new NotFoundError('issue', id);
    }
    this.write('consumable.returned', actor, { id, returnedAt: at });
  }

  logOven(reading: OvenReading, actor: string): void {
    this.write('oven.logged', actor, {
      oven: reading.oven,
      at: reading.at,
      temperature: encodeTemperature(reading.temperature),
    });
  }

  issues(consumable?: string): readonly ElectrodeIssue[] {
    return [...this.projection().issues.values()]
      .filter((item) => consumable === undefined || item.consumable === consumable)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  requireIssue(id: string): ElectrodeIssue {
    const found = this.projection().issues.get(id);
    if (found === undefined) {
      throw new NotFoundError('issue', id);
    }
    return found;
  }

  readings(oven?: string): readonly OvenReading[] {
    return this.projection().readings.filter((item) => oven === undefined || item.oven === oven);
  }

  /** Hours a lot has been out of the oven across every closed issue of it. */
  exposureOf(consumable: string, lot: string): { hours: Decimal; rebakes: number } {
    let hours = Decimal.zero();
    let rebakes = 0;
    for (const issue of this.issues(consumable)) {
      if (issue.lot !== lot || issue.returnedAt === undefined) {
        continue;
      }
      hours = hours.add(hoursBetween(issue.issuedAt, issue.returnedAt));
      rebakes = Math.max(rebakes, issue.rebakes);
    }
    return { hours: hours.round(2, 'half-up').normalized(), rebakes };
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'consumable.issued': {
      const read = orThrow('an issue', parseWith(issueReader, entry.payload));
      projection.issues.set(read.id, read);
      break;
    }
    case 'consumable.returned': {
      const read = orThrow('a return', parseWith(returnReader, entry.payload));
      const held = projection.issues.get(read.id);
      if (held !== undefined) {
        projection.issues.set(read.id, { ...held, returnedAt: read.returnedAt });
      }
      break;
    }
    case 'oven.logged': {
      projection.readings.push(orThrow('an oven reading', parseWith(ovenReader, entry.payload)));
      break;
    }
    default:
      break;
  }
}
