import { ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import { inches, Length } from '../core/units.js';
import type { ProductForm } from './position.js';

/**
 * What a welder's own coupon qualifies, which is a different and much shorter
 * table than the one for procedures.
 *
 * A procedure has to prove the joint is sound. A welder has to prove they can
 * lay the metal, so the ranges key on deposit thickness and pipe diameter and
 * ignore the base metal almost entirely.
 *
 * Two traps live here. Half an inch of deposit qualifies any thickness at all,
 * which surprises people who expect the doubling to continue. And a coupon
 * welded in fewer than three layers proves only the thickness it laid, because
 * the skill being tested is depositing over previous runs.
 */

const HALF = inches('0.5');
const ONE = inches('1');
const TWO_SEVEN_EIGHTHS = inches('2.875');
const TWENTY_FOUR = inches('24');

export interface PerformanceCoupon {
  /** Weld metal the welder actually laid on the coupon. */
  readonly depositThickness: Length;
  /** Number of layers deposited, which is the three layer rule's input. */
  readonly layers: number;
  readonly productForm: ProductForm;
  /** Outside diameter of the coupon, for a pipe coupon only. */
  readonly outsideDiameter?: Length | undefined;
}

export function qualifiedDepositThickness(coupon: PerformanceCoupon): Interval<Length> {
  const deposit = coupon.depositThickness;
  if (!deposit.toInches().isPositive()) {
    throw new ValidationError('depositThickness', 'the coupon deposited no weld metal', {
      value: deposit.toString(),
    });
  }
  if (!Number.isInteger(coupon.layers) || coupon.layers < 1) {
    throw new ValidationError('layers', 'a coupon has at least one layer', {
      layers: coupon.layers,
    });
  }
  if (coupon.layers < 3) {
    return Interval.closed(Length.zero(), deposit.scaleBy('1.1'));
  }
  if (deposit.greaterThanOrEqual(HALF)) {
    return Interval.atLeast(Length.zero());
  }
  return Interval.closed(Length.zero(), deposit.scaleBy(2));
}

export function qualifiedDiameter(coupon: PerformanceCoupon): Interval<Length> {
  if (coupon.productForm === 'plate') {
    return Interval.atLeast(TWENTY_FOUR);
  }
  const diameter = coupon.outsideDiameter;
  if (diameter === undefined) {
    throw new ValidationError('outsideDiameter', 'a pipe coupon needs an outside diameter', {});
  }
  if (!diameter.toInches().isPositive()) {
    throw new ValidationError('outsideDiameter', 'outside diameter must be greater than zero', {
      value: diameter.toString(),
    });
  }
  if (diameter.lessThan(ONE)) {
    return Interval.atLeast(diameter);
  }
  if (diameter.lessThanOrEqual(TWO_SEVEN_EIGHTHS)) {
    return Interval.atLeast(ONE);
  }
  return Interval.atLeast(TWO_SEVEN_EIGHTHS);
}

/**
 * Whether a coupon on one product form reaches the work at all.
 *
 * Pipe carries over to plate outright. Plate carries over to pipe only at
 * twenty four inches and up, where the curvature has stopped mattering, which
 * is why the plate case returns a diameter floor rather than nothing.
 */
export function coversWork(
  coupon: PerformanceCoupon,
  work: { productForm: ProductForm; outsideDiameter?: Length | undefined },
): boolean {
  if (coupon.productForm === 'pipe' && work.productForm === 'plate') {
    return true;
  }
  if (work.productForm === 'plate') {
    return coupon.productForm === 'plate';
  }
  const diameter = work.outsideDiameter;
  if (diameter === undefined) {
    return false;
  }
  return qualifiedDiameter(coupon).contains(diameter);
}

export function coversThickness(coupon: PerformanceCoupon, production: Length): boolean {
  return qualifiedDepositThickness(coupon).contains(production);
}

export function explainThicknessCeiling(coupon: PerformanceCoupon): string {
  if (coupon.layers < 3) {
    return 'fewer than three layers on the coupon, so the ceiling is 1.1 times the deposit';
  }
  if (coupon.depositThickness.greaterThanOrEqual(HALF)) {
    return 'half an inch or more of deposit in three layers or more, so there is no ceiling';
  }
  return 'under half an inch of deposit, so the ceiling is twice the deposit';
}
