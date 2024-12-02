import {
  positionsForWeldType,
  positionsQualifiedBy,
  TEST_POSITIONS,
  type TestPosition,
} from '../codes/position.js';
import type { ProcessCode } from '../codes/process.js';
import { qualifiedBaseMetalRange } from '../codes/thicknessRange.js';
import { inches, maxLength, type Length } from '../core/units.js';
import type { ProcedureQualificationRecord } from './pqr.js';
import { scopesFor } from './qualifiedRanges.js';
import { supportFindings } from './support.js';
import type { WeldingProcedureSpecification } from './wps.js';

/**
 * What coupon would close the gap.
 *
 * Everything else in the qualification code runs forwards: here is a coupon,
 * here is what it covers. This runs the thickness table backwards, which is
 * the question a welding engineer actually has when a procedure will not
 * support the job. Not "what does this coupon give me" but "what is the
 * thinnest coupon that gives me what I need", because coupon material is
 * bought by weight and a two inch coupon of chrome moly is a real cost.
 *
 * The answer is deliberately a suggestion rather than an instruction. It gets
 * the thickness, the position and the process right, and it says nothing about
 * the twenty other things a welding engineer decides when writing a coupon up.
 */

const THREE_QUARTERS = inches('0.75');
const SIXTEENTH = inches('0.0625');

export interface CouponSuggestion {
  readonly process: ProcessCode;
  readonly couponThickness: Length;
  readonly position: TestPosition;
  readonly pNumber: string;
  readonly fNumber: number;
  readonly toughnessRequired: boolean;
  readonly reasons: readonly string[];
}

/**
 * The thinnest coupon whose qualified range reaches a production thickness.
 *
 * Below three quarters of an inch the range is twice the coupon, so half the
 * production thickness does it. At and above three quarters the range jumps
 * to a flat eight inches, so a three quarter inch coupon covers everything up
 * to eight and nothing thicker will help until six inches.
 */
export function thinnestCouponFor(production: Length, process: ProcessCode): Length {
  if (production.lessThan(SIXTEENTH)) {
    // Under a sixteenth the range runs from the coupon rather than from the
    // fixed floor, so the coupon has to be the part itself.
    return production;
  }
  const half = production.scaleBy('0.5');
  const candidate = maxLength(half, SIXTEENTH);
  if (candidate.greaterThanOrEqual(THREE_QUARTERS)) {
    return THREE_QUARTERS;
  }
  const conditions = {
    couponThickness: candidate,
    depositThickness: candidate,
    process,
    heatTreatedAboveTransformation: false,
  };
  if (qualifiedBaseMetalRange(conditions).contains(production)) {
    return candidate;
  }
  return THREE_QUARTERS;
}

/** The cheapest coupon position that covers every position a procedure claims. */
export function positionFor(
  wanted: readonly string[],
  weldType: 'groove' | 'fillet',
): TestPosition | undefined {
  const covers = (position: TestPosition): boolean => {
    const covered = positionsQualifiedBy(position, weldType);
    return wanted.every((item) => (covered as readonly string[]).includes(item));
  };
  // A groove coupon covers fillet positions as well, but nobody cuts a groove
  // coupon to qualify a fillet weld, so the matching kind is preferred.
  const matching = positionsForWeldType(weldType).filter((position) => covers(position));
  return matching[0] ?? TEST_POSITIONS.find((position) => covers(position));
}

/**
 * A coupon that would make the procedure supported, or nothing when it already
 * is. One suggestion per process the procedure claims and no record covers.
 */
export function suggestCoupons(
  wps: WeldingProcedureSpecification,
  records: readonly ProcedureQualificationRecord[],
): readonly CouponSuggestion[] {
  const report = supportFindings(wps, records);
  if (report.supported) {
    return [];
  }
  const scopes = records.flatMap((record) => scopesFor(record));
  const suggestions: CouponSuggestion[] = [];

  for (const claim of wps.layers) {
    const covered = scopes.filter((scope) => scope.process === claim.process);
    const reasons: string[] = [];
    if (covered.length === 0) {
      reasons.push(`no record covers ${claim.process} at all`);
    }

    const upper = wps.baseMetalThickness.upper;
    const thickness =
      upper === undefined ? THREE_QUARTERS : thinnestCouponFor(upper, claim.process);
    if (upper !== undefined) {
      reasons.push(
        `a ${thickness.toFraction()} coupon reaches the ${upper.toFraction()} top of the claimed range`,
      );
    }

    const position = positionFor(wps.positions, wps.weldType);
    if (position !== undefined && wps.toughnessQualified) {
      reasons.push(`${position} is the cheapest coupon covering every position claimed`);
    }

    const pNumber = wps.pNumbers[wps.pNumbers.length - 1] ?? '1';
    const fNumber = claim.fNumbers[claim.fNumbers.length - 1] ?? 1;
    if (wps.pNumbers.length > 1) {
      reasons.push(`P-No ${pNumber} is the highest claimed, and reaches the others downward`);
    }

    suggestions.push({
      process: claim.process,
      couponThickness: thickness,
      position: position ?? (wps.weldType === 'fillet' ? '5F' : '6G'),
      pNumber,
      fNumber,
      toughnessRequired: wps.toughnessQualified,
      reasons,
    });
  }
  return suggestions;
}

export function describeSuggestion(suggestion: CouponSuggestion): string {
  return `${suggestion.process} coupon, ${suggestion.couponThickness.toFraction()} in the ${suggestion.position} position, P-No ${suggestion.pNumber} with F-No ${String(suggestion.fNumber)}${suggestion.toughnessRequired ? ', impact tested' : ''}`;
}
