import { decimal } from '../../src/core/decimal.js';
import { date } from '../../src/core/plainDate.js';
import { fahrenheit } from '../../src/core/temperature.js';
import type { Vessel } from '../../src/fabrication/vessel.js';

export function sampleVessel(overrides: Partial<Vessel> = {}): Vessel {
  return {
    tag: 'V-2201',
    description: 'crude overhead accumulator',
    customer: 'Humber Refinery',
    service: 'general',
    minimumDesignMetalTemperature: fahrenheit('40'),
    designPressurePsi: decimal('285'),
    designTemperature: fahrenheit('650'),
    orderedOn: date('2024-01-08'),
    normalisedHeats: [],
    ...overrides,
  };
}
