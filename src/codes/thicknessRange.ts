import { ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import { inches, Length } from '../core/units.js';
import type { ProcessCode, TransferMode } from './process.js';

/**
 * How much base metal and how much weld metal one coupon speaks for.
 *
 * This is the table people think they remember as "twice the coupon". The
 * doubling only holds in the middle of the range, it stops at three quarters
 * of an inch where the ceiling goes to eight inches flat, and two separate
 * rules elsewhere in the system can pull the ceiling back down to a whisker
 * over the coupon itself.
 *
 * Both of those rules are the interesting part. A coupon heat treated above
 * the upper transformation temperature has had its grain structure rebuilt, so
 * it no longer stands for a thicker production part. And a coupon run with
 * short circuiting transfer only proves the deposit thickness it actually
 * laid, near enough, because that is the mode with the fusion problem.
 */

const SIXTEENTH = inches('0.0625');
const THREE_SIXTEENTHS = inches('0.1875');
const THREE_EIGHTHS = inches('0.375');
const THREE_QUARTERS = inches('0.75');
const SIX = inches('6');
const EIGHT = inches('8');

export interface CouponConditions {
  /** Thickness of the base metal in the test coupon. */
  readonly couponThickness: Length;
  /** Thickness of weld metal deposited by the process being qualified. */
  readonly depositThickness: Length;
  readonly process: ProcessCode;
  readonly transferMode?: TransferMode | undefined;
  /**
   * The coupon was heat treated above the upper transformation temperature, or
   * solution annealed. Either one rebuilds the grain and caps the range.
   */
  readonly heatTreatedAboveTransformation: boolean;
}

export function qualifiedBaseMetalRange(conditions: CouponConditions): Interval<Length> {
  const coupon = conditions.couponThickness;
  requirePositive(coupon, 'couponThickness');
  if (conditions.heatTreatedAboveTransformation) {
    return Interval.closed(couponFloor(coupon), coupon.scaleBy('1.1'));
  }
  return Interval.closed(couponFloor(coupon), baseMetalCeiling(coupon));
}

export function qualifiedDepositRange(conditions: CouponConditions): Interval<Length> {
  const deposit = conditions.depositThickness;
  requirePositive(deposit, 'depositThickness');
  return Interval.closed(Length.zero(), depositCeiling(conditions, deposit));
}

/**
 * The floor of the base metal range, which is a fixed step rather than a
 * fraction of the coupon.
 */
function couponFloor(coupon: Length): Length {
  if (coupon.lessThan(SIXTEENTH)) {
    return coupon;
  }
  if (coupon.lessThanOrEqual(THREE_EIGHTHS)) {
    return SIXTEENTH;
  }
  return THREE_SIXTEENTHS;
}

function baseMetalCeiling(coupon: Length): Length {
  if (coupon.lessThan(THREE_QUARTERS)) {
    return coupon.scaleBy(2);
  }
  if (coupon.lessThan(SIX)) {
    return EIGHT;
  }
  return coupon.scaleBy('1.33');
}

function depositCeiling(conditions: CouponConditions, deposit: Length): Length {
  if (isShortCircuiting(conditions)) {
    return deposit.scaleBy('1.1');
  }
  if (conditions.heatTreatedAboveTransformation) {
    return deposit.scaleBy('1.1');
  }
  if (deposit.lessThan(THREE_QUARTERS)) {
    return deposit.scaleBy(2);
  }
  if (conditions.couponThickness.greaterThanOrEqual(THREE_QUARTERS)) {
    return EIGHT;
  }
  return deposit.scaleBy(2);
}

export function isShortCircuiting(conditions: CouponConditions): boolean {
  return conditions.process === 'GMAW' && conditions.transferMode === 'short-circuiting';
}

/** Whether a production thickness sits inside what the coupon qualified. */
export function coversBaseMetalThickness(
  conditions: CouponConditions,
  production: Length,
): boolean {
  return qualifiedBaseMetalRange(conditions).contains(production);
}

export function coversDepositThickness(conditions: CouponConditions, production: Length): boolean {
  return qualifiedDepositRange(conditions).contains(production);
}

/**
 * A short sentence saying why the ceiling landed where it did. Reviewers ask
 * this constantly and the answer is never obvious from the number alone.
 */
export function explainBaseMetalCeiling(conditions: CouponConditions): string {
  const coupon = conditions.couponThickness;
  if (conditions.heatTreatedAboveTransformation) {
    return 'coupon heat treated above the upper transformation temperature, so the ceiling is 1.1 times the coupon';
  }
  if (coupon.lessThan(THREE_QUARTERS)) {
    return 'coupon under three quarters of an inch, so the ceiling is twice the coupon';
  }
  if (coupon.lessThan(SIX)) {
    return 'coupon from three quarters to under six inches, so the ceiling is a flat eight inches';
  }
  return 'coupon six inches or over, so the ceiling is 1.33 times the coupon';
}

function requirePositive(value: Length, field: string): void {
  if (!value.toInches().isPositive()) {
    throw new ValidationError(field, `${field} must be greater than zero`, {
      value: value.toString(),
    });
  }
}
