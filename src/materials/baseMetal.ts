import type { ExemptionCurve } from '../codes/toughness.js';
import { ValidationError } from '../core/errors.js';

/**
 * The base metals the shop buys, and the facts each one drags along.
 *
 * The exemption curve is the field worth looking at twice. Most of these
 * specifications sit on one curve as rolled and jump a curve or two once the
 * plate has been normalised, and the jump is worth two impact sets and a week
 * of testing. It is a property of the heat, not of the specification, so the
 * catalogue records both and the material certificate decides which applies.
 */

export type ProductCategory = 'plate' | 'pipe' | 'forging' | 'fitting' | 'bar' | 'tube';

export interface BaseMetalSpecification {
  /** As written on the certificate, for example `SA-516 Gr 70`. */
  readonly designation: string;
  readonly pNumber: string;
  readonly groupNumber: number;
  readonly category: ProductCategory;
  /** Specified minimum tensile strength in ksi. */
  readonly minimumTensileKsi: number;
  /** Specified minimum yield strength in ksi. */
  readonly minimumYieldKsi: number;
  /** Curve the material sits on as supplied. */
  readonly curve: ExemptionCurve;
  /** Curve it moves to once the heat has been normalised. */
  readonly normalisedCurve: ExemptionCurve;
  readonly description: string;
}

const SPECIFICATIONS: readonly BaseMetalSpecification[] = [
  {
    designation: 'SA-516 Gr 60',
    pNumber: '1',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 60,
    minimumYieldKsi: 32,
    curve: 'B',
    normalisedCurve: 'D',
    description: 'carbon steel plate for moderate and lower temperature service',
  },
  {
    designation: 'SA-516 Gr 70',
    pNumber: '1',
    groupNumber: 2,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 38,
    curve: 'B',
    normalisedCurve: 'D',
    description: 'carbon steel plate for moderate and lower temperature service',
  },
  {
    designation: 'SA-515 Gr 70',
    pNumber: '1',
    groupNumber: 2,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 38,
    curve: 'A',
    normalisedCurve: 'B',
    description: 'carbon steel plate for intermediate and higher temperature service',
  },
  {
    designation: 'SA-537 Cl 1',
    pNumber: '1',
    groupNumber: 2,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 50,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'heat treated carbon manganese silicon plate',
  },
  {
    designation: 'SA-106 Gr B',
    pNumber: '1',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 60,
    minimumYieldKsi: 35,
    curve: 'B',
    normalisedCurve: 'D',
    description: 'seamless carbon steel pipe for high temperature service',
  },
  {
    designation: 'SA-333 Gr 6',
    pNumber: '1',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 60,
    minimumYieldKsi: 35,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'seamless carbon steel pipe for low temperature service',
  },
  {
    designation: 'SA-105',
    pNumber: '1',
    groupNumber: 2,
    category: 'forging',
    minimumTensileKsi: 70,
    minimumYieldKsi: 36,
    curve: 'B',
    normalisedCurve: 'D',
    description: 'carbon steel forgings for piping components',
  },
  {
    designation: 'SA-350 LF2',
    pNumber: '1',
    groupNumber: 2,
    category: 'forging',
    minimumTensileKsi: 70,
    minimumYieldKsi: 36,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'carbon steel forgings for low temperature service',
  },
  {
    designation: 'SA-335 P11',
    pNumber: '4',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 60,
    minimumYieldKsi: 30,
    curve: 'B',
    normalisedCurve: 'B',
    description: 'one and a quarter chromium half molybdenum pipe',
  },
  {
    designation: 'SA-182 F11',
    pNumber: '4',
    groupNumber: 1,
    category: 'forging',
    minimumTensileKsi: 75,
    minimumYieldKsi: 45,
    curve: 'B',
    normalisedCurve: 'B',
    description: 'one and a quarter chromium half molybdenum forgings',
  },
  {
    designation: 'SA-335 P22',
    pNumber: '5A',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 60,
    minimumYieldKsi: 30,
    curve: 'B',
    normalisedCurve: 'B',
    description: 'two and a quarter chromium one molybdenum pipe',
  },
  {
    designation: 'SA-182 F22',
    pNumber: '5A',
    groupNumber: 1,
    category: 'forging',
    minimumTensileKsi: 75,
    minimumYieldKsi: 45,
    curve: 'B',
    normalisedCurve: 'B',
    description: 'two and a quarter chromium one molybdenum forgings',
  },
  {
    designation: 'SA-335 P91',
    pNumber: '15E',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 85,
    minimumYieldKsi: 60,
    curve: 'B',
    normalisedCurve: 'B',
    description: 'nine chromium one molybdenum vanadium pipe',
  },
  {
    designation: 'SA-240 304L',
    pNumber: '8',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 25,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'austenitic stainless plate',
  },
  {
    designation: 'SA-240 316L',
    pNumber: '8',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 25,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'molybdenum bearing austenitic stainless plate',
  },
  {
    designation: 'SA-312 TP304L',
    pNumber: '8',
    groupNumber: 1,
    category: 'pipe',
    minimumTensileKsi: 70,
    minimumYieldKsi: 25,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'seamless austenitic stainless pipe',
  },
  {
    designation: 'SA-240 S31803',
    pNumber: '10H',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 90,
    minimumYieldKsi: 65,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'duplex stainless plate',
  },
  {
    designation: 'SA-203 Gr E',
    pNumber: '9B',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 70,
    minimumYieldKsi: 40,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'three and a half nickel alloy steel plate',
  },
  {
    designation: 'SB-443 N06625',
    pNumber: '43',
    groupNumber: 1,
    category: 'plate',
    minimumTensileKsi: 120,
    minimumYieldKsi: 60,
    curve: 'D',
    normalisedCurve: 'D',
    description: 'nickel chromium molybdenum niobium plate',
  },
];

const BY_DESIGNATION = new Map(
  SPECIFICATIONS.map((specification) => [normalise(specification.designation), specification]),
);

export function allBaseMetals(): readonly BaseMetalSpecification[] {
  return SPECIFICATIONS;
}

export function isBaseMetal(designation: string): boolean {
  return BY_DESIGNATION.has(normalise(designation));
}

export function baseMetal(designation: string): BaseMetalSpecification {
  const specification = BY_DESIGNATION.get(normalise(designation));
  if (specification === undefined) {
    throw new ValidationError('baseMetal', `not a base metal the shop stocks: ${designation}`, {
      designation,
    });
  }
  return specification;
}

/**
 * The curve that applies to a particular piece, which depends on how the heat
 * was supplied rather than on the specification alone.
 */
export function curveFor(designation: string, normalisedHeat: boolean): ExemptionCurve {
  const specification = baseMetal(designation);
  return normalisedHeat ? specification.normalisedCurve : specification.curve;
}

export function baseMetalsByPNumber(pNumber: string): readonly BaseMetalSpecification[] {
  return SPECIFICATIONS.filter((specification) => specification.pNumber === pNumber);
}

export function baseMetalsByCategory(category: ProductCategory): readonly BaseMetalSpecification[] {
  return SPECIFICATIONS.filter((specification) => specification.category === category);
}

/** The governing minimum tensile for a joint, which is the weaker of the two. */
export function governingTensileKsi(left: string, right: string): number {
  return Math.min(baseMetal(left).minimumTensileKsi, baseMetal(right).minimumTensileKsi);
}

function normalise(designation: string): string {
  return designation.trim().toUpperCase().replace(/\s+/g, ' ');
}
