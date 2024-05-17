import { decimal } from '../../src/core/decimal.js';
import { fahrenheit } from '../../src/core/temperature.js';
import { inches } from '../../src/core/units.js';
import type { BendSpecimen } from '../../src/qualification/bend.js';
import type { ImpactSet } from '../../src/qualification/impact.js';
import type { TensileSpecimen } from '../../src/qualification/tensile.js';

export function passingTensiles(count = 2): TensileSpecimen[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `T${index + 1}`,
    width: inches('0.75'),
    thickness: inches('0.375'),
    ultimateLoadPounds: decimal('21000'),
    failureLocation: 'base-metal' as const,
  }));
}

export function passingBends(type: BendSpecimen['type'] = 'face', count = 4): BendSpecimen[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `B${index + 1}`,
    type: index < count / 2 ? type : ('root' as BendSpecimen['type']),
    discontinuities: [],
  }));
}

export function passingImpacts(): ImpactSet[] {
  const specimens = ['1', '2', '3'].map((id) => ({
    id: `C${id}`,
    energyFootPounds: decimal('30'),
    lateralExpansion: inches('0.030'),
  }));
  return [
    { location: 'weld', testTemperature: fahrenheit('-20'), width: '10', specimens },
    {
      location: 'heat-affected-zone',
      testTemperature: fahrenheit('-20'),
      width: '10',
      specimens,
    },
  ];
}
