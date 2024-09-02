import { parseClassification } from '../codes/classification.js';
import { type Decimal, decimal } from '../core/decimal.js';
import { advisory, blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';
import type { PlainDate } from '../core/plainDate.js';
import { fahrenheit, type Temperature } from '../core/temperature.js';
import { classificationOf, needsHoldingOven } from '../materials/fillerMetal.js';

/**
 * Holding ovens and the exposure clock.
 *
 * A low hydrogen electrode is only low hydrogen while it is dry. Out of the
 * oven it takes moisture out of the shop air, the moisture goes into the weld
 * as hydrogen, and the hydrogen cracks the joint days later when everybody has
 * gone home. That is the whole reason for this file.
 *
 * The exposure limit is not one number. It comes down as the alloy content
 * goes up, because the stronger deposits are the ones that crack, so a
 * seventy ksi electrode gets four hours in the shop and a nine chrome one gets
 * one. An electrode past its limit is not scrap yet: it can be rebaked once.
 * Past a second exposure it is scrap, and the difference between those two is
 * worth getting right because a tin of electrodes is not cheap and a cracked
 * seam is a great deal less cheap.
 */

export const OVEN_RANGE = Interval.closed(fahrenheit('250'), fahrenheit('350'));
export const REBAKE_RANGE = Interval.closed(fahrenheit('700'), fahrenheit('800'));
export const MAXIMUM_REBAKES = 1;

export interface OvenReading {
  readonly oven: string;
  readonly at: string;
  readonly temperature: Temperature;
}

export interface Issue {
  readonly id: string;
  readonly consumable: string;
  readonly lot: string;
  readonly oven: string;
  readonly issuedTo: string;
  readonly issuedAt: string;
  readonly returnedAt?: string;
  /** Hours the electrodes have already been out of the oven on earlier issues. */
  readonly priorExposureHours: Decimal;
  readonly rebakes: number;
  readonly issuedOn: PlainDate;
}

/** Exposure allowance in hours, by the strength of the deposit. */
export function exposureLimitHours(consumableCode: string): Decimal | undefined {
  if (!needsHoldingOven(consumableCode)) {
    return undefined;
  }
  const facts = classificationOf(consumableCode);
  if (facts.fNumber === 5 || facts.fNumber === 43) {
    return decimal('4');
  }
  const strength = facts.minimumTensileKsi ?? 70;
  if (strength <= 70) {
    return decimal('4');
  }
  if (strength <= 90) {
    return decimal('2');
  }
  return decimal('1');
}

export function exposureLimitFor(specification: string, classification: string): Decimal {
  const facts = parseClassification(`${specification} ${classification}`);
  const strength = facts.minimumTensileKsi ?? 70;
  if (strength <= 70) {
    return decimal('4');
  }
  return strength <= 90 ? decimal('2') : decimal('1');
}

export function hoursBetween(from: string, to: string): Decimal {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new ValidationError('exposure', 'an exposure window needs two readable instants', {
      from,
      to,
    });
  }
  if (end < start) {
    throw new ValidationError('exposure', 'the electrodes came back before they went out', {
      from,
      to,
    });
  }
  return decimal(((end - start) / 3_600_000).toFixed(2)).normalized();
}

export function exposureSoFar(issue: Issue, now: string): Decimal {
  const end = issue.returnedAt ?? now;
  return issue.priorExposureHours.add(hoursBetween(issue.issuedAt, end));
}

export type IssueState = 'in-oven' | 'within-limit' | 'over-limit' | 'scrap' | 'not-controlled';

export function issueState(issue: Issue, now: string): IssueState {
  const limit = exposureLimitHours(issue.consumable);
  if (limit === undefined) {
    return 'not-controlled';
  }
  const exposure = exposureSoFar(issue, now);
  if (exposure.lessThanOrEqual(limit)) {
    return issue.returnedAt === undefined ? 'within-limit' : 'in-oven';
  }
  return issue.rebakes >= MAXIMUM_REBAKES ? 'scrap' : 'over-limit';
}

export function reviewIssue(issue: Issue, now: string): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = `${issue.consumable} lot ${issue.lot}`;
  const limit = exposureLimitHours(issue.consumable);
  if (limit === undefined) {
    return findings;
  }
  const exposure = exposureSoFar(issue, now);
  const state = issueState(issue, now);
  if (state === 'over-limit') {
    findings.push(
      deficiency(
        'consumable.over_exposure',
        `${exposure.toString()} hours out against a limit of ${limit.toString()}, so the tin goes back for a rebake`,
        { subject },
      ),
    );
  }
  if (state === 'scrap') {
    findings.push(
      blocking(
        'consumable.scrap',
        `${exposure.toString()} hours out after ${issue.rebakes} rebake, so the electrodes are scrap`,
        { subject },
      ),
    );
  }
  if (issue.rebakes > MAXIMUM_REBAKES) {
    findings.push(
      blocking(
        'consumable.rebaked_twice',
        `the tin has been rebaked ${issue.rebakes} times and only ${MAXIMUM_REBAKES} is allowed`,
        { subject },
      ),
    );
  }
  if (state === 'within-limit' && exposure.greaterThan(limit.multiply(decimal('0.75')))) {
    findings.push(
      advisory(
        'consumable.near_limit',
        `${exposure.toString()} hours out of a ${limit.toString()} hour allowance`,
        { subject },
      ),
    );
  }
  return findings;
}

export function reviewOven(readings: readonly OvenReading[]): readonly Finding[] {
  if (readings.length === 0) {
    return [
      deficiency('oven.no_readings', 'the holding oven has no logged temperature at all', {}),
    ];
  }
  return readings
    .filter((reading) => !OVEN_RANGE.contains(reading.temperature))
    .map((reading) =>
      blocking(
        'oven.out_of_range',
        `${reading.oven} logged ${reading.temperature.toString()} at ${reading.at}, outside ${OVEN_RANGE.toString()}`,
        { subject: reading.oven },
      ),
    );
}

export function rebakeAccepted(temperature: Temperature): boolean {
  return REBAKE_RANGE.contains(temperature);
}
