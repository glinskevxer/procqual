import { blocking, type Finding, advisory, ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import { inches, Length } from '../core/units.js';
import { pNumberFacts } from '../codes/pnumber.js';

/**
 * Guided bend tests.
 *
 * Two separate decisions live here and they are easy to run together by
 * mistake. Which specimens have to be cut is decided by the coupon thickness.
 * Whether the ones that were cut passed is decided by what opened up on the
 * convex face, and by where it opened.
 *
 * The corner rule is the one that gets argued about. A tear at the corner of
 * the specimen is allowed up to a quarter of an inch, because it is usually
 * the edge of the coupon rather than the weld. That allowance disappears the
 * moment the tear can be traced to slag or lack of fusion, and then it is
 * judged as an ordinary discontinuity at an eighth.
 */

export type BendType = 'face' | 'root' | 'side';

export type DiscontinuityLocation = 'weld' | 'heat-affected-zone' | 'corner' | 'base-metal';

export interface Discontinuity {
  readonly location: DiscontinuityLocation;
  /** Greatest dimension measured in any direction. */
  readonly size: Length;
  /** The tear can be traced back to slag or to lack of fusion. */
  readonly fusionRelated: boolean;
}

export interface BendSpecimen {
  readonly id: string;
  readonly type: BendType;
  readonly discontinuities: readonly Discontinuity[];
}

export interface BendPlan {
  readonly allowed: readonly BendType[];
  readonly countPerType: number;
  readonly total: number;
  readonly note: string;
}

const THREE_EIGHTHS = inches('0.375');
const THREE_QUARTERS = inches('0.75');
const GENERAL_LIMIT = inches('0.125');
const CORNER_LIMIT = inches('0.25');

/**
 * Which bends have to be cut from a coupon of this thickness.
 *
 * Thin coupons bend across the face and the root. Thick ones will not bend
 * that way without tearing on geometry alone, so they are cut into side bends
 * instead. In between, either set is accepted and the shop picks.
 */
export function requiredBends(couponThickness: Length): BendPlan {
  if (!couponThickness.toInches().isPositive()) {
    throw new ValidationError('couponThickness', 'coupon thickness must be greater than zero', {});
  }
  if (couponThickness.lessThan(THREE_EIGHTHS)) {
    return {
      allowed: ['face', 'root'],
      countPerType: 2,
      total: 4,
      note: 'under three eighths, so two face bends and two root bends',
    };
  }
  if (couponThickness.lessThan(THREE_QUARTERS)) {
    return {
      allowed: ['face', 'root', 'side'],
      countPerType: 2,
      total: 4,
      note: 'between three eighths and three quarters, so either two face and two root bends or four side bends',
    };
  }
  return {
    allowed: ['side'],
    countPerType: 4,
    total: 4,
    note: 'three quarters and over, so four side bends',
  };
}

/**
 * Mandrel diameter for the jig, as a multiple of the specimen thickness.
 *
 * Ductile metals take a tight bend. The multiple opens up for the families
 * that will not take one, which is why this reads the P number rather than a
 * fixed figure.
 */
export function mandrelMultiple(pNumber: string): number {
  const facts = pNumberFacts(pNumber);
  if (facts.family.startsWith('aluminium')) {
    return 6;
  }
  if (facts.code === '10H' || facts.code === '7' || facts.code === '6') {
    return 6;
  }
  if (facts.code.startsWith('4') && facts.code !== '4') {
    return 10;
  }
  return 4;
}

export function mandrelDiameter(pNumber: string, specimenThickness: Length): Length {
  return specimenThickness.scaleBy(mandrelMultiple(pNumber));
}

export function acceptedSize(discontinuity: Discontinuity): Interval<Length> {
  const corner = discontinuity.location === 'corner' && !discontinuity.fusionRelated;
  return Interval.closed(Length.zero(), corner ? CORNER_LIMIT : GENERAL_LIMIT);
}

export function discontinuityAccepted(discontinuity: Discontinuity): boolean {
  if (discontinuity.location === 'base-metal') {
    return true;
  }
  return acceptedSize(discontinuity).contains(discontinuity.size);
}

export function evaluateBends(
  specimens: readonly BendSpecimen[],
  couponThickness: Length,
): readonly Finding[] {
  const plan = requiredBends(couponThickness);
  const findings: Finding[] = [];
  if (specimens.length < plan.total) {
    findings.push(
      blocking(
        'bend.too_few_specimens',
        `${plan.total} bend specimens are required and ${specimens.length} were tested`,
        { clause: 'QW-451.1', details: { note: plan.note } },
      ),
    );
  }
  for (const specimen of specimens) {
    if (!plan.allowed.includes(specimen.type)) {
      findings.push(
        blocking(
          'bend.wrong_specimen_type',
          `a ${specimen.type} bend is not accepted at this coupon thickness`,
          { clause: 'QW-451.1', subject: specimen.id, details: { note: plan.note } },
        ),
      );
    }
    for (const discontinuity of specimen.discontinuities) {
      if (discontinuityAccepted(discontinuity)) {
        if (discontinuity.location === 'corner' && !discontinuity.fusionRelated) {
          findings.push(
            advisory(
              'bend.corner_tear',
              `corner tear of ${discontinuity.size.toFraction()} accepted on ${specimen.id}`,
              { clause: 'QW-163', subject: specimen.id },
            ),
          );
        }
        continue;
      }
      findings.push(
        blocking(
          'bend.open_discontinuity',
          `${discontinuity.size.toFraction()} inch discontinuity in the ${discontinuity.location} of ${specimen.id}`,
          {
            clause: 'QW-163',
            subject: specimen.id,
            details: {
              limit: acceptedSize(discontinuity).upper?.toFraction() ?? '',
              fusionRelated: discontinuity.fusionRelated,
            },
          },
        ),
      );
    }
  }
  return findings;
}
