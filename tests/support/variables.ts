import { decimal } from '../../src/core/decimal.js';
import { fahrenheit } from '../../src/core/temperature.js';
import { inches } from '../../src/core/units.js';
import type { WeldingVariables } from '../../src/qualification/variables.js';

/**
 * A plain shielded metal arc procedure on carbon steel, used as the starting
 * point everywhere a test needs a complete set of variables to change one of.
 */
export function baseVariables(): WeldingVariables {
  return {
    process: 'SMAW',
    joint: { grooveDesign: 'single V, 60 degrees included', backing: true, retainers: false },
    baseMetal: { pNumber: '1', groupNumber: 2, thickness: inches('3/8') },
    filler: {
      fNumber: 4,
      aNumber: 1,
      classification: 'E7018',
      diameter: inches('1/8'),
      depositThickness: inches('3/8'),
    },
    position: { position: '3G', verticalProgression: 'uphill' },
    preheat: { minimum: fahrenheit('50'), maintained: true, interpassMaximum: fahrenheit('500') },
    pwht: { applied: false },
    gas: {},
    electrical: {
      currentType: 'DCEP',
      amperageLow: decimal('90'),
      amperageHigh: decimal('140'),
    },
    technique: { beadType: 'stringer', passesPerSide: 'multiple', peening: false },
  };
}

export function withProcess(
  variables: WeldingVariables,
  changes: Partial<WeldingVariables>,
): WeldingVariables {
  return { ...variables, ...changes };
}
