import type { DepositAnalysis, Element } from '../codes/anumber.js';
import { Decimal, decimal } from '../core/decimal.js';
import { advisory, blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import { PlainDate } from '../core/plainDate.js';
import { Temperature } from '../core/temperature.js';
import { Length } from '../core/units.js';
import { baseMetal, curveFor, type BaseMetalSpecification } from './baseMetal.js';

/**
 * Material heats and the certificates that come with them.
 *
 * A heat is one melt at the mill. Everything cut from it shares its chemistry
 * and its test results, so the certificate is the unit of trust and the heat
 * number is the thread that ties a finished weld back to it.
 *
 * The certificate is checked on arrival rather than at the point of use. A
 * plate that fails its own specification is worth catching on the goods
 * inwards bench, not three weeks later when it is half of a shell course.
 */

export interface MechanicalResults {
  readonly tensileKsi: Decimal;
  readonly yieldKsi: Decimal;
  readonly elongationPercent: Decimal;
}

export interface CertifiedImpacts {
  readonly testTemperature: Temperature;
  readonly energyFootPounds: readonly Decimal[];
}

export interface MaterialHeat {
  readonly heatNumber: string;
  readonly specification: string;
  readonly supplier: string;
  readonly certificateNumber: string;
  readonly certificateDate: PlainDate;
  readonly thickness: Length;
  /** The mill normalised the heat, which moves it onto a colder curve. */
  readonly normalised: boolean;
  readonly chemistry: DepositAnalysis;
  readonly mechanical: MechanicalResults;
  readonly impacts?: CertifiedImpacts;
}

/** Chemistry limits the shop enforces on top of the material specification. */
const CARBON_EQUIVALENT_LIMIT = decimal('0.43');

const SUSPICIOUS: readonly (readonly [Element, string])[] = [
  ['C', '0.30'],
  ['Mn', '2.00'],
  ['Si', '1.20'],
];

export function specificationOf(heat: MaterialHeat): BaseMetalSpecification {
  return baseMetal(heat.specification);
}

/**
 * International Institute of Welding carbon equivalent, which is what the
 * shop's preheat practice is written against.
 */
export function carbonEquivalent(chemistry: DepositAnalysis): Decimal {
  const carbon = chemistry.C ?? Decimal.zero();
  const manganese = chemistry.Mn ?? Decimal.zero();
  const chromium = chemistry.Cr ?? Decimal.zero();
  const molybdenum = chemistry.Mo ?? Decimal.zero();
  const nickel = chemistry.Ni ?? Decimal.zero();
  const manganeseTerm = manganese.divide(decimal('6'), 4);
  const chromeGroup = chromium.add(molybdenum).add(chemistry.V ?? Decimal.zero()).divide(decimal('5'), 4);
  const nickelGroup = nickel.divide(decimal('15'), 4);
  return carbon.add(manganeseTerm).add(chromeGroup).add(nickelGroup).round(3, 'half-up').normalized();
}

export function certifiedCurve(heat: MaterialHeat): ReturnType<typeof curveFor> {
  return curveFor(heat.specification, heat.normalised);
}

export function verifyCertificate(heat: MaterialHeat): readonly Finding[] {
  const specification = specificationOf(heat);
  const findings: Finding[] = [];

  if (heat.heatNumber.trim() === '') {
    findings.push(
      blocking('heat.no_number', 'the certificate carries no heat number', {
        subject: heat.certificateNumber,
      }),
    );
  }
  if (heat.mechanical.tensileKsi.lessThan(decimal(specification.minimumTensileKsi))) {
    findings.push(
      blocking(
        'heat.tensile_below_specification',
        `heat ${heat.heatNumber} certifies ${heat.mechanical.tensileKsi.toString()} ksi against ${specification.minimumTensileKsi} required by ${specification.designation}`,
        { subject: heat.heatNumber },
      ),
    );
  }
  if (heat.mechanical.yieldKsi.lessThan(decimal(specification.minimumYieldKsi))) {
    findings.push(
      blocking(
        'heat.yield_below_specification',
        `heat ${heat.heatNumber} certifies ${heat.mechanical.yieldKsi.toString()} ksi yield against ${specification.minimumYieldKsi} required`,
        { subject: heat.heatNumber },
      ),
    );
  }
  if (heat.mechanical.yieldKsi.greaterThanOrEqual(heat.mechanical.tensileKsi)) {
    findings.push(
      blocking(
        'heat.impossible_mechanicals',
        `heat ${heat.heatNumber} certifies a yield at or above its tensile, so the certificate has been transcribed wrongly`,
        { subject: heat.heatNumber },
      ),
    );
  }
  for (const [element, limit] of SUSPICIOUS) {
    const value = heat.chemistry[element];
    if (value !== undefined && value.greaterThan(decimal(limit))) {
      findings.push(
        blocking(
          'heat.chemistry_out_of_band',
          `${element} at ${value.toString()} percent in heat ${heat.heatNumber} is past the shop limit of ${limit}`,
          { subject: heat.heatNumber },
        ),
      );
    }
  }
  const equivalent = carbonEquivalent(heat.chemistry);
  if (equivalent.greaterThan(CARBON_EQUIVALENT_LIMIT) && specification.pNumber === '1') {
    findings.push(
      deficiency(
        'heat.carbon_equivalent',
        `carbon equivalent of ${equivalent.toString()} on heat ${heat.heatNumber} needs the raised preheat practice`,
        { subject: heat.heatNumber },
      ),
    );
  }
  if (heat.normalised && specification.curve === specification.normalisedCurve) {
    findings.push(
      advisory(
        'heat.normalising_bought_nothing',
        `${specification.designation} sits on the same curve normalised or not, so the normalising on heat ${heat.heatNumber} buys no exemption`,
        { subject: heat.heatNumber },
      ),
    );
  }
  return findings;
}

/** Whether the certificate carries impact results usable at a design temperature. */
export function impactsCoverTemperature(
  heat: MaterialHeat,
  designTemperature: Temperature,
): boolean {
  if (heat.impacts === undefined) {
    return false;
  }
  return heat.impacts.testTemperature.isAtMost(designTemperature);
}

export function certifiedImpactAverage(heat: MaterialHeat): Decimal | undefined {
  const impacts = heat.impacts;
  if (impacts === undefined || impacts.energyFootPounds.length === 0) {
    return undefined;
  }
  const total = impacts.energyFootPounds.reduce(
    (running, value) => running.add(value),
    Decimal.zero(),
  );
  return total.divide(Decimal.fromInteger(impacts.energyFootPounds.length), 2).normalized();
}

export function thicknessAccepted(heat: MaterialHeat, ordered: Interval<Length>): boolean {
  if (!heat.thickness.toInches().isPositive()) {
    throw new ValidationError('thickness', `heat ${heat.heatNumber} has no thickness`, {
      heatNumber: heat.heatNumber,
    });
  }
  return ordered.contains(heat.thickness);
}
