import { ValidationError } from '../core/errors.js';

/**
 * Reading a filler metal classification.
 *
 * The classification printed on the electrode carton already encodes most of
 * what the procedure rules need, and copying it out by hand into an F number
 * field is where the mistakes get made. E7018 is a low hydrogen all position
 * seventy ksi electrode, F number four, deposit group one, and every one of
 * those facts is in the four digits.
 *
 * Nothing here guesses. Where the classification does not say, the parser
 * leaves the field undefined and the record has to carry an explicit value.
 */

export type Designator = 'E' | 'ER' | 'EC' | 'ERC' | 'EM' | 'EB' | 'RG';

export interface FillerClassification {
  /** The AWS or SFA specification, written without its prefix, as `5.1`. */
  readonly specification: string;
  readonly classification: string;
  readonly designator: Designator;
  /** Minimum tensile strength of the deposit in thousands of pounds. */
  readonly minimumTensileKsi: number | undefined;
  readonly usabilityCode: number | undefined;
  readonly suffix: string | undefined;
  readonly fNumber: number | undefined;
  readonly aNumber: number | undefined;
  readonly lowHydrogen: boolean;
  readonly allPosition: boolean;
}

/** The last two digits of a covered electrode say how it runs. */
const USABILITY_TO_F: Readonly<Record<number, number>> = {
  10: 3,
  11: 3,
  12: 2,
  13: 2,
  14: 2,
  15: 4,
  16: 4,
  18: 4,
  19: 4,
  20: 1,
  24: 1,
  27: 1,
  28: 4,
  48: 4,
};

const LOW_HYDROGEN_USABILITY = new Set([15, 16, 18, 19, 28, 48]);

/** The alloy suffix says what the deposit is, which is the A number. */
const SUFFIX_TO_A: Readonly<Record<string, number>> = {
  A1: 2,
  B1: 3,
  B2: 3,
  B2L: 3,
  B3: 4,
  B3L: 4,
  B6: 4,
  B6L: 4,
  B8: 5,
  B9: 5,
  C1: 10,
  C1L: 10,
  C2: 10,
  C3: 10,
  C4: 10,
  D1: 11,
  D2: 11,
  D3: 11,
  NM: 12,
  W: 12,
  K2: 12,
  M: 1,
};

/** Austenitic grades that carry enough nickel to leave group eight. */
const HIGH_ALLOY_GRADES = new Set(['310', '310S', '330', '320', '320LR']);

const COVERED = /^E(\d{2,3})(\d)(\d)(?:-(.+))?$/;
const CORED = /^E(\d)(\d)T([\dG]{1,2})?(?:-(.+))?$/;
const WIRE = /^(ER|EC|ERC|EM|EB|RG)(\d{2,3})([A-Z]*)(?:-(.+))?$/;
const STAINLESS = /^(E|ER|EC)(\d{3}[A-Z]*)(?:-(\d{2}))?$/;

export function parseClassification(text: string): FillerClassification {
  const trimmed = text.trim().toUpperCase();
  const parts = trimmed.replace(/^(SFA|AWS|ASME)\s+/, '$1-').split(/\s+/);
  if (parts.length !== 2) {
    throw new ValidationError(
      'classification',
      `expected a specification and a classification, as "SFA-5.1 E7018": ${text}`,
      { text },
    );
  }
  const specification = readSpecification(parts[0] ?? '');
  const classification = parts[1] ?? '';
  return readClassification(specification, classification);
}

function readSpecification(text: string): string {
  const match = /^(?:SFA|AWS|ASME)?-?A?(\d+\.\d+[A-Z]?)$/.exec(text);
  if (match === null) {
    throw new ValidationError('specification', `not a filler specification: ${text}`, { text });
  }
  return match[1] ?? '';
}

function readClassification(specification: string, classification: string): FillerClassification {
  const stainless = STAINLESS.exec(classification);
  if (stainless !== null && isStainlessGrade(stainless[2] ?? '')) {
    return stainlessFacts(specification, classification, stainless);
  }
  const cored = CORED.exec(classification);
  if (cored !== null) {
    return coredFacts(specification, classification, cored);
  }
  const covered = COVERED.exec(classification);
  if (covered !== null) {
    return coveredFacts(specification, classification, covered);
  }
  const wire = WIRE.exec(classification);
  if (wire !== null) {
    return wireFacts(specification, classification, wire);
  }
  throw new ValidationError('classification', `cannot read the classification ${classification}`, {
    classification,
  });
}

function coveredFacts(
  specification: string,
  classification: string,
  match: RegExpExecArray,
): FillerClassification {
  const usability = Number(`${match[2] ?? ''}${match[3] ?? ''}`);
  const suffix = match[4];
  return {
    specification,
    classification,
    designator: 'E',
    minimumTensileKsi: Number(match[1] ?? '0'),
    usabilityCode: usability,
    suffix,
    fNumber: USABILITY_TO_F[usability],
    aNumber: suffix === undefined ? 1 : SUFFIX_TO_A[suffix],
    lowHydrogen: LOW_HYDROGEN_USABILITY.has(usability),
    allPosition: match[2] === '1',
  };
}

function coredFacts(
  specification: string,
  classification: string,
  match: RegExpExecArray,
): FillerClassification {
  const suffix = match[4];
  return {
    specification,
    classification,
    designator: 'E',
    minimumTensileKsi: Number(match[1] ?? '0') * 10,
    usabilityCode: match[3] === undefined ? undefined : Number(match[3]),
    suffix,
    fNumber: 6,
    aNumber: suffix === undefined ? 1 : (SUFFIX_TO_A[suffix] ?? 1),
    lowHydrogen: true,
    allPosition: match[2] === '1',
  };
}

function wireFacts(
  specification: string,
  classification: string,
  match: RegExpExecArray,
): FillerClassification {
  const suffix = match[4];
  return {
    specification,
    classification,
    designator: (match[1] ?? 'ER') as Designator,
    minimumTensileKsi: Number(match[2] ?? '0'),
    usabilityCode: undefined,
    suffix,
    fNumber: 6,
    aNumber: suffix === undefined ? 1 : (SUFFIX_TO_A[suffix] ?? 1),
    lowHydrogen: true,
    allPosition: true,
  };
}

function stainlessFacts(
  specification: string,
  classification: string,
  match: RegExpExecArray,
): FillerClassification {
  const designator = (match[1] ?? 'E') as Designator;
  const grade = match[2] ?? '';
  const usability = match[3] === undefined ? undefined : Number(match[3]);
  return {
    specification,
    classification,
    designator,
    minimumTensileKsi: undefined,
    usabilityCode: usability,
    suffix: undefined,
    fNumber: designator === 'E' ? 5 : 6,
    aNumber: HIGH_ALLOY_GRADES.has(grade) ? 9 : 8,
    lowHydrogen: true,
    allPosition: usability === undefined || usability === 16 || usability === 17,
  };
}

function isStainlessGrade(grade: string): boolean {
  const digits = Number(grade.replace(/[A-Z]+$/, ''));
  return digits >= 200 && digits <= 399;
}

export function describeClassification(facts: FillerClassification): string {
  const bits = [`SFA-${facts.specification} ${facts.classification}`];
  if (facts.fNumber !== undefined) {
    bits.push(`F-No ${facts.fNumber}`);
  }
  if (facts.aNumber !== undefined) {
    bits.push(`A-No ${facts.aNumber}`);
  }
  return bits.join(', ');
}
