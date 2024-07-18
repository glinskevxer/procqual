import { DocumentNumber } from '../../src/core/identifier.js';
import { inches } from '../../src/core/units.js';
import type { Joint } from '../../src/fabrication/joint.js';

export function sampleJoint(overrides: Partial<Joint> = {}): Joint {
  return {
    id: 'J-14',
    vessel: 'V-2201',
    description: 'shell course two, longitudinal seam',
    category: 'A',
    type: 1,
    weldType: 'groove',
    productForm: 'plate',
    position: 'vertical',
    thickness: inches('1/2'),
    lengthOfWeld: inches('96'),
    baseMetalLeft: 'SA-516 Gr 70',
    baseMetalRight: 'SA-516 Gr 70',
    heatLeft: 'A47213',
    heatRight: 'A47213',
    procedure: DocumentNumber.parse('WPS-0110 Rev 0'),
    radiography: 'full',
    ...overrides,
  };
}
