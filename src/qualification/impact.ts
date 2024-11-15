import { Decimal, decimal } from '../core/decimal.js';
import { advisory, blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import { type Temperature } from '../core/temperature.js';
import { inches, type Length } from '../core/units.js';

/**
 * Charpy V notch testing.
 *
 * A set is three specimens and it is graded three ways at once. The average of
 * the set has to make the number, at most one specimen may sit below it, and
 * none at all may sit below two thirds of it. A set can therefore fail on its
 * spread while its average is comfortable, which is the point of the second
 * and third rules and the thing a single average would hide.
 *
 * Subsize specimens are common because the section is often too thin for a
 * full ten millimetre bar. The requirement comes down in proportion to the
 * width, and that reduction applies to all three of the rules above.
 */

export type SpecimenWidth = '10' | '7.5' | '5' | '2.5';

export interface ImpactSpecimen {
  readonly id: string;
  readonly energyFootPounds: Decimal;
  readonly lateralExpansion: Length;
  readonly shearPercent?: number | undefined;
}

export interface ImpactSet {
  readonly location: 'weld' | 'heat-affected-zone' | 'base-metal';
  readonly testTemperature: Temperature;
  readonly width: SpecimenWidth;
  readonly specimens: readonly ImpactSpecimen[];
}

export interface ImpactRequirement {
  /** Specified minimum tensile strength of the base metal, in ksi. */
  readonly specifiedMinimumTensileKsi: number;
  /** Lateral expansion is graded as well as energy on some constructions. */
  readonly lateralExpansionRequired: boolean;
}

export interface ImpactVerdict {
  readonly averageFootPounds: Decimal;
  readonly requiredAverage: Decimal;
  readonly requiredIndividual: Decimal;
  readonly absoluteFloor: Decimal;
  readonly belowIndividual: readonly string[];
  readonly belowFloor: readonly string[];
  readonly accepted: boolean;
}

const MINIMUM_LATERAL_EXPANSION = inches('0.015');

/** Average and single specimen requirements by base metal strength, in foot pounds. */
const ENERGY_TABLE: readonly (readonly [number, string, string])[] = [
  [65, '13', '10'],
  [75, '15', '12'],
  [85, '20', '15'],
  [Number.POSITIVE_INFINITY, '25', '20'],
];

const WIDTH_FACTORS: Readonly<Record<SpecimenWidth, string>> = {
  '10': '1',
  '7.5': '0.8333',
  '5': '0.6667',
  '2.5': '0.3333',
};

export function widthFactor(width: SpecimenWidth): Decimal {
  const factor = WIDTH_FACTORS[width];
  if (factor === undefined) {
    throw new ValidationError('width', `not a Charpy specimen width: ${width}`, { width });
  }
  return decimal(factor);
}

export function requiredEnergy(
  requirement: ImpactRequirement,
  width: SpecimenWidth,
): { average: Decimal; individual: Decimal } {
  const row = ENERGY_TABLE.find(([limit]) => requirement.specifiedMinimumTensileKsi <= limit);
  if (row === undefined) {
    throw new ValidationError('specifiedMinimumTensileKsi', 'no energy row for that strength', {
      strength: requirement.specifiedMinimumTensileKsi,
    });
  }
  const factor = widthFactor(width);
  return {
    average: decimal(row[1]).multiply(factor).round(1, 'half-up').normalized(),
    individual: decimal(row[2]).multiply(factor).round(1, 'half-up').normalized(),
  };
}

export function averageEnergy(set: ImpactSet): Decimal {
  if (set.specimens.length === 0) {
    throw new ValidationError('specimens', 'an impact set has no specimens', {});
  }
  const total = set.specimens.reduce(
    (running, specimen) => running.add(specimen.energyFootPounds),
    Decimal.zero(),
  );
  return total.divide(Decimal.fromInteger(set.specimens.length), 2).normalized();
}

export function gradeSet(set: ImpactSet, requirement: ImpactRequirement): ImpactVerdict {
  const required = requiredEnergy(requirement, set.width);
  const floor = required.individual.multiply(decimal('0.6667')).round(1, 'half-up').normalized();
  const average = averageEnergy(set);
  const belowIndividual = set.specimens
    .filter((specimen) => specimen.energyFootPounds.lessThan(required.individual))
    .map((specimen) => specimen.id);
  const belowFloor = set.specimens
    .filter((specimen) => specimen.energyFootPounds.lessThan(floor))
    .map((specimen) => specimen.id);
  const accepted =
    average.greaterThanOrEqual(required.average) &&
    belowIndividual.length <= 1 &&
    belowFloor.length === 0;
  return {
    averageFootPounds: average,
    requiredAverage: required.average,
    requiredIndividual: required.individual,
    absoluteFloor: floor,
    belowIndividual,
    belowFloor,
    accepted,
  };
}

export function evaluateImpacts(
  sets: readonly ImpactSet[],
  requirement: ImpactRequirement,
): readonly Finding[] {
  const findings: Finding[] = [];
  if (sets.length === 0) {
    return [
      deficiency('impact.no_sets', 'notch toughness is required and no impact sets were tested', {
        clause: 'QW-171',
      }),
    ];
  }
  for (const set of sets) {
    if (set.specimens.length !== 3) {
      findings.push(
        blocking(
          'impact.wrong_specimen_count',
          `an impact set is three specimens and the ${set.location} set has ${set.specimens.length}`,
          { clause: 'QW-171.2', subject: set.location },
        ),
      );
      continue;
    }
    const verdict = gradeSet(set, requirement);
    if (verdict.averageFootPounds.lessThan(verdict.requiredAverage)) {
      findings.push(
        blocking(
          'impact.average_below_minimum',
          `${set.location} set averaged ${verdict.averageFootPounds.toString()} against ${verdict.requiredAverage.toString()} foot pounds required`,
          { clause: 'UG-84', subject: set.location },
        ),
      );
    }
    if (verdict.belowIndividual.length > 1) {
      findings.push(
        blocking(
          'impact.too_many_low_specimens',
          `${verdict.belowIndividual.length} specimens in the ${set.location} set are below the single specimen minimum`,
          {
            clause: 'UG-84',
            subject: set.location,
            details: { specimens: verdict.belowIndividual },
          },
        ),
      );
    } else if (verdict.belowIndividual.length === 1) {
      findings.push(
        advisory(
          'impact.one_low_specimen',
          `specimen ${verdict.belowIndividual[0] ?? ''} is below the single specimen minimum, which one specimen is allowed to be`,
          { clause: 'UG-84', subject: set.location },
        ),
      );
    }
    for (const id of verdict.belowFloor) {
      findings.push(
        blocking(
          'impact.below_absolute_floor',
          `specimen ${id} is below two thirds of the single specimen minimum`,
          { clause: 'UG-84', subject: id },
        ),
      );
    }
    if (requirement.lateralExpansionRequired) {
      for (const specimen of set.specimens) {
        if (specimen.lateralExpansion.lessThan(MINIMUM_LATERAL_EXPANSION)) {
          findings.push(
            blocking(
              'impact.lateral_expansion',
              `specimen ${specimen.id} expanded ${specimen.lateralExpansion.toInches().toString()} against 0.015 required`,
              { clause: 'UG-84', subject: specimen.id },
            ),
          );
        }
      }
    }
  }
  return findings;
}
