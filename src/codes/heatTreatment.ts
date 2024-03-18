import { Decimal, decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import { fahrenheit, Temperature } from '../core/temperature.js';
import { inches, Length } from '../core/units.js';
import { pNumberFacts } from './pnumber.js';

/**
 * Preheat and post weld heat treatment.
 *
 * The two rules are not independent, which is the point of putting them in one
 * file. The heat treatment a joint gets decides how much preheat it needed on
 * the way in for some families, and more importantly it decides whether the
 * procedure's thickness range survives at all. A soak above the upper
 * transformation temperature rebuilds the grain, so the coupon stops standing
 * for anything thicker than itself, which is the rule that reaches back into
 * the thickness tables.
 */

export interface PreheatRule {
  /** Preheat below this thickness, in Fahrenheit. */
  readonly base: Temperature;
  /** Preheat at or above the step thickness, or where the metal is strong. */
  readonly raised: Temperature;
  readonly stepThickness: Length;
  /** Above this specified minimum tensile the raised figure applies anyway. */
  readonly strongMetalKsi: number;
}

export interface PwhtRule {
  /** No treatment is called for below this thickness. */
  readonly requiredAbove: Length | 'always' | 'never';
  readonly holdingRange: Interval<Temperature>;
  /** Above this the grain is rebuilt and the qualified range collapses. */
  readonly upperTransformation: Temperature;
}

const NEVER = inches('0');

const PREHEAT: Readonly<Record<string, PreheatRule>> = {
  '1': { base: fahrenheit('50'), raised: fahrenheit('175'), stepThickness: inches('1.5'), strongMetalKsi: 71 },
  '3': { base: fahrenheit('50'), raised: fahrenheit('175'), stepThickness: inches('0.625'), strongMetalKsi: 71 },
  '4': { base: fahrenheit('200'), raised: fahrenheit('250'), stepThickness: inches('0.5'), strongMetalKsi: 60 },
  '5A': { base: fahrenheit('300'), raised: fahrenheit('400'), stepThickness: inches('0.5'), strongMetalKsi: 60 },
  '5B': { base: fahrenheit('400'), raised: fahrenheit('400'), stepThickness: NEVER, strongMetalKsi: 0 },
  '5C': { base: fahrenheit('400'), raised: fahrenheit('400'), stepThickness: NEVER, strongMetalKsi: 0 },
  '6': { base: fahrenheit('400'), raised: fahrenheit('400'), stepThickness: NEVER, strongMetalKsi: 0 },
  '7': { base: fahrenheit('300'), raised: fahrenheit('300'), stepThickness: NEVER, strongMetalKsi: 0 },
  '8': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '9A': { base: fahrenheit('200'), raised: fahrenheit('250'), stepThickness: inches('0.625'), strongMetalKsi: 71 },
  '9B': { base: fahrenheit('250'), raised: fahrenheit('300'), stepThickness: inches('0.625'), strongMetalKsi: 71 },
  '10H': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '11A': { base: fahrenheit('200'), raised: fahrenheit('300'), stepThickness: inches('0.5'), strongMetalKsi: 71 },
  '15E': { base: fahrenheit('400'), raised: fahrenheit('400'), stepThickness: NEVER, strongMetalKsi: 0 },
  '21': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '22': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '23': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '41': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '42': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '43': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
  '45': { base: fahrenheit('50'), raised: fahrenheit('50'), stepThickness: NEVER, strongMetalKsi: 0 },
};

const PWHT: Readonly<Record<string, PwhtRule>> = {
  '1': band(inches('1.5'), '1100', '1250', '1340'),
  '3': band(inches('0.625'), '1100', '1250', '1340'),
  '4': band(inches('0.5'), '1300', '1400', '1425'),
  '5A': band('always', '1300', '1400', '1425'),
  '5B': band('always', '1300', '1400', '1425'),
  '5C': band('always', '1300', '1400', '1425'),
  '6': band('always', '1400', '1450', '1500'),
  '7': band('always', '1350', '1450', '1500'),
  '8': band('never', '1900', '2050', '1900'),
  '9A': band(inches('0.625'), '1100', '1250', '1340'),
  '9B': band(inches('0.625'), '1100', '1250', '1340'),
  '10H': band('never', '1870', '2010', '1870'),
  '11A': band('always', '1000', '1150', '1300'),
  '15E': band('always', '1350', '1425', '1470'),
  '21': band('never', '0', '0', '1000'),
  '22': band('never', '0', '0', '1000'),
  '23': band('never', '0', '0', '1000'),
  '41': band('never', '0', '0', '1800'),
  '42': band('never', '0', '0', '1800'),
  '43': band('never', '0', '0', '1800'),
  '45': band('never', '0', '0', '1800'),
};

function band(
  requiredAbove: Length | 'always' | 'never',
  lower: string,
  upper: string,
  transformation: string,
): PwhtRule {
  return {
    requiredAbove,
    holdingRange: Interval.closed(fahrenheit(lower), fahrenheit(upper)),
    upperTransformation: fahrenheit(transformation),
  };
}

export function preheatRule(pNumber: string): PreheatRule {
  const code = pNumberFacts(pNumber).code;
  const rule = PREHEAT[code];
  if (rule === undefined) {
    throw new ValidationError('pNumber', `no preheat rule for P number ${code}`, { code });
  }
  return rule;
}

export function pwhtRule(pNumber: string): PwhtRule {
  const code = pNumberFacts(pNumber).code;
  const rule = PWHT[code];
  if (rule === undefined) {
    throw new ValidationError('pNumber', `no heat treatment rule for P number ${code}`, { code });
  }
  return rule;
}

/**
 * Minimum preheat for a joint. The raised figure applies once the metal is
 * thick or once it is strong, and either one on its own is enough.
 */
export function minimumPreheat(
  pNumber: string,
  thickness: Length,
  specifiedMinimumTensileKsi?: number,
): Temperature {
  const rule = preheatRule(pNumber);
  const thick =
    rule.stepThickness.toInches().isPositive() && thickness.greaterThan(rule.stepThickness);
  const strong =
    rule.strongMetalKsi > 0 &&
    specifiedMinimumTensileKsi !== undefined &&
    specifiedMinimumTensileKsi > rule.strongMetalKsi;
  return thick || strong ? rule.raised : rule.base;
}

export function pwhtRequired(pNumber: string, thickness: Length): boolean {
  const rule = pwhtRule(pNumber);
  if (rule.requiredAbove === 'never') {
    return false;
  }
  if (rule.requiredAbove === 'always') {
    return true;
  }
  return thickness.greaterThan(rule.requiredAbove);
}

/**
 * Holding time at temperature: an hour for every inch, never under a quarter
 * of an hour, and past five inches the rate drops to a quarter hour per inch.
 */
export function holdingTimeHours(thickness: Length): Decimal {
  const inchesThick = thickness.toInches();
  if (!inchesThick.isPositive()) {
    throw new ValidationError('thickness', 'thickness must be greater than zero', {
      thickness: thickness.toString(),
    });
  }
  const five = decimal('5');
  if (inchesThick.lessThanOrEqual(five)) {
    const straight = inchesThick;
    const quarter = decimal('0.25');
    return (straight.lessThan(quarter) ? quarter : straight).round(2, 'half-up').normalized();
  }
  const extra = inchesThick.subtract(five).multiply(decimal('0.25'));
  return five.add(extra).round(2, 'half-up').normalized();
}

/**
 * Whether a soak rebuilds the grain, which is what collapses a procedure's
 * qualified thickness range back to a tenth over the coupon.
 */
export function isAboveTransformation(pNumber: string, holding: Temperature): boolean {
  return holding.isAbove(pwhtRule(pNumber).upperTransformation);
}

export function holdingTemperatureAccepted(pNumber: string, holding: Temperature): boolean {
  return pwhtRule(pNumber).holdingRange.contains(holding);
}

export function describePwht(pNumber: string, thickness: Length): string {
  if (!pwhtRequired(pNumber, thickness)) {
    return 'no post weld heat treatment required';
  }
  const rule = pwhtRule(pNumber);
  return `hold ${rule.holdingRange.toString()} for ${holdingTimeHours(thickness).toString()} hours`;
}
