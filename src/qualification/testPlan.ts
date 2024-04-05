import { pNumberFacts } from '../codes/pnumber.js';
import type { WeldType } from '../codes/position.js';
import { advisory, type Finding, ValidationError } from '../core/errors.js';
import { inches, Length } from '../core/units.js';
import { requiredBends, type BendPlan } from './bend.js';
import { hardnessRequirement, type HardnessQuestion } from './hardness.js';

/**
 * What has to be cut off a coupon before anyone can say it passed.
 *
 * Nothing here is a fixed list. The coupon thickness decides which bends get
 * cut and how many tensiles come off it. The toughness question decides
 * whether there are impacts at all, and impacts have to be taken from the weld
 * and from the heat affected zone separately. The base metal family decides
 * whether a hardness traverse goes on the plan. A fillet coupon skips the
 * pulling and the bending entirely and is judged on macro sections.
 *
 * Building the plan before the coupon is welded is the whole point. A coupon
 * cut up without a plan comes back short of a specimen and the whole thing is
 * rewelded.
 */

export interface CouponPlanQuestion {
  readonly weldType: WeldType;
  readonly couponThickness: Length;
  readonly pNumber: string;
  readonly impactTestingRequired: boolean;
  readonly sourService?: boolean;
  readonly customerRequestedHardness?: boolean;
}

export interface TestPlan {
  readonly tensileCount: number;
  readonly bends: BendPlan | undefined;
  readonly macroCount: number;
  readonly impactSets: readonly ('weld' | 'heat-affected-zone')[];
  readonly hardnessSurveys: number;
  readonly notes: readonly string[];
}

const TWO_INCHES = inches('2');

export function buildTestPlan(question: CouponPlanQuestion): TestPlan {
  if (!question.couponThickness.toInches().isPositive()) {
    throw new ValidationError('couponThickness', 'coupon thickness must be greater than zero', {});
  }
  const notes: string[] = [];
  const hardness = hardnessRequirement({
    pNumber: question.pNumber,
    sourService: question.sourService ?? false,
    customerRequested: question.customerRequestedHardness ?? false,
  });

  if (question.weldType === 'fillet') {
    notes.push('fillet coupon, judged on macro sections rather than tension and bending');
    return {
      tensileCount: 0,
      bends: undefined,
      macroCount: 4,
      impactSets: [],
      hardnessSurveys: hardness.required ? 1 : 0,
      notes,
    };
  }

  const tensileCount = question.couponThickness.greaterThan(TWO_INCHES) ? 4 : 2;
  if (tensileCount === 4) {
    notes.push('coupon over two inches, so the tensile specimens are doubled up');
  }
  const bends = requiredBends(question.couponThickness);
  notes.push(bends.note);

  const impactSets: ('weld' | 'heat-affected-zone')[] = question.impactTestingRequired
    ? ['weld', 'heat-affected-zone']
    : [];
  if (question.impactTestingRequired) {
    notes.push('notch toughness required, so impact sets come from the weld and the heat affected zone');
  }
  if (hardness.required) {
    notes.push(`hardness survey: ${hardness.reason}`);
  }

  return {
    tensileCount,
    bends,
    macroCount: 0,
    impactSets,
    hardnessSurveys: hardness.required ? 1 : 0,
    notes,
  };
}

export function totalSpecimens(plan: TestPlan): number {
  return (
    plan.tensileCount +
    (plan.bends?.total ?? 0) +
    plan.macroCount +
    plan.impactSets.length * 3 +
    plan.hardnessSurveys
  );
}

/**
 * Warnings about a plan that is legal but expensive or awkward, so the welding
 * engineer can move the coupon before it is cut rather than after.
 */
export function reviewPlan(question: CouponPlanQuestion, plan: TestPlan): readonly Finding[] {
  const findings: Finding[] = [];
  if (plan.impactSets.length > 0 && pNumberFacts(question.pNumber).family.includes('austenitic')) {
    findings.push(
      advisory(
        'plan.austenitic_impacts',
        'austenitic stainless rarely needs impact testing, so check the design temperature before cutting the extra specimens',
        { clause: 'UHA-51' },
      ),
    );
  }
  if (question.couponThickness.greaterThan(TWO_INCHES) && plan.bends !== undefined) {
    findings.push(
      advisory(
        'plan.thick_coupon',
        'a coupon over two inches needs a bigger bend jig than the shop keeps set up',
        {},
      ),
    );
  }
  if (plan.hardnessSurveys > 0 && plan.macroCount === 0 && question.weldType === 'groove') {
    findings.push(
      advisory(
        'plan.hardness_needs_section',
        'the hardness traverse wants a polished section, so plan a macro even though the groove coupon does not require one',
        {},
      ),
    );
  }
  return findings;
}
