import { Decimal, decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import { fahrenheit, Temperature } from '../core/temperature.js';
import { inches, Length } from '../core/units.js';

/**
 * Whether the job needs notch toughness at all.
 *
 * This is the switch that half the rest of the system hangs off. If the answer
 * is yes then every supplementary variable in the register becomes essential,
 * group numbers start to matter, and a procedure that was perfectly good
 * yesterday stops covering the work.
 *
 * The answer comes off an exemption curve. Each base metal specification is
 * assigned a curve, the curve and the governing thickness give an exemption
 * temperature, and the vessel is exempt when its minimum design metal
 * temperature sits at or above that. Heat treatment where the code does not
 * demand it buys a further allowance, which is the one place in the whole
 * system where doing more work relaxes a requirement.
 */

export type ExemptionCurve = 'A' | 'B' | 'C' | 'D';

/**
 * Exemption temperatures in Fahrenheit at a set of governing thicknesses.
 * Between the listed points the curve is read by straight line, which is what
 * the note under the published figure tells you to do.
 */
const CURVE_POINTS: Readonly<Record<ExemptionCurve, readonly (readonly [string, string])[]>> = {
  A: [
    ['0.25', '18'],
    ['0.50', '40'],
    ['0.75', '58'],
    ['1.00', '70'],
    ['1.50', '86'],
    ['2.00', '96'],
    ['3.00', '110'],
    ['4.00', '120'],
  ],
  B: [
    ['0.25', '-20'],
    ['0.50', '4'],
    ['0.75', '24'],
    ['1.00', '38'],
    ['1.50', '58'],
    ['2.00', '72'],
    ['3.00', '90'],
    ['4.00', '102'],
  ],
  C: [
    ['0.25', '-55'],
    ['0.50', '-30'],
    ['0.75', '-10'],
    ['1.00', '4'],
    ['1.50', '26'],
    ['2.00', '42'],
    ['3.00', '64'],
    ['4.00', '78'],
  ],
  D: [
    ['0.25', '-55'],
    ['0.50', '-55'],
    ['0.75', '-40'],
    ['1.00', '-26'],
    ['1.50', '-6'],
    ['2.00', '10'],
    ['3.00', '34'],
    ['4.00', '50'],
  ],
};

const FLOOR = fahrenheit('-55');
const THIN = inches('0.25');
const THICK = inches('4');

export interface ToughnessQuestion {
  readonly curve: ExemptionCurve;
  /** Governing thickness of the welded joint, not of the whole part. */
  readonly governingThickness: Length;
  /** Minimum design metal temperature the vessel is stamped for. */
  readonly minimumDesignMetalTemperature: Temperature;
  /**
   * Heat treatment was applied where the construction code did not require it,
   * which earns a thirty degree allowance on carbon and low alloy steel.
   */
  readonly heatTreatedWhenNotRequired?: boolean;
}

export interface ToughnessAssessment {
  readonly required: boolean;
  readonly exemptionTemperature: Temperature;
  readonly allowanceDegrees: number;
  readonly reason: string;
}

export function isExemptionCurve(value: string): value is ExemptionCurve {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

export function parseExemptionCurve(value: string): ExemptionCurve {
  const upper = value.trim().toUpperCase();
  if (!isExemptionCurve(upper)) {
    throw new ValidationError('curve', `not an exemption curve: ${value}`, { value });
  }
  return upper;
}

/**
 * Read the curve at a thickness. Below the first listed point the curve is
 * flat at its floor, above the last it is flat at its own end, because the
 * published figure stops there and reading past it is guesswork.
 */
export function exemptionTemperature(curve: ExemptionCurve, thickness: Length): Temperature {
  const points = CURVE_POINTS[curve];
  if (!thickness.toInches().isPositive()) {
    throw new ValidationError('governingThickness', 'thickness must be greater than zero', {
      thickness: thickness.toString(),
    });
  }
  if (thickness.lessThanOrEqual(THIN)) {
    return curve === 'A' ? fahrenheit(points[0]?.[1] ?? '0') : FLOOR;
  }
  if (thickness.greaterThanOrEqual(THICK)) {
    return fahrenheit(points[points.length - 1]?.[1] ?? '0');
  }
  return interpolate(points, thickness.toInches());
}

export function assessToughness(question: ToughnessQuestion): ToughnessAssessment {
  const exemption = exemptionTemperature(question.curve, question.governingThickness);
  const allowance = question.heatTreatedWhenNotRequired === true ? 30 : 0;
  const effective = exemption.plusFahrenheitDegrees(-allowance);
  const required = question.minimumDesignMetalTemperature.isBelow(effective);
  return {
    required,
    exemptionTemperature: effective,
    allowanceDegrees: allowance,
    reason: required
      ? `design temperature ${question.minimumDesignMetalTemperature.toString()} is below the curve ${question.curve} exemption of ${effective.toString()}`
      : `design temperature ${question.minimumDesignMetalTemperature.toString()} is at or above the curve ${question.curve} exemption of ${effective.toString()}`,
  };
}

export function impactTestingRequired(question: ToughnessQuestion): boolean {
  return assessToughness(question).required;
}

function interpolate(
  points: readonly (readonly [string, string])[],
  thickness: Decimal,
): Temperature {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const upper = decimal(current[0]);
    if (thickness.lessThanOrEqual(upper)) {
      const lower = decimal(previous[0]);
      const span = upper.subtract(lower);
      const along = thickness.subtract(lower).divide(span, 6);
      const rise = decimal(current[1]).subtract(decimal(previous[1]));
      return fahrenheit(decimal(previous[1]).add(rise.multiply(along)).round(1, 'half-up'));
    }
  }
  const last = points[points.length - 1];
  return fahrenheit(last?.[1] ?? '0');
}
