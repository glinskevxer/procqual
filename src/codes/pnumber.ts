import { ValidationError } from '../core/errors.js';

/**
 * Base metal groupings.
 *
 * A P number puts together metals that weld enough alike that one procedure
 * qualification can speak for all of them. A group number splits a P number
 * further, and it only starts to matter when the construction code asks for
 * notch toughness, which is the first place in this system where one rule
 * decides whether another rule is even read.
 */

export interface PNumberFacts {
  readonly code: string;
  readonly family: string;
  /** Group numbers that exist under this P number, in ascending order. */
  readonly groups: readonly number[];
  /** Preheat is normally called for above this thickness in inches, or never. */
  readonly preheatFamily: 'none' | 'carbon' | 'low-alloy' | 'chrome-moly' | 'austenitic';
  /** Post weld heat treatment is customary for this family. */
  readonly pwhtCustomary: boolean;
}

const FACTS: readonly PNumberFacts[] = [
  { code: '1', family: 'carbon steel', groups: [1, 2, 3, 4], preheatFamily: 'carbon', pwhtCustomary: false },
  { code: '3', family: 'half molybdenum and carbon manganese steel', groups: [1, 2, 3], preheatFamily: 'low-alloy', pwhtCustomary: true },
  { code: '4', family: 'one and a quarter chrome half moly', groups: [1, 2], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '5A', family: 'two and a quarter chrome one moly', groups: [1], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '5B', family: 'five to nine chrome moly', groups: [1, 2], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '5C', family: 'chrome moly with vanadium', groups: [1], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '6', family: 'martensitic stainless', groups: [1, 2, 3], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '7', family: 'ferritic stainless', groups: [1, 2], preheatFamily: 'low-alloy', pwhtCustomary: false },
  { code: '8', family: 'austenitic stainless', groups: [1, 2, 3, 4], preheatFamily: 'austenitic', pwhtCustomary: false },
  { code: '9A', family: 'two and a quarter nickel steel', groups: [1], preheatFamily: 'low-alloy', pwhtCustomary: true },
  { code: '9B', family: 'three and a half nickel steel', groups: [1], preheatFamily: 'low-alloy', pwhtCustomary: true },
  { code: '10H', family: 'duplex stainless', groups: [1], preheatFamily: 'austenitic', pwhtCustomary: false },
  { code: '11A', family: 'quenched and tempered high strength steel', groups: [1, 2, 3, 4, 5], preheatFamily: 'low-alloy', pwhtCustomary: true },
  { code: '15E', family: 'nine chrome one moly vanadium', groups: [1], preheatFamily: 'chrome-moly', pwhtCustomary: true },
  { code: '21', family: 'aluminium, one thousand series', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '22', family: 'aluminium, five thousand series', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '23', family: 'aluminium, six thousand series', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '41', family: 'nickel two hundred', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '42', family: 'nickel copper alloy', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '43', family: 'nickel chromium alloy', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
  { code: '45', family: 'nickel iron chromium alloy', groups: [1], preheatFamily: 'none', pwhtCustomary: false },
];

const BY_CODE = new Map(FACTS.map((facts) => [facts.code, facts]));

/**
 * What a coupon of one P number also speaks for.
 *
 * The list is the downward reach only. Welding a chrome moly coupon proves
 * enough about the easier metals below it, and never the reverse.
 */
const REACHES_DOWN: Readonly<Record<string, readonly string[]>> = {
  '3': ['1'],
  '4': ['3', '1'],
  '5A': ['4', '3', '1'],
  '5B': ['5A', '4', '3', '1'],
  '5C': ['5B', '5A', '4', '3', '1'],
  '9A': ['3', '1'],
  '9B': ['9A', '3', '1'],
  '15E': ['5B', '5A', '4', '3', '1'],
};

export function isPNumber(value: string): boolean {
  return BY_CODE.has(normalise(value));
}

export function parsePNumber(value: string): string {
  const code = normalise(value);
  if (!BY_CODE.has(code)) {
    throw new ValidationError('pNumber', `not a P number this shop carries: ${value}`, {
      value,
    });
  }
  return code;
}

export function pNumberFacts(code: string): PNumberFacts {
  const facts = BY_CODE.get(normalise(code));
  if (facts === undefined) {
    throw new ValidationError('pNumber', `no facts recorded for P number ${code}`, { code });
  }
  return facts;
}

export function allPNumbers(): readonly PNumberFacts[] {
  return FACTS;
}

export function hasGroup(code: string, group: number): boolean {
  return pNumberFacts(code).groups.includes(group);
}

/**
 * Base metals a single coupon P number qualifies, itself included, best first.
 */
export function pNumbersQualifiedBy(code: string): readonly string[] {
  const own = parsePNumber(code);
  return [own, ...(REACHES_DOWN[own] ?? [])];
}

export function qualifiesPNumber(coupon: string, production: string): boolean {
  return pNumbersQualifiedBy(coupon).includes(parsePNumber(production));
}

/**
 * Whether the joint puts two different P numbers together, which needs its own
 * qualification rather than either of the single metal ones.
 */
export function isDissimilar(left: string, right: string): boolean {
  return parsePNumber(left) !== parsePNumber(right);
}

/**
 * Whether the group number has to be recorded and matched at all.
 *
 * Outside impact tested work a group number is a filing detail. Once the
 * construction code calls for notch toughness the group becomes part of what
 * the procedure qualified, and a coupon in one group stops speaking for
 * another group of the same P number.
 */
export function groupIsEssential(impactTestingRequired: boolean): boolean {
  return impactTestingRequired;
}

export function groupsQualifiedBy(
  code: string,
  group: number,
  impactTestingRequired: boolean,
): readonly number[] {
  const facts = pNumberFacts(code);
  if (!facts.groups.includes(group)) {
    throw new ValidationError('group', `P number ${facts.code} has no group ${group}`, {
      code: facts.code,
      group,
      groups: facts.groups,
    });
  }
  if (!groupIsEssential(impactTestingRequired)) {
    return facts.groups;
  }
  return facts.groups.filter((candidate) => candidate <= group);
}

export function describePNumber(code: string): string {
  const facts = pNumberFacts(code);
  return `P-No ${facts.code} (${facts.family})`;
}

function normalise(value: string): string {
  return value.trim().toUpperCase().replace(/^P-?N?O?\.?\s*/i, '');
}
