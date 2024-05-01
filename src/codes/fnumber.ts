import { ValidationError } from '../core/errors.js';
import type { ProcessCode } from './process.js';

/**
 * Filler metal grouping by how the electrode handles.
 *
 * F numbers are about usability, not chemistry. Two electrodes in the same F
 * number behave alike in the welder's hand, which is why the welder
 * qualification rules key on this and the procedure rules key on the A number.
 *
 * The one that trips people is the downward reach inside F numbers one to
 * four. It is real, and it applies to shielded metal arc only. A bare wire
 * coupon proves nothing about a covered electrode however hard it was to run.
 */

export interface FNumberFacts {
  readonly code: number;
  readonly description: string;
  readonly lowHydrogen: boolean;
  readonly bareWire: boolean;
  /** Processes this group is used with, since F numbers are not universal. */
  readonly processes: readonly ProcessCode[];
}

const FACTS: readonly FNumberFacts[] = [
  {
    code: 1,
    description: 'heavy coated iron powder electrodes',
    lowHydrogen: false,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 2,
    description: 'heavy coated rutile electrodes',
    lowHydrogen: false,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 3,
    description: 'high cellulose electrodes',
    lowHydrogen: false,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 4,
    description: 'low hydrogen electrodes',
    lowHydrogen: true,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 5,
    description: 'stainless steel covered electrodes',
    lowHydrogen: true,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 6,
    description: 'steel and steel alloy bare wire and rod',
    lowHydrogen: true,
    bareWire: true,
    processes: ['GTAW', 'GMAW', 'FCAW', 'SAW', 'PAW'],
  },
  {
    code: 21,
    description: 'aluminium one thousand series bare wire and rod',
    lowHydrogen: false,
    bareWire: true,
    processes: ['GTAW', 'GMAW'],
  },
  {
    code: 22,
    description: 'aluminium five thousand series bare wire and rod',
    lowHydrogen: false,
    bareWire: true,
    processes: ['GTAW', 'GMAW'],
  },
  {
    code: 23,
    description: 'aluminium four thousand series bare wire and rod',
    lowHydrogen: false,
    bareWire: true,
    processes: ['GTAW', 'GMAW'],
  },
  {
    code: 41,
    description: 'nickel alloy bare wire and rod',
    lowHydrogen: true,
    bareWire: true,
    processes: ['GTAW', 'GMAW', 'SAW'],
  },
  {
    code: 43,
    description: 'nickel chromium covered electrodes',
    lowHydrogen: true,
    bareWire: false,
    processes: ['SMAW'],
  },
  {
    code: 45,
    description: 'nickel iron chromium bare wire and rod',
    lowHydrogen: true,
    bareWire: true,
    processes: ['GTAW', 'GMAW'],
  },
];

const BY_CODE = new Map(FACTS.map((facts) => [facts.code, facts]));

/** The only F numbers with a downward reach, and only under SMAW. */
const COVERED_ELECTRODE_LADDER = [1, 2, 3, 4] as const;

export function isFNumber(value: number): boolean {
  return BY_CODE.has(value);
}

export function parseFNumber(value: string | number): number {
  const code =
    typeof value === 'number'
      ? value
      : Number(
          String(value)
            .trim()
            .replace(/^F-?N?O?\.?\s*/i, ''),
        );
  if (!Number.isInteger(code) || !BY_CODE.has(code)) {
    throw new ValidationError('fNumber', `not an F number this shop carries: ${value}`, {
      value,
    });
  }
  return code;
}

export function fNumberFacts(code: number): FNumberFacts {
  const facts = BY_CODE.get(code);
  if (facts === undefined) {
    throw new ValidationError('fNumber', `no facts recorded for F number ${code}`, { code });
  }
  return facts;
}

export function allFNumbers(): readonly FNumberFacts[] {
  return FACTS;
}

export function isUsedWith(code: number, process: ProcessCode): boolean {
  return fNumberFacts(code).processes.includes(process);
}

/**
 * F numbers a coupon speaks for, best first.
 *
 * Outside the covered electrode ladder an F number speaks only for itself, and
 * the ladder only applies when the coupon was run with shielded metal arc.
 */
export function fNumbersQualifiedBy(code: number, process: ProcessCode): readonly number[] {
  const own = fNumberFacts(code).code;
  const onLadder = (COVERED_ELECTRODE_LADDER as readonly number[]).includes(own);
  if (process !== 'SMAW' || !onLadder) {
    return [own];
  }
  return COVERED_ELECTRODE_LADDER.filter((candidate) => candidate <= own);
}

export function qualifiesFNumber(
  coupon: number,
  process: ProcessCode,
  production: number,
): boolean {
  return fNumbersQualifiedBy(coupon, process).includes(parseFNumber(production));
}

/**
 * Whether the filler has to be kept in a holding oven and has an exposure
 * clock running once it leaves one.
 */
export function needsAtmosphericControl(code: number): boolean {
  const facts = fNumberFacts(code);
  return facts.lowHydrogen && !facts.bareWire;
}

export function describeFNumber(code: number): string {
  const facts = fNumberFacts(code);
  return `F-No ${facts.code} (${facts.description})`;
}
