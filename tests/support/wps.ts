import { PRODUCTION_POSITIONS } from '../../src/codes/position.js';
import { DocumentNumber } from '../../src/core/identifier.js';
import { Interval } from '../../src/core/interval.js';
import { date } from '../../src/core/plainDate.js';
import { fahrenheit } from '../../src/core/temperature.js';
import { inches } from '../../src/core/units.js';
import type { WeldingProcedureSpecification } from '../../src/qualification/wps.js';

export function sampleWps(
  overrides: Partial<WeldingProcedureSpecification> = {},
): WeldingProcedureSpecification {
  return {
    number: DocumentNumber.parse('WPS-0110 Rev 0'),
    title: 'carbon steel shell seams, shielded metal arc',
    issuedOn: date('2024-03-18'),
    supportedBy: ['PQR-0042'],
    weldType: 'groove',
    productForm: 'plate',
    pNumbers: ['1'],
    groupNumbers: [1, 2],
    baseMetalThickness: Interval.closed(inches('0.0625'), inches('0.75')),
    positions: [...PRODUCTION_POSITIONS],
    layers: [
      {
        process: 'SMAW',
        fNumbers: [4],
        aNumber: 1,
        depositThickness: Interval.closed(inches('0'), inches('0.75')),
        progression: 'uphill',
        preheatMinimum: fahrenheit('50'),
        interpassMaximum: fahrenheit('500'),
      },
    ],
    pwht: 'none',
    toughnessQualified: false,
    ...overrides,
  };
}
