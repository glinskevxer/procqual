import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import { inches, type Length } from '../core/units.js';

/**
 * Spot radiography, and what happens when a spot fails.
 *
 * Spot examination is a sampling scheme, one film for every fifty feet of weld
 * a welder lays with a process, and the sample is the point. What makes it
 * work is not the first film, it is what the code makes you do when the first
 * film is bad.
 *
 * A failed spot buys two more films from the same fifty feet, one either side
 * of the bad one. If both of those are clean, the original defect is cut out
 * and that is the end of it. If either is bad, the sampling has told you the
 * increment is bad rather than the spot, and the whole fifty feet is either
 * radiographed completely or cut out and rewelded. That escalation is the
 * whole scheme, and a shop that reads a failed spot as "repair that one place"
 * has quietly turned spot radiography into nothing at all.
 */

export const INCREMENT_LENGTH = inches('600');
export const MINIMUM_FILM_LENGTH = inches('6');

export type IncrementState =
  | 'not-started'
  | 'satisfied'
  | 'two-more-required'
  | 'increment-rejected';

export interface Spot {
  readonly id: string;
  readonly examination: string;
  /** Which fifty foot increment of that welder's work this film came from. */
  readonly increment: number;
  readonly filmLength: Length;
  readonly accepted: boolean;
  /** A film taken because an earlier one in the same increment failed. */
  readonly additional: boolean;
}

export interface IncrementReading {
  readonly increment: number;
  readonly state: IncrementState;
  readonly spots: readonly Spot[];
  readonly reason: string;
}

/** How many increments a length of weld is split into. */
export function incrementsFor(weldLength: Length): number {
  if (!weldLength.toInches().isPositive()) {
    throw new ValidationError('weldLength', 'the weld has no length', {});
  }
  const ratio = weldLength.toInches().divide(INCREMENT_LENGTH.toInches(), 6);
  return Math.ceil(ratio.toNumber());
}

export function spotsRequired(weldLength: Length): number {
  return incrementsFor(weldLength);
}

export function readIncrement(increment: number, spots: readonly Spot[]): IncrementReading {
  const mine = spots
    .filter((spot) => spot.increment === increment)
    .sort((left, right) => Number(left.additional) - Number(right.additional));
  const original = mine.find((spot) => !spot.additional);
  const additional = mine.filter((spot) => spot.additional);

  if (original === undefined) {
    return {
      increment,
      state: 'not-started',
      spots: mine,
      reason: 'no film has been taken from this increment',
    };
  }
  if (original.accepted) {
    return {
      increment,
      state: 'satisfied',
      spots: mine,
      reason: 'the spot was clean',
    };
  }
  if (additional.length < 2) {
    return {
      increment,
      state: 'two-more-required',
      spots: mine,
      reason: `the spot was rejected, so two more films are needed and ${additional.length} has been taken`,
    };
  }
  const bad = additional.filter((spot) => !spot.accepted);
  if (bad.length > 0) {
    return {
      increment,
      state: 'increment-rejected',
      spots: mine,
      reason:
        'one of the two additional films was rejected as well, so the whole increment is fully radiographed or cut out',
    };
  }
  return {
    increment,
    state: 'satisfied',
    spots: mine,
    reason: 'both additional films were clean, so only the original defect is repaired',
  };
}

export function readAllIncrements(
  weldLength: Length,
  spots: readonly Spot[],
): readonly IncrementReading[] {
  const count = incrementsFor(weldLength);
  return Array.from({ length: count }, (_unused, index) => readIncrement(index + 1, spots));
}

export function coverageFindings(readings: readonly IncrementReading[]): readonly Finding[] {
  const findings: Finding[] = [];
  for (const item of readings) {
    const subject = `increment ${item.increment}`;
    switch (item.state) {
      case 'not-started':
        findings.push(deficiency('coverage.no_spot', item.reason, { clause: 'UW-52', subject }));
        break;
      case 'two-more-required':
        findings.push(
          deficiency('coverage.two_more_required', item.reason, { clause: 'UW-52', subject }),
        );
        break;
      case 'increment-rejected':
        findings.push(
          blocking('coverage.increment_rejected', item.reason, { clause: 'UW-52', subject }),
        );
        break;
      case 'satisfied':
        break;
    }
  }
  return findings;
}

export function shortFilms(spots: readonly Spot[]): readonly Spot[] {
  return spots.filter((spot) => spot.filmLength.lessThan(MINIMUM_FILM_LENGTH));
}

/**
 * Films too short to be a spot. This lives here rather than in the command
 * that prints it, because every `coverage.` finding has to come from the one
 * place or the codes stop meaning anything to somebody grepping a report.
 */
export function shortFilmFindings(spots: readonly Spot[]): readonly Finding[] {
  return shortFilms(spots).map((film) =>
    deficiency(
      'coverage.short_film',
      `${film.id} covers ${film.filmLength.toFraction()} against ${MINIMUM_FILM_LENGTH.toFraction()} required for a spot`,
      { clause: 'UW-52', subject: film.id },
    ),
  );
}

export function isSatisfied(readings: readonly IncrementReading[]): boolean {
  return readings.every((item) => item.state === 'satisfied');
}
