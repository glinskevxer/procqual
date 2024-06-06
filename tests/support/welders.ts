import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import type { PerformanceQualification, Welder } from '../../src/personnel/welder.js';

export function sampleWelder(overrides: Partial<Welder> = {}): Welder {
  return {
    stencil: 'W-118',
    name: 'R Ashworth',
    employedFrom: date('2019-04-01'),
    ...overrides,
  };
}

export function sampleQualification(
  overrides: Partial<PerformanceQualification> = {},
): PerformanceQualification {
  return {
    number: DocumentNumber.parse('WPQ-0231'),
    stencil: 'W-118',
    weldedOn: date('2024-01-16'),
    process: 'SMAW',
    weldType: 'groove',
    productForm: 'plate',
    position: '3G',
    verticalProgression: 'uphill',
    fNumber: 4,
    backing: true,
    depositThickness: inches('3/8'),
    layers: 5,
    testMethod: 'bend',
    passed: true,
    witnessedBy: 'QA-3',
    ...overrides,
  };
}
