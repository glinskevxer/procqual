import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import type { Examination, Technician } from '../../src/nde/examination.js';

export function sampleTechnician(overrides: Partial<Technician> = {}): Technician {
  return {
    name: 'J Pilling',
    level: 'II',
    methods: ['RT', 'UT', 'MT', 'PT', 'VT'],
    certifiedUntil: date('2026-03-31'),
    ...overrides,
  };
}

export function sampleExamination(overrides: Partial<Examination> = {}): Examination {
  return {
    id: 'X-4410',
    joint: 'J-14',
    method: 'RT',
    extent: 'full',
    performedOn: date('2024-07-05'),
    technician: sampleTechnician(),
    reportNumber: 'RT-2024-0331',
    coverage: inches('96'),
    indications: [],
    afterHeatTreatment: false,
    ...overrides,
  };
}
