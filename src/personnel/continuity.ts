import { advisory, blocking, deficiency, type Finding } from '../core/errors.js';
import { latest, type PlainDate } from '../core/plainDate.js';
import { isRevoked, type PerformanceQualification } from './welder.js';

/**
 * Continuity, which is the rule that quietly takes half a shop's
 * qualifications away every summer.
 *
 * A welder stays qualified with a process indefinitely, on one condition: they
 * have to have used it in the last six months. The clock runs per process and
 * it restarts on every day the welder deposits metal with that process, on
 * production or on a coupon. A man who runs covered electrode every day and
 * has not picked up a tungsten torch since February is qualified for one and
 * not the other, and the paperwork will say he is qualified for both unless
 * something is counting.
 *
 * Lapsing is not the same as being revoked. A lapse is renewed by welding one
 * coupon, and the renewal brings back everything the original coupon
 * qualified. A revocation is a judgement that the welder cannot do the work,
 * and nothing renews it except qualifying again from the start.
 */

export const CONTINUITY_MONTHS = 6;

export type ContinuityState = 'not-yet' | 'current' | 'lapsed' | 'revoked' | 'failed';

export interface ContinuityStatus {
  readonly state: ContinuityState;
  readonly lastUsed: PlainDate;
  readonly expiresOn: PlainDate;
  readonly daysRemaining: number;
  readonly reason: string;
}

/**
 * Days on which the welder deposited metal with this process. Production weld
 * log entries and coupons both count, and only the dates matter.
 */
export function continuityStatusOn(
  qualification: PerformanceQualification,
  usageDates: readonly PlainDate[],
  on: PlainDate,
): ContinuityStatus {
  const lastUsed = latest(
    qualification.weldedOn,
    ...usageDates.filter((day) => day.isOnOrBefore(on)),
  );
  const expiresOn = lastUsed.addMonths(CONTINUITY_MONTHS);
  const daysRemaining = on.daysUntil(expiresOn);

  if (!qualification.passed) {
    return {
      state: 'failed',
      lastUsed,
      expiresOn,
      daysRemaining,
      reason: 'the coupon did not pass its tests',
    };
  }
  if (isRevoked(qualification, on)) {
    return {
      state: 'revoked',
      lastUsed,
      expiresOn,
      daysRemaining,
      reason: qualification.revokedReason ?? 'withdrawn by the quality department',
    };
  }
  if (on.isBefore(qualification.weldedOn)) {
    return {
      state: 'not-yet',
      lastUsed,
      expiresOn,
      daysRemaining,
      reason: `the coupon was not welded until ${qualification.weldedOn.toString()}`,
    };
  }
  if (on.isAfter(expiresOn)) {
    return {
      state: 'lapsed',
      lastUsed,
      expiresOn,
      daysRemaining,
      reason: `${qualification.process} last used on ${lastUsed.toString()}, more than ${CONTINUITY_MONTHS} months ago`,
    };
  }
  return {
    state: 'current',
    lastUsed,
    expiresOn,
    daysRemaining,
    reason: `${qualification.process} last used on ${lastUsed.toString()}`,
  };
}

export function isCurrent(status: ContinuityStatus): boolean {
  return status.state === 'current';
}

/** Qualifications inside the warning window, soonest first. */
export function dueWithinDays(
  statuses: readonly { qualification: PerformanceQualification; status: ContinuityStatus }[],
  days: number,
): readonly { qualification: PerformanceQualification; status: ContinuityStatus }[] {
  return statuses
    .filter(
      (entry) =>
        entry.status.state === 'current' &&
        entry.status.daysRemaining >= 0 &&
        entry.status.daysRemaining <= days,
    )
    .sort((left, right) => left.status.daysRemaining - right.status.daysRemaining);
}

/**
 * A lapse is renewed by welding one coupon, and the renewal restores whatever
 * the original coupon qualified. Only the date moves.
 */
export function renew(
  qualification: PerformanceQualification,
  renewedOn: PlainDate,
): PerformanceQualification {
  return { ...qualification, weldedOn: renewedOn };
}

export function continuityFindings(
  qualification: PerformanceQualification,
  status: ContinuityStatus,
): readonly Finding[] {
  const subject = `${qualification.stencil} ${qualification.process}`;
  switch (status.state) {
    case 'current':
      return status.daysRemaining <= 30
        ? [
            advisory('continuity.due_soon', `${subject} lapses in ${status.daysRemaining} days`, {
              clause: 'QW-322.1',
              subject,
            }),
          ]
        : [];
    case 'lapsed':
      return [deficiency('continuity.lapsed', status.reason, { clause: 'QW-322.1', subject })];
    case 'revoked':
      return [
        blocking('continuity.revoked', `${subject} is revoked: ${status.reason}`, {
          clause: 'QW-322.2',
          subject,
        }),
      ];
    case 'failed':
      return [blocking('continuity.failed', `${subject} never passed its coupon`, { subject })];
    case 'not-yet':
      return [blocking('continuity.not_yet', status.reason, { subject })];
  }
}
