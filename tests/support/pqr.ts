import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import type { ProcedureQualificationRecord } from '../../src/qualification/pqr.js';
import { baseVariables } from './variables.js';

export function samplePqr(
  overrides: Partial<ProcedureQualificationRecord> = {},
): ProcedureQualificationRecord {
  return {
    number: DocumentNumber.parse('PQR-0042'),
    weldedOn: date('2024-03-04'),
    weldedBy: 'W-118',
    weldType: 'groove',
    productForm: 'plate',
    baseMetalLeft: 'SA-516 Gr 70',
    baseMetalRight: 'SA-516 Gr 70',
    heatLeft: 'A47213',
    heatRight: 'A47213',
    couponThickness: inches('3/8'),
    layers: [baseVariables()],
    toughnessRequired: false,
    tests: { tensile: [], bends: [], impacts: [], hardness: [] },
    witnessedBy: 'QA-3',
    certifiedOn: date('2024-03-11'),
    ...overrides,
  };
}
