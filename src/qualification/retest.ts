import { Decimal } from '../core/decimal.js';
import { advisory, blocking, type Finding } from '../core/errors.js';
import { gradeSet, type ImpactRequirement, type ImpactSet } from './impact.js';
import type { CouponVerdict } from './evaluation.js';

/**
 * Retests.
 *
 * A coupon that failed is not always a coupon that has to be rewelded, and the
 * rules about which is which are narrow and worth getting exactly right,
 * because a shop that retests where it should reweld has quietly lowered its
 * own acceptance criteria and a shop that rewelds where it could retest has
 * thrown away a day.
 *
 * Two separate schemes live here. Mechanical tests are retested by cutting
 * double the specimens from the same coupon, and every one of them has to
 * pass, which makes a retest strictly harder than the original test. Impact
 * sets are retested by three more specimens and only when the failure was of a
 * kind the code allows a retest for: a set that failed because a specimen
 * shattered is retestable, a set that failed on its average is not.
 */

export type RetestKind = 'mechanical' | 'impact';

export interface RetestAllowance {
  readonly allowed: boolean;
  readonly kind: RetestKind;
  /** Specimens the retest needs, which is double for a mechanical retest. */
  readonly specimens: number;
  readonly reason: string;
}

/**
 * A mechanical failure may be retested once, on double the specimens, and only
 * when the failure was in the test rather than in the record. A coupon that was
 * never witnessed is not a failed test, it is an incomplete one.
 */
export function mechanicalRetest(verdict: CouponVerdict): RetestAllowance {
  const blockers = verdict.findings.filter((item) => item.severity === 'blocking');
  if (blockers.length === 0) {
    return {
      allowed: false,
      kind: 'mechanical',
      specimens: 0,
      reason: 'the coupon passed, so there is nothing to retest',
    };
  }
  const recordFaults = blockers.filter((item) => item.code.startsWith('pqr.'));
  if (recordFaults.length > 0) {
    return {
      allowed: false,
      kind: 'mechanical',
      specimens: 0,
      reason: 'the record itself is at fault, which a retest does not fix',
    };
  }
  const tensileFailed = blockers.some((item) => item.code === 'tensile.below_minimum');
  const bendFailed = blockers.some((item) => item.code === 'bend.open_discontinuity');
  if (!tensileFailed && !bendFailed) {
    return {
      allowed: false,
      kind: 'mechanical',
      specimens: 0,
      reason: 'the failure was not in a mechanical test',
    };
  }
  const original = verdict.plan.tensileCount + (verdict.plan.bends?.total ?? 0);
  return {
    allowed: true,
    kind: 'mechanical',
    specimens: original * 2,
    reason: `double the specimens from the same coupon, and every one has to pass`,
  };
}

/**
 * An impact set may be retested when the failure was a scatter failure rather
 * than a level failure. If the average itself missed, the deposit is not tough
 * enough and three more specimens will not change that.
 */
export function impactRetest(set: ImpactSet, requirement: ImpactRequirement): RetestAllowance {
  const verdict = gradeSet(set, requirement);
  if (verdict.accepted) {
    return {
      allowed: false,
      kind: 'impact',
      specimens: 0,
      reason: 'the set passed, so there is nothing to retest',
    };
  }
  if (verdict.averageFootPounds.lessThan(verdict.requiredAverage)) {
    return {
      allowed: false,
      kind: 'impact',
      specimens: 0,
      reason:
        'the average itself missed, so the deposit is not tough enough and a retest will not change it',
    };
  }
  return {
    allowed: true,
    kind: 'impact',
    specimens: 3,
    reason: 'the average made the number and the set failed on its scatter, which is retestable',
  };
}

/**
 * Whether a retest set actually passed. Every specimen has to make the average
 * figure, which is a harder bar than the original set faced.
 */
export function retestPassed(
  set: ImpactSet,
  requirement: ImpactRequirement,
): { passed: boolean; below: readonly string[] } {
  const verdict = gradeSet(set, requirement);
  const below = set.specimens
    .filter((specimen) => specimen.energyFootPounds.lessThan(verdict.requiredAverage))
    .map((specimen) => specimen.id);
  return { passed: below.length === 0, below };
}

export function retestFindings(allowance: RetestAllowance): readonly Finding[] {
  if (allowance.allowed) {
    return [
      advisory('retest.allowed', `${String(allowance.specimens)} specimens: ${allowance.reason}`, {
        clause: 'QW-320',
      }),
    ];
  }
  if (allowance.specimens === 0 && allowance.reason.includes('passed')) {
    return [];
  }
  return [blocking('retest.not_allowed', allowance.reason, { clause: 'QW-320' })];
}

export function totalRetestEnergy(set: ImpactSet): Decimal {
  return set.specimens.reduce(
    (running, specimen) => running.add(specimen.energyFootPounds),
    Decimal.zero(),
  );
}
