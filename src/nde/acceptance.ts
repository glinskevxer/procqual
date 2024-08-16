import { blocking, type Finding, ValidationError } from '../core/errors.js';
import { inches, type Length } from '../core/units.js';
import type { Examination, Indication } from './examination.js';

/**
 * Whether what the technician found is a defect.
 *
 * The rules are not the same for the three families of method and they are not
 * the same for every indication either.
 *
 * Cracks, lack of fusion and lack of penetration are rejected outright at any
 * size. There is no measurement and no argument, and putting them through the
 * same length arithmetic as slag is the mistake worth guarding against.
 *
 * Slag and other elongated indications are measured against a limit that moves
 * with the thickness in three bands, and the middle band is a fraction of the
 * thickness rather than a fixed figure. A quarter inch of slag passes on half
 * inch plate and fails on nothing thinner.
 */

export type Verdict = 'accept' | 'reject';

export interface IndicationVerdict {
  readonly indication: Indication;
  readonly verdict: Verdict;
  readonly limit: Length | undefined;
  readonly reason: string;
}

const ALWAYS_REJECTED = new Set<Indication['type']>([
  'crack',
  'incomplete-fusion',
  'incomplete-penetration',
]);

const THREE_QUARTERS = inches('0.75');
const TWO_AND_A_QUARTER = inches('2.25');
const QUARTER = inches('0.25');
const ROUNDED_LIMIT = inches('0.1875');
const UNDERCUT_LIMIT = inches('0.03125');

/**
 * Length limit for an elongated indication seen through the thickness.
 *
 * Under three quarters of an inch the limit is a flat quarter inch. From there
 * to two and a quarter it is a third of the thickness, so it grows with the
 * section. Above that it is a flat three quarters again.
 */
export function elongatedLimit(thickness: Length): Length {
  if (!thickness.toInches().isPositive()) {
    throw new ValidationError('thickness', 'thickness must be greater than zero', {});
  }
  if (thickness.lessThanOrEqual(THREE_QUARTERS)) {
    return QUARTER;
  }
  if (thickness.lessThanOrEqual(TWO_AND_A_QUARTER)) {
    return thickness.scaleBy('0.3333');
  }
  return THREE_QUARTERS;
}

export function judgeRadiographic(indication: Indication, thickness: Length): IndicationVerdict {
  if (ALWAYS_REJECTED.has(indication.type)) {
    return {
      indication,
      verdict: 'reject',
      limit: undefined,
      reason: `a ${indication.type} indication is rejected at any size`,
    };
  }
  if (indication.type === 'porosity') {
    return {
      indication,
      verdict: indication.size.greaterThan(ROUNDED_LIMIT) ? 'reject' : 'accept',
      limit: ROUNDED_LIMIT,
      reason: `rounded indications are limited to ${ROUNDED_LIMIT.toFraction()}`,
    };
  }
  if (indication.type === 'undercut') {
    return {
      indication,
      verdict: indication.size.greaterThan(UNDERCUT_LIMIT) ? 'reject' : 'accept',
      limit: UNDERCUT_LIMIT,
      reason: `undercut is limited to ${UNDERCUT_LIMIT.toFraction()}`,
    };
  }
  if (indication.type === 'geometric') {
    return {
      indication,
      verdict: 'accept',
      limit: undefined,
      reason: 'a geometric indication is not a discontinuity in the weld',
    };
  }
  const limit = elongatedLimit(thickness);
  return {
    indication,
    verdict: indication.size.greaterThan(limit) ? 'reject' : 'accept',
    limit,
    reason: `elongated indications are limited to ${limit.toFraction()} at this thickness`,
  };
}

/**
 * Surface methods do not care how deep anything is, only whether it is linear.
 * An indication three times longer than it is wide is linear, and any linear
 * indication is rejected.
 */
export function judgeSurface(indication: Indication): IndicationVerdict {
  if (ALWAYS_REJECTED.has(indication.type)) {
    return {
      indication,
      verdict: 'reject',
      limit: undefined,
      reason: `a ${indication.type} indication is rejected at any size`,
    };
  }
  if (indication.type === 'porosity') {
    return {
      indication,
      verdict: indication.size.greaterThan(ROUNDED_LIMIT) ? 'reject' : 'accept',
      limit: ROUNDED_LIMIT,
      reason: `rounded indications are limited to ${ROUNDED_LIMIT.toFraction()}`,
    };
  }
  if (indication.type === 'geometric') {
    return {
      indication,
      verdict: 'accept',
      limit: undefined,
      reason: 'a geometric indication is not a discontinuity in the weld',
    };
  }
  return {
    indication,
    verdict: 'reject',
    limit: undefined,
    reason: 'any linear indication is rejected on a surface examination',
  };
}

export function judge(
  examination: Examination,
  indication: Indication,
  thickness: Length,
): IndicationVerdict {
  return examination.method === 'MT' || examination.method === 'PT'
    ? judgeSurface(indication)
    : judgeRadiographic(indication, thickness);
}

export interface AcceptanceResult {
  readonly verdicts: readonly IndicationVerdict[];
  readonly accepted: boolean;
  readonly findings: readonly Finding[];
}

export function judgeExamination(examination: Examination, thickness: Length): AcceptanceResult {
  const verdicts = examination.indications.map((indication) =>
    judge(examination, indication, thickness),
  );
  const findings: Finding[] = verdicts
    .filter((item) => item.verdict === 'reject')
    .map((item) =>
      blocking(
        'nde.rejected',
        `${item.indication.type} of ${item.indication.size.toFraction()} at ${item.indication.fromDatum.toFraction()} from the datum: ${item.reason}`,
        { clause: 'UW-51', subject: examination.id },
      ),
    );
  return { verdicts, accepted: findings.length === 0, findings };
}

export function rejectedIndications(result: AcceptanceResult): readonly Indication[] {
  return result.verdicts.filter((item) => item.verdict === 'reject').map((item) => item.indication);
}
