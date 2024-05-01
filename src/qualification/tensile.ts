import { blocking, type Finding, advisory } from '../core/errors.js';
import { type Decimal, decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import { type Length } from '../core/units.js';

/**
 * Reduced section tensile tests on a procedure coupon.
 *
 * The specimen is pulled to destruction and has to reach the specified minimum
 * tensile strength of the base metal. There is one relaxation and it is the
 * part worth writing down: if the break happened out in the base metal, away
 * from the weld and the fusion line, then the weld was never the weak point
 * and ninety five percent of the minimum is accepted. The relaxation does not
 * apply to a break in the weld, however good the number looks.
 */

export type FailureLocation = 'weld' | 'fusion-line' | 'heat-affected-zone' | 'base-metal';

export interface TensileSpecimen {
  readonly id: string;
  readonly width: Length;
  readonly thickness: Length;
  /** Ultimate load in pounds force. */
  readonly ultimateLoadPounds: Decimal;
  readonly failureLocation: FailureLocation;
}

export interface TensileRequirement {
  /** Specified minimum tensile strength of the base metal, in ksi. */
  readonly specifiedMinimumKsi: Decimal;
  /**
   * For a joint between two different base metals, the lower of the two
   * minimums governs, and the caller has to say which it used.
   */
  readonly governingMetal?: string;
}

export interface TensileResult {
  readonly specimen: TensileSpecimen;
  readonly areaSquareInches: Decimal;
  readonly strengthKsi: Decimal;
  readonly requiredKsi: Decimal;
  readonly relaxed: boolean;
  readonly accepted: boolean;
}

const NINETY_FIVE_PERCENT = decimal('0.95');
const POUNDS_PER_KSI = decimal('1000');

export function specimenArea(specimen: TensileSpecimen): Decimal {
  const area = specimen.width.toInches().multiply(specimen.thickness.toInches());
  if (!area.isPositive()) {
    throw new ValidationError('specimen', `specimen ${specimen.id} has no cross section`, {
      id: specimen.id,
    });
  }
  return area;
}

export function specimenStrengthKsi(specimen: TensileSpecimen): Decimal {
  return specimen.ultimateLoadPounds
    .divide(specimenArea(specimen), 4)
    .divide(POUNDS_PER_KSI, 4)
    .normalized();
}

/**
 * Whether the ninety five percent relaxation is open to this specimen. Only a
 * break out in the base metal earns it.
 */
export function relaxationApplies(specimen: TensileSpecimen): boolean {
  return specimen.failureLocation === 'base-metal';
}

export function evaluateSpecimen(
  specimen: TensileSpecimen,
  requirement: TensileRequirement,
): TensileResult {
  const relaxed = relaxationApplies(specimen);
  const required = relaxed
    ? requirement.specifiedMinimumKsi.multiply(NINETY_FIVE_PERCENT).round(4, 'half-up').normalized()
    : requirement.specifiedMinimumKsi;
  const strength = specimenStrengthKsi(specimen);
  return {
    specimen,
    areaSquareInches: specimenArea(specimen).normalized(),
    strengthKsi: strength,
    requiredKsi: required,
    relaxed,
    accepted: strength.greaterThanOrEqual(required),
  };
}

export function evaluateTensile(
  specimens: readonly TensileSpecimen[],
  requirement: TensileRequirement,
): { results: readonly TensileResult[]; findings: readonly Finding[] } {
  const findings: Finding[] = [];
  if (specimens.length < 2) {
    findings.push(
      blocking('tensile.too_few_specimens', 'a coupon needs at least two tensile specimens', {
        clause: 'QW-451.1',
        details: { given: specimens.length },
      }),
    );
  }
  const results = specimens.map((specimen) => evaluateSpecimen(specimen, requirement));
  for (const result of results) {
    if (!result.accepted) {
      findings.push(
        blocking(
          'tensile.below_minimum',
          `specimen ${result.specimen.id} reached ${result.strengthKsi.toString()} ksi against ${result.requiredKsi.toString()} ksi required`,
          { clause: 'QW-153.1', subject: result.specimen.id },
        ),
      );
    } else if (result.relaxed) {
      findings.push(
        advisory(
          'tensile.relaxed',
          `specimen ${result.specimen.id} broke in the base metal, so ninety five percent of the minimum was applied`,
          { clause: 'QW-153.1', subject: result.specimen.id },
        ),
      );
    }
  }
  return { results, findings };
}

export function lowestStrength(results: readonly TensileResult[]): Decimal | undefined {
  return results.reduce<Decimal | undefined>(
    (best, result) =>
      best === undefined || result.strengthKsi.lessThan(best) ? result.strengthKsi : best,
    undefined,
  );
}
