import { pNumberFacts } from '../codes/pnumber.js';
import type { ProcessCode, TransferMode } from '../codes/process.js';
import { advisory, blocking, deficiency, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { inches, type Length } from '../core/units.js';
import { judgeExamination } from '../nde/acceptance.js';
import type { Examination } from '../nde/examination.js';

/**
 * Qualifying a welder on the work rather than on a coupon.
 *
 * The code allows the first stretch of a welder's production weld to be
 * radiographed and to stand in for a test coupon. It is a good rule and it is
 * used badly. The temptation is to reach for it because the coupon is
 * inconvenient, and it is not available for the two cases where a coupon is
 * most necessary.
 *
 * It is not available for gas metal arc in short circuiting transfer, because
 * radiography does not reliably find the lack of fusion that mode produces,
 * which is the whole reason the mode is watched. And it is not available on
 * aluminium, where a radiograph of a sound weld and a radiograph of a bad one
 * look far too alike.
 *
 * Six inches is the minimum. Not six inches of film, six inches of weld the
 * film actually covers, which is why the coverage on the examination record is
 * read rather than the length of the joint.
 */

export const MINIMUM_COVERAGE = inches('6');

export interface ProductionQualificationRequest {
  readonly stencil: string;
  readonly process: ProcessCode;
  readonly transferMode?: TransferMode | undefined;
  readonly pNumber: string;
  readonly joint: string;
  readonly weldedOn: PlainDate;
  readonly examination: Examination;
  readonly jointThickness: Length;
}

export type Eligibility = 'available' | 'not-for-short-circuiting' | 'not-for-aluminium';

export function eligibility(request: ProductionQualificationRequest): Eligibility {
  if (request.process === 'GMAW' && request.transferMode === 'short-circuiting') {
    return 'not-for-short-circuiting';
  }
  if (pNumberFacts(request.pNumber).family.startsWith('aluminium')) {
    return 'not-for-aluminium';
  }
  return 'available';
}

export function isAvailable(request: ProductionQualificationRequest): boolean {
  return eligibility(request) === 'available';
}

export interface ProductionVerdict {
  readonly qualified: boolean;
  readonly eligibility: Eligibility;
  readonly findings: readonly Finding[];
}

export function assessProductionQualification(
  request: ProductionQualificationRequest,
): ProductionVerdict {
  const findings: Finding[] = [];
  const subject = `${request.stencil} on ${request.joint}`;
  const state = eligibility(request);

  if (state === 'not-for-short-circuiting') {
    findings.push(
      blocking(
        'production.short_circuiting',
        'short circuiting transfer cannot be qualified by radiography, because radiography does not find the fusion faults that mode makes',
        { clause: 'QW-304', subject },
      ),
    );
  }
  if (state === 'not-for-aluminium') {
    findings.push(
      blocking('production.aluminium', 'aluminium cannot be qualified by radiography', {
        clause: 'QW-304',
        subject,
      }),
    );
  }

  const examination = request.examination;
  if (examination.joint !== request.joint) {
    findings.push(
      blocking(
        'production.wrong_joint',
        `the radiograph is against ${examination.joint} and the work was on ${request.joint}`,
        { subject },
      ),
    );
  }
  if (examination.method !== 'RT') {
    findings.push(
      blocking(
        'production.not_radiography',
        `a ${examination.method} report cannot qualify a welder, only radiography can`,
        { clause: 'QW-304', subject },
      ),
    );
  }
  if (examination.coverage.lessThan(MINIMUM_COVERAGE)) {
    findings.push(
      blocking(
        'production.too_short',
        `${examination.coverage.toFraction()} of weld covered against ${MINIMUM_COVERAGE.toFraction()} required`,
        { clause: 'QW-304', subject },
      ),
    );
  }
  if (examination.performedOn.isBefore(request.weldedOn)) {
    findings.push(
      blocking(
        'production.examined_before_welded',
        'the radiograph is dated before the weld was run',
        { subject },
      ),
    );
  }

  const result = judgeExamination(examination, request.jointThickness);
  findings.push(...result.findings);
  if (result.accepted && findings.length === 0) {
    findings.push(
      advisory(
        'production.qualified',
        `${request.stencil} is qualified for ${request.process} on the strength of ${examination.id}`,
        { clause: 'QW-304', subject },
      ),
    );
  }
  if (!result.accepted) {
    findings.push(
      deficiency(
        'production.rejected',
        'the radiograph was rejected, so the weld is repaired and the welder is not qualified by it',
        { subject },
      ),
    );
  }

  return {
    qualified: findings.every((item) => item.severity === 'advisory'),
    eligibility: state,
    findings,
  };
}

export function describeEligibility(state: Eligibility): string {
  switch (state) {
    case 'available':
      return 'production radiography may stand in for a coupon here';
    case 'not-for-short-circuiting':
      return 'not available in short circuiting transfer';
    case 'not-for-aluminium':
      return 'not available on aluminium';
  }
}
