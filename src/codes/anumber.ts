import { Decimal, decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import { Interval } from '../core/interval.js';

/**
 * Weld deposit chemistry groups.
 *
 * Where an F number says how an electrode handles, an A number says what it
 * leaves behind. That is what the procedure rules care about, because the
 * deposit is what has to survive the service the vessel is built for.
 *
 * The classifier below reads a measured deposit analysis and says which group
 * it lands in. The order the groups are tried in is load bearing: chromium
 * nickel deposits satisfy the chromium bands of the martensitic and ferritic
 * groups as well, and only the nickel content tells them apart.
 */

export interface ElementBand {
  readonly element: Element;
  readonly range: Interval<Decimal>;
}

export type Element = 'C' | 'Cr' | 'Mo' | 'Ni' | 'Mn' | 'Si' | 'V';

/**
 * A reported analysis. An element the certificate did not report is absent,
 * and a caller building one field by field may hand the field over as
 * undefined and mean the same thing.
 */
export type DepositAnalysis = Partial<Record<Element, Decimal | undefined>>;

export interface ANumberFacts {
  readonly code: number;
  readonly description: string;
  readonly bands: readonly ElementBand[];
}

function band(element: Element, lower: string | null, upper: string | null): ElementBand {
  if (lower === null && upper === null) {
    return { element, range: Interval.unbounded<Decimal>() };
  }
  if (lower === null) {
    return { element, range: Interval.atMost(decimal(upper ?? '0')) };
  }
  if (upper === null) {
    return { element, range: Interval.atLeast(decimal(lower)) };
  }
  return { element, range: Interval.closed(decimal(lower), decimal(upper)) };
}

/**
 * Tried in order. The narrow high alloy groups come before the broad ones so
 * that a deposit lands in the most specific group it satisfies.
 */
const FACTS: readonly ANumberFacts[] = [
  {
    code: 9,
    description: 'chromium nickel, high alloy',
    bands: [band('C', null, '0.30'), band('Cr', '19.00', '30.00'), band('Ni', '15.00', '37.00')],
  },
  {
    code: 8,
    description: 'chromium nickel austenitic',
    bands: [band('C', null, '0.15'), band('Cr', '14.50', '30.00'), band('Ni', '7.50', '15.00')],
  },
  {
    code: 6,
    description: 'chromium martensitic',
    bands: [band('C', null, '0.15'), band('Cr', '11.00', '15.00')],
  },
  {
    code: 7,
    description: 'chromium ferritic',
    bands: [band('C', null, '0.15'), band('Cr', '11.00', '30.00'), band('Ni', null, '1.00')],
  },
  {
    code: 5,
    description: 'chromium six to ten and a half, molybdenum',
    bands: [band('C', null, '0.15'), band('Cr', '6.00', '10.50'), band('Mo', '0.40', '1.50')],
  },
  {
    code: 4,
    description: 'chromium two to six, molybdenum',
    bands: [band('C', null, '0.15'), band('Cr', '2.00', '6.00'), band('Mo', '0.40', '1.50')],
  },
  {
    code: 3,
    description: 'chromium point four to two, molybdenum',
    bands: [band('C', null, '0.15'), band('Cr', '0.40', '2.00'), band('Mo', '0.40', '0.65')],
  },
  {
    code: 12,
    description: 'nickel chromium molybdenum',
    bands: [
      band('C', null, '0.15'),
      band('Cr', null, '1.50'),
      band('Ni', '1.25', '2.80'),
      band('Mo', '0.25', '0.75'),
    ],
  },
  {
    code: 2,
    description: 'carbon molybdenum',
    bands: [band('C', null, '0.15'), band('Cr', null, '0.50'), band('Mo', '0.40', '0.65')],
  },
  {
    code: 11,
    description: 'manganese molybdenum',
    bands: [band('C', null, '0.17'), band('Mo', '0.25', '0.75'), band('Mn', '1.25', '2.25')],
  },
  {
    code: 10,
    description: 'nickel to four percent',
    bands: [band('C', null, '0.15'), band('Cr', null, '0.50'), band('Ni', '0.80', '4.00')],
  },
  {
    code: 1,
    description: 'mild steel',
    bands: [
      band('C', null, '0.20'),
      band('Cr', null, '0.20'),
      band('Mo', null, '0.30'),
      band('Ni', null, '0.50'),
      band('Mn', null, '1.60'),
      band('Si', null, '1.00'),
    ],
  },
];

const BY_CODE = new Map(FACTS.map((facts) => [facts.code, facts]));

export function isANumber(code: number): boolean {
  return BY_CODE.has(code);
}

export function parseANumber(value: string | number): number {
  const code =
    typeof value === 'number'
      ? value
      : Number(
          String(value)
            .trim()
            .replace(/^A-?N?O?\.?\s*/i, ''),
        );
  if (!Number.isInteger(code) || !BY_CODE.has(code)) {
    throw new ValidationError('aNumber', `not an A number: ${value}`, { value });
  }
  return code;
}

export function aNumberFacts(code: number): ANumberFacts {
  const facts = BY_CODE.get(code);
  if (facts === undefined) {
    throw new ValidationError('aNumber', `no facts recorded for A number ${code}`, { code });
  }
  return facts;
}

export function allANumbers(): readonly ANumberFacts[] {
  return FACTS;
}

/**
 * Whether an analysis satisfies every band of a group. An element the analysis
 * does not report is treated as absent, which is what a certificate that omits
 * it means in practice.
 */
export function analysisFitsGroup(analysis: DepositAnalysis, code: number): boolean {
  return aNumberFacts(code).bands.every((limit) =>
    limit.range.contains(analysis[limit.element] ?? Decimal.zero()),
  );
}

/**
 * The A number a measured deposit belongs to, or undefined when it belongs to
 * none of them and has to be recorded by chemistry instead.
 */
export function classifyDeposit(analysis: DepositAnalysis): number | undefined {
  for (const facts of FACTS) {
    if (analysisFitsGroup(analysis, facts.code)) {
      return facts.code;
    }
  }
  return undefined;
}

/** An A number speaks only for itself. There is no ladder here. */
export function qualifiesANumber(coupon: number, production: number): boolean {
  return parseANumber(coupon) === parseANumber(production);
}

export function describeANumber(code: number): string {
  const facts = aNumberFacts(code);
  return `A-No ${facts.code} (${facts.description})`;
}
