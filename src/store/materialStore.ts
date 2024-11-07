import { ConflictError, NotFoundError } from '../core/errors.js';
import { parseWith } from '../core/schema.js';
import type { HeatTreatmentChart } from '../fabrication/heatTreatmentChart.js';
import type { MaterialHeat } from '../materials/heat.js';
import {
  encodeDate,
  encodeDecimal,
  encodeLength,
  encodeTemperature,
  orThrow,
  readers,
} from './codec.js';
import type { JournalEntry } from './journal.js';
import { ProjectingStore } from './projectingStore.js';

/**
 * Mill certificates and furnace charts.
 *
 * Both are somebody else's document copied into the record, and both are
 * checked on the way in rather than on the way out. A certificate that fails
 * its own specification and a chart whose ramp was too fast are the same kind
 * of problem: cheap to argue about with the supplier this week, impossible to
 * argue about once the plate is in a vessel and the furnace is cold.
 */

export const MATERIAL_EVENTS = ['heat.certified', 'pwht.charted'] as const;

export type MaterialEvent = (typeof MATERIAL_EVENTS)[number];

const chemistryReader = readers.record({
  C: readers.optional(readers.decimal),
  Cr: readers.optional(readers.decimal),
  Mo: readers.optional(readers.decimal),
  Ni: readers.optional(readers.decimal),
  Mn: readers.optional(readers.decimal),
  Si: readers.optional(readers.decimal),
  V: readers.optional(readers.decimal),
});

const heatReader = readers.record({
  heatNumber: readers.text,
  specification: readers.text,
  supplier: readers.text,
  certificateNumber: readers.text,
  certificateDate: readers.date,
  thickness: readers.length,
  normalised: readers.boolean,
  chemistry: chemistryReader,
  mechanical: readers.record({
    tensileKsi: readers.decimal,
    yieldKsi: readers.decimal,
    elongationPercent: readers.decimal,
  }),
  impacts: readers.optional(
    readers.record({
      testTemperature: readers.temperature,
      energyFootPounds: readers.array(readers.decimal),
    }),
  ),
});

const chartReader = readers.record({
  id: readers.text,
  vessel: readers.text,
  joints: readers.array(readers.text),
  furnace: readers.text,
  pNumber: readers.text,
  governingThickness: readers.length,
  runOn: readers.date,
  readings: readers.array(
    readers.record({
      minute: readers.integer,
      couples: readers.array(readers.temperature),
    }),
  ),
});

interface Projection {
  heats: Map<string, MaterialHeat>;
  charts: Map<string, HeatTreatmentChart>;
}

export class MaterialStore extends ProjectingStore<Projection> {
  protected empty(): Projection {
    return { heats: new Map(), charts: new Map() };
  }

  protected apply(projection: Projection, entry: JournalEntry): void {
    apply(projection, entry);
  }

  certify(heat: MaterialHeat, actor: string): void {
    if (this.projection().heats.has(heat.heatNumber)) {
      throw new ConflictError(`heat ${heat.heatNumber} is already on file`, {
        heatNumber: heat.heatNumber,
      });
    }
    this.write('heat.certified', actor, {
      heatNumber: heat.heatNumber,
      specification: heat.specification,
      supplier: heat.supplier,
      certificateNumber: heat.certificateNumber,
      certificateDate: encodeDate(heat.certificateDate),
      thickness: encodeLength(heat.thickness),
      normalised: heat.normalised,
      chemistry: Object.fromEntries(
        Object.entries(heat.chemistry).map(([element, value]) => [
          element,
          value === undefined ? null : encodeDecimal(value),
        ]),
      ),
      mechanical: {
        tensileKsi: encodeDecimal(heat.mechanical.tensileKsi),
        yieldKsi: encodeDecimal(heat.mechanical.yieldKsi),
        elongationPercent: encodeDecimal(heat.mechanical.elongationPercent),
      },
      impacts:
        heat.impacts === undefined
          ? null
          : {
              testTemperature: encodeTemperature(heat.impacts.testTemperature),
              energyFootPounds: heat.impacts.energyFootPounds.map((value) => encodeDecimal(value)),
            },
    });
  }

  chart(chart: HeatTreatmentChart, actor: string): void {
    if (this.projection().charts.has(chart.id)) {
      throw new ConflictError(`${chart.id} is already on file`, { id: chart.id });
    }
    this.write('pwht.charted', actor, {
      id: chart.id,
      vessel: chart.vessel,
      joints: [...chart.joints],
      furnace: chart.furnace,
      pNumber: chart.pNumber,
      governingThickness: encodeLength(chart.governingThickness),
      runOn: encodeDate(chart.runOn),
      readings: chart.readings.map((reading) => ({
        minute: reading.minute,
        couples: reading.couples.map((couple) => encodeTemperature(couple)),
      })),
    });
  }

  heat(heatNumber: string): MaterialHeat | undefined {
    return this.projection().heats.get(heatNumber);
  }

  requireHeat(heatNumber: string): MaterialHeat {
    const found = this.heat(heatNumber);
    if (found === undefined) {
      throw new NotFoundError('heat', heatNumber);
    }
    return found;
  }

  heats(): readonly MaterialHeat[] {
    return [...this.projection().heats.values()].sort((left, right) =>
      left.heatNumber.localeCompare(right.heatNumber),
    );
  }

  charts(vessel?: string): readonly HeatTreatmentChart[] {
    return [...this.projection().charts.values()]
      .filter((item) => vessel === undefined || item.vessel === vessel)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  requireChart(id: string): HeatTreatmentChart {
    const found = this.projection().charts.get(id);
    if (found === undefined) {
      throw new NotFoundError('heat treatment chart', id);
    }
    return found;
  }
}

function apply(projection: Projection, entry: JournalEntry): void {
  switch (entry.type) {
    case 'heat.certified': {
      const read = orThrow('a mill certificate', parseWith(heatReader, entry.payload));
      const { impacts, chemistry, ...rest } = read;
      const trimmed = Object.fromEntries(
        Object.entries(chemistry).filter(([, value]) => value !== undefined),
      );
      projection.heats.set(read.heatNumber, {
        ...rest,
        chemistry: trimmed,
        ...(impacts === undefined ? {} : { impacts }),
      });
      break;
    }
    case 'pwht.charted': {
      const read = orThrow('a heat treatment chart', parseWith(chartReader, entry.payload));
      projection.charts.set(read.id, read);
      break;
    }
    default:
      break;
  }
}
