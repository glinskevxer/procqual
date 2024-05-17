import { decimal } from '../core/decimal.js';
import {
  isAcceptable,
  sortFindings,
  type Finding,
  countBySeverity,
  type Severity,
} from '../core/errors.js';
import { evaluateBends } from './bend.js';
import { evaluateHardness, hardnessRequirement } from './hardness.js';
import { evaluateImpacts } from './impact.js';
import { governingTensile, reviewRecord, type ProcedureQualificationRecord } from './pqr.js';
import { evaluateTensile, type TensileResult } from './tensile.js';
import { buildTestPlan, reviewPlan, type TestPlan } from './testPlan.js';

/**
 * The whole verdict on one coupon.
 *
 * Every check runs, always. The temptation is to stop at the first blocking
 * finding, and it is the wrong call: a coupon costs a day of a welder's time
 * and a week of the laboratory's, so the engineer wants every reason it failed
 * in one report rather than one reason a week for three weeks.
 *
 * The tensile requirement comes from the weaker of the two base metals and the
 * impact requirement comes from the same number, so a dissimilar joint is
 * graded against its softer side throughout.
 */

export interface CouponVerdict {
  readonly record: ProcedureQualificationRecord;
  readonly plan: TestPlan;
  readonly tensileResults: readonly TensileResult[];
  readonly findings: readonly Finding[];
  readonly counts: Record<Severity, number>;
  readonly accepted: boolean;
}

export interface EvaluationOptions {
  readonly sourService?: boolean;
  readonly customerRequestedHardness?: boolean;
  readonly lateralExpansionRequired?: boolean;
}

export function evaluateCoupon(
  record: ProcedureQualificationRecord,
  options: EvaluationOptions = {},
): CouponVerdict {
  const findings: Finding[] = [...reviewRecord(record)];
  const layer = record.layers[0];
  const pNumber = layer?.baseMetal.pNumber ?? '1';

  const plan = buildTestPlan({
    weldType: record.weldType,
    couponThickness: record.couponThickness,
    pNumber,
    impactTestingRequired: record.toughnessRequired,
    sourService: options.sourService ?? false,
    customerRequestedHardness: options.customerRequestedHardness ?? false,
  });
  findings.push(
    ...reviewPlan(
      {
        weldType: record.weldType,
        couponThickness: record.couponThickness,
        pNumber,
        impactTestingRequired: record.toughnessRequired,
        sourService: options.sourService ?? false,
        customerRequestedHardness: options.customerRequestedHardness ?? false,
      },
      plan,
    ),
  );

  const governing = governingTensile(record);
  const tensile = evaluateTensile(record.tests.tensile, {
    specifiedMinimumKsi: decimal(governing),
  });
  findings.push(...tensile.findings);

  if (plan.bends !== undefined) {
    findings.push(...evaluateBends(record.tests.bends, record.couponThickness));
  }

  if (record.toughnessRequired) {
    findings.push(
      ...evaluateImpacts(record.tests.impacts, {
        specifiedMinimumTensileKsi: governing,
        lateralExpansionRequired: options.lateralExpansionRequired ?? false,
      }),
    );
  }

  const hardness = hardnessRequirement({
    pNumber,
    sourService: options.sourService ?? false,
    customerRequested: options.customerRequestedHardness ?? false,
  });
  findings.push(...evaluateHardness(record.tests.hardness, hardness));

  const sorted = sortFindings(findings);
  return {
    record,
    plan,
    tensileResults: tensile.results,
    findings: sorted,
    counts: countBySeverity(sorted),
    accepted: isAcceptable(sorted),
  };
}

/** Findings that have to be cleared before the record can be certified. */
export function blockers(verdict: CouponVerdict): readonly Finding[] {
  return verdict.findings.filter((item) => item.severity === 'blocking');
}

/** Findings that can be cleared later without rewelding the coupon. */
export function outstandingWork(verdict: CouponVerdict): readonly Finding[] {
  return verdict.findings.filter((item) => item.severity === 'deficiency');
}

export function summariseVerdict(verdict: CouponVerdict): string {
  const number = verdict.record.number.toString();
  if (verdict.accepted && verdict.counts.deficiency === 0) {
    return `${number} accepted`;
  }
  if (verdict.accepted) {
    return `${number} accepted with ${verdict.counts.deficiency} outstanding`;
  }
  return `${number} rejected on ${verdict.counts.blocking}`;
}
