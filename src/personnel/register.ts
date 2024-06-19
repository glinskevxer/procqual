import type { ProcessCode } from '../codes/process.js';
import { blocking, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import {
  continuityFindings,
  continuityStatusOn,
  isCurrent,
  type ContinuityStatus,
} from './continuity.js';
import { scopeMisses, type JointRequirement, type ScopeMiss } from './scope.js';
import { isEmployed, type PerformanceQualification, type Welder } from './welder.js';

/**
 * The welder register, and the one question everybody asks it.
 *
 * Can this welder run this joint today. It is three separate questions wearing
 * one coat: is the coupon wide enough, is the clock still running, and is the
 * welder still on the books. A shop that only checks the first one puts a
 * lapsed man on a pressure seam, and a shop that only checks the second puts a
 * current man on a joint his coupon never reached.
 */

export interface RegisterEntry {
  readonly qualification: PerformanceQualification;
  /** P number of the coupon's base metal, which the coupon does not carry itself. */
  readonly couponPNumber: string;
  /** Days the welder deposited metal with this process. */
  readonly usageDates: readonly PlainDate[];
}

export interface Assessment {
  readonly qualification: PerformanceQualification;
  readonly continuity: ContinuityStatus;
  readonly misses: readonly ScopeMiss[];
  readonly allowed: boolean;
}

export interface RegisterQuery {
  readonly welder: Welder;
  readonly entries: readonly RegisterEntry[];
  readonly joint: JointRequirement;
  readonly on: PlainDate;
}

export function assessEntry(
  entry: RegisterEntry,
  joint: JointRequirement,
  on: PlainDate,
): Assessment {
  const continuity = continuityStatusOn(entry.qualification, entry.usageDates, on);
  const misses = scopeMisses(entry.qualification, entry.couponPNumber, joint);
  return {
    qualification: entry.qualification,
    continuity,
    misses,
    allowed: isCurrent(continuity) && misses.length === 0,
  };
}

export interface RegisterAnswer {
  readonly allowed: boolean;
  readonly used: PerformanceQualification | undefined;
  readonly assessments: readonly Assessment[];
  readonly findings: readonly Finding[];
}

export function canWeld(query: RegisterQuery): RegisterAnswer {
  if (!isEmployed(query.welder, query.on)) {
    return {
      allowed: false,
      used: undefined,
      assessments: [],
      findings: [
        blocking(
          'register.not_employed',
          `${query.welder.stencil} is not on the books on ${query.on.toString()}`,
          { subject: query.welder.stencil },
        ),
      ],
    };
  }
  const relevant = query.entries.filter(
    (entry) => entry.qualification.stencil === query.welder.stencil,
  );
  if (relevant.length === 0) {
    return {
      allowed: false,
      used: undefined,
      assessments: [],
      findings: [
        blocking('register.no_qualification', `${query.welder.stencil} holds no coupon at all`, {
          subject: query.welder.stencil,
        }),
      ],
    };
  }
  const assessments = relevant.map((entry) => assessEntry(entry, query.joint, query.on));
  const passing = assessments.find((assessment) => assessment.allowed);
  if (passing !== undefined) {
    return { allowed: true, used: passing.qualification, assessments, findings: [] };
  }
  return {
    allowed: false,
    used: undefined,
    assessments,
    findings: findingsFor(query, assessments),
  };
}

/**
 * The nearest miss, so a coordinator is told why rather than only no.
 *
 * The coupon reported is the one that came closest, because that is the one
 * worth renewing or the one whose limits are worth arguing about.
 */
function findingsFor(query: RegisterQuery, assessments: readonly Assessment[]): readonly Finding[] {
  const closest = [...assessments].sort((left, right) => cost(left) - cost(right))[0];
  if (closest === undefined) {
    return [];
  }
  const findings: Finding[] = [];
  const subject = `${query.welder.stencil} ${closest.qualification.number.toString()}`;
  for (const miss of closest.misses) {
    findings.push(blocking('register.out_of_scope', `${miss.field}: ${miss.detail}`, { subject }));
  }
  if (!isCurrent(closest.continuity)) {
    findings.push(...continuityFindings(closest.qualification, closest.continuity));
  }
  return findings;
}

function cost(assessment: Assessment): number {
  return assessment.misses.length * 10 + (isCurrent(assessment.continuity) ? 0 : 5);
}

/** Every welder who can run the joint today, best first by stencil. */
export function eligibleWelders(
  welders: readonly Welder[],
  entries: readonly RegisterEntry[],
  joint: JointRequirement,
  on: PlainDate,
): readonly Welder[] {
  return welders
    .filter((welder) => canWeld({ welder, entries, joint, on }).allowed)
    .sort((left, right) => left.stencil.localeCompare(right.stencil));
}

export function processesHeld(
  entries: readonly RegisterEntry[],
  stencil: string,
  on: PlainDate,
): readonly ProcessCode[] {
  const held = new Set<ProcessCode>();
  for (const entry of entries) {
    if (entry.qualification.stencil !== stencil) {
      continue;
    }
    if (isCurrent(continuityStatusOn(entry.qualification, entry.usageDates, on))) {
      held.add(entry.qualification.process);
    }
  }
  return [...held].sort();
}
