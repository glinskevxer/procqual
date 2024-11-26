import type { ProcessCode } from '../codes/process.js';
import { Decimal, decimal } from '../core/decimal.js';
import { advisory, blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { DEFAULT_POLICY, type ShopPolicy } from '../policy/shopPolicy.js';

/**
 * The repair rate, over a rolling window, per welder and per process.
 *
 * The number itself is easy. What takes the arguing is the sample size. A man
 * who has run three joints this quarter and had one cut out is at thirty three
 * percent, and that means nothing at all: one bad fit up on a Monday would put
 * anybody there. Acting on it costs a good welder a week of requalification
 * and teaches the shop that the number is noise.
 *
 * So the rate is only actionable once there are enough joints behind it. Below
 * that it is reported and watched, which is a different thing, and the report
 * has to say which of the two it is.
 */

export interface RatePolicy {
  readonly windowDays: number;
  readonly minimumSample: number;
  /** Above this the welder goes on the watch list. */
  readonly watchAt: Decimal;
  /** Above this the qualification is suspended pending a review. */
  readonly suspendAt: Decimal;
}

export function ratePolicyOf(policy: ShopPolicy): RatePolicy {
  return {
    windowDays: policy.repairWindowDays,
    minimumSample: policy.repairMinimumSample,
    watchAt: policy.repairWatchAt,
    suspendAt: policy.repairSuspendAt,
  };
}

export const SHOP_POLICY: RatePolicy = ratePolicyOf(DEFAULT_POLICY);

export interface WeldRecord {
  readonly stencil: string;
  readonly process: ProcessCode;
  readonly joint: string;
  readonly examinedOn: PlainDate;
  readonly repaired: boolean;
}

export type RateState = 'clear' | 'watch' | 'suspend' | 'insufficient-sample';

export interface RateReading {
  readonly stencil: string;
  readonly process: ProcessCode;
  readonly examined: number;
  readonly repaired: number;
  readonly rate: Decimal;
  readonly state: RateState;
  readonly from: PlainDate;
  readonly to: PlainDate;
}

export function windowFrom(to: PlainDate, policy: RatePolicy = SHOP_POLICY): PlainDate {
  if (!Number.isInteger(policy.windowDays) || policy.windowDays < 1) {
    throw new ValidationError('windowDays', 'the window is a whole number of days', {
      windowDays: policy.windowDays,
    });
  }
  return to.addDays(-policy.windowDays);
}

export function rateOf(examined: number, repaired: number): Decimal {
  if (examined <= 0) {
    return Decimal.zero();
  }
  return Decimal.fromInteger(repaired).divide(Decimal.fromInteger(examined), 4).normalized();
}

export function reading(
  records: readonly WeldRecord[],
  stencil: string,
  process: ProcessCode,
  to: PlainDate,
  policy: RatePolicy = SHOP_POLICY,
): RateReading {
  const from = windowFrom(to, policy);
  const inWindow = records.filter(
    (record) =>
      record.stencil === stencil &&
      record.process === process &&
      record.examinedOn.isOnOrAfter(from) &&
      record.examinedOn.isOnOrBefore(to),
  );
  const repaired = inWindow.filter((record) => record.repaired).length;
  const rate = rateOf(inWindow.length, repaired);
  return {
    stencil,
    process,
    examined: inWindow.length,
    repaired,
    rate,
    state: stateFor(inWindow.length, rate, policy),
    from,
    to,
  };
}

function stateFor(examined: number, rate: Decimal, policy: RatePolicy): RateState {
  if (examined < policy.minimumSample) {
    return 'insufficient-sample';
  }
  if (rate.greaterThan(policy.suspendAt)) {
    return 'suspend';
  }
  return rate.greaterThan(policy.watchAt) ? 'watch' : 'clear';
}

/** Every welder and process pair the records mention, read at one date. */
export function allReadings(
  records: readonly WeldRecord[],
  to: PlainDate,
  policy: RatePolicy = SHOP_POLICY,
): readonly RateReading[] {
  const pairs = new Map<string, { stencil: string; process: ProcessCode }>();
  for (const record of records) {
    pairs.set(`${record.stencil}|${record.process}`, {
      stencil: record.stencil,
      process: record.process,
    });
  }
  return [...pairs.values()]
    .map((pair) => reading(records, pair.stencil, pair.process, to, policy))
    .sort((left, right) => {
      const byRate = right.rate.compare(left.rate);
      return byRate === 0 ? left.stencil.localeCompare(right.stencil) : byRate;
    });
}

export function rateFindings(item: RateReading): readonly Finding[] {
  const subject = `${item.stencil} ${item.process}`;
  const percent = item.rate.multiply(decimal('100')).round(1, 'half-up').normalized().toString();
  switch (item.state) {
    case 'clear':
      return [];
    case 'insufficient-sample':
      return item.repaired === 0
        ? []
        : [
            advisory(
              'rate.small_sample',
              `${percent} percent over ${item.examined} joints, which is too few to act on`,
              { subject },
            ),
          ];
    case 'watch':
      return [
        deficiency(
          'rate.watch',
          `${percent} percent over ${item.examined} joints, which is over the watch level`,
          { subject },
        ),
      ];
    case 'suspend':
      return [
        blocking(
          'rate.suspend',
          `${percent} percent over ${item.examined} joints, which suspends the qualification pending a review`,
          { subject },
        ),
      ];
  }
}

export function suspended(readings: readonly RateReading[]): readonly RateReading[] {
  return readings.filter((item) => item.state === 'suspend');
}
