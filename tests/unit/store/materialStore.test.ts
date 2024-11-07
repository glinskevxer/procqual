import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { decimal } from '../../../src/core/decimal.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import type { HeatTreatmentChart } from '../../../src/fabrication/heatTreatmentChart.js';
import type { MaterialHeat } from '../../../src/materials/heat.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { MaterialStore } from '../../../src/store/materialStore.js';

let journal: MemoryJournal;
let store: MaterialStore;

const heat = (overrides: Partial<MaterialHeat> = {}): MaterialHeat => ({
  heatNumber: 'A47213',
  specification: 'SA-516 Gr 70',
  supplier: 'Dillinger',
  certificateNumber: 'C-90114',
  certificateDate: date('2024-02-01'),
  thickness: inches('1/2'),
  normalised: false,
  chemistry: { C: decimal('0.18'), Mn: decimal('1.05') },
  mechanical: {
    tensileKsi: decimal('76'),
    yieldKsi: decimal('44'),
    elongationPercent: decimal('26'),
  },
  ...overrides,
});

const chart = (overrides: Partial<HeatTreatmentChart> = {}): HeatTreatmentChart => ({
  id: 'HT-311',
  vessel: 'V-2201',
  joints: ['J-14'],
  furnace: 'F-1',
  pNumber: '1',
  governingThickness: inches('2'),
  runOn: date('2024-11-01'),
  readings: [
    { minute: 0, couples: [fahrenheit('80'), fahrenheit('80')] },
    { minute: 360, couples: [fahrenheit('1150'), fahrenheit('1140')] },
  ],
  ...overrides,
});

beforeEach(() => {
  journal = new MemoryJournal();
  store = new MaterialStore(journal, new FixedClock('2024-11-08T09:00:00.000Z'));
});

describe('mill certificates', () => {
  it('files one and reads it back whole', () => {
    store.certify(heat(), 'goods-in');
    const read = store.requireHeat('A47213');
    expect(read.specification).toBe('SA-516 Gr 70');
    expect(read.thickness.toFraction()).toBe('1/2');
    expect(read.chemistry.C?.toString()).toBe('0.18');
    expect(read.impacts).toBeUndefined();
  });

  it('leaves the elements the certificate did not report out of the analysis', () => {
    store.certify(heat(), 'goods-in');
    expect(Object.keys(store.requireHeat('A47213').chemistry)).toEqual(['C', 'Mn']);
  });

  it('keeps certified impacts', () => {
    store.certify(
      heat({
        impacts: {
          testTemperature: fahrenheit('-50'),
          energyFootPounds: [decimal('42'), decimal('38'), decimal('40')],
        },
      }),
      'goods-in',
    );
    const read = store.requireHeat('A47213');
    expect(read.impacts?.testTemperature.toFahrenheit().toString()).toBe('-50');
    expect(read.impacts?.energyFootPounds).toHaveLength(3);
  });

  it('refuses the same heat twice', () => {
    store.certify(heat(), 'goods-in');
    expect(() => store.certify(heat(), 'goods-in')).toThrow(ConflictError);
  });

  it('refuses to answer for a heat nobody filed', () => {
    expect(() => store.requireHeat('B00001')).toThrow(NotFoundError);
    expect(store.heat('B00001')).toBeUndefined();
  });

  it('lists them in heat number order', () => {
    store.certify(heat({ heatNumber: 'B00002' }), 'goods-in');
    store.certify(heat(), 'goods-in');
    expect(store.heats().map((item) => item.heatNumber)).toEqual(['A47213', 'B00002']);
  });
});

describe('furnace charts', () => {
  it('files one and reads the readings back', () => {
    store.chart(chart(), 'qa');
    const read = store.requireChart('HT-311');
    expect(read.joints).toEqual(['J-14']);
    expect(read.readings[1]?.couples[0]?.toFahrenheit().toString()).toBe('1150');
  });

  it('filters by vessel', () => {
    store.chart(chart(), 'qa');
    store.chart(chart({ id: 'HT-312', vessel: 'V-3300' }), 'qa');
    expect(store.charts('V-3300').map((item) => item.id)).toEqual(['HT-312']);
    expect(store.charts()).toHaveLength(2);
  });

  it('refuses the same chart twice and one nobody filed', () => {
    store.chart(chart(), 'qa');
    expect(() => store.chart(chart(), 'qa')).toThrow(ConflictError);
    expect(() => store.requireChart('HT-999')).toThrow(NotFoundError);
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    store.certify(heat(), 'goods-in');
    store.chart(chart(), 'qa');
    const rebuilt = new MaterialStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2025-01-01T09:00:00.000Z'),
    );
    expect(rebuilt.heats()).toHaveLength(1);
    expect(rebuilt.charts()).toHaveLength(1);
  });
});
