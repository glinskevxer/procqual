import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  buildTestPlan,
  reviewPlan,
  totalSpecimens,
  type CouponPlanQuestion,
} from '../../../src/qualification/testPlan.js';

const question = (overrides: Partial<CouponPlanQuestion> = {}): CouponPlanQuestion => ({
  weldType: 'groove',
  couponThickness: inches('3/8'),
  pNumber: '1',
  impactTestingRequired: false,
  ...overrides,
});

describe('the ordinary groove coupon', () => {
  it('asks for two tensiles and four bends', () => {
    const plan = buildTestPlan(question());
    expect(plan.tensileCount).toBe(2);
    expect(plan.bends?.total).toBe(4);
    expect(plan.macroCount).toBe(0);
    expect(plan.impactSets).toEqual([]);
    expect(plan.hardnessSurveys).toBe(0);
    expect(totalSpecimens(plan)).toBe(6);
  });

  it('doubles the tensiles past two inches', () => {
    const plan = buildTestPlan(question({ couponThickness: inches('2.5') }));
    expect(plan.tensileCount).toBe(4);
    expect(plan.notes.join(' ')).toMatch(/doubled up/);
  });

  it('carries the bend note through so the shop knows which specimens to cut', () => {
    expect(buildTestPlan(question()).notes.join(' ')).toMatch(/either two face and two root/);
    expect(buildTestPlan(question({ couponThickness: inches('1') })).notes.join(' ')).toMatch(
      /four side bends/,
    );
  });

  it('refuses a coupon with no thickness', () => {
    expect(() => buildTestPlan(question({ couponThickness: inches('0') }))).toThrow(
      ValidationError,
    );
  });
});

describe('the fillet coupon', () => {
  it('skips the pulling and the bending', () => {
    const plan = buildTestPlan(question({ weldType: 'fillet' }));
    expect(plan.tensileCount).toBe(0);
    expect(plan.bends).toBeUndefined();
    expect(plan.macroCount).toBe(4);
    expect(totalSpecimens(plan)).toBe(4);
  });

  it('still takes a hardness traverse where the family wants one', () => {
    const plan = buildTestPlan(question({ weldType: 'fillet', pNumber: '5A' }));
    expect(plan.hardnessSurveys).toBe(1);
    expect(plan.macroCount).toBe(4);
  });

  it('never carries impacts, since there is nothing to notch', () => {
    const plan = buildTestPlan(question({ weldType: 'fillet', impactTestingRequired: true }));
    expect(plan.impactSets).toEqual([]);
  });
});

describe('what the toughness question adds', () => {
  it('adds nothing when toughness is not required', () => {
    expect(buildTestPlan(question()).impactSets).toEqual([]);
  });

  it('adds a set from the weld and a set from the heat affected zone', () => {
    const plan = buildTestPlan(question({ impactTestingRequired: true }));
    expect(plan.impactSets).toEqual(['weld', 'heat-affected-zone']);
    expect(totalSpecimens(plan)).toBe(12);
  });
});

describe('what the family adds', () => {
  it('adds a hardness traverse to the chromium molybdenums', () => {
    expect(buildTestPlan(question({ pNumber: '5A' })).hardnessSurveys).toBe(1);
    expect(buildTestPlan(question({ pNumber: '1' })).hardnessSurveys).toBe(0);
  });

  it('adds one for sour service on any family', () => {
    const plan = buildTestPlan(question({ sourService: true }));
    expect(plan.hardnessSurveys).toBe(1);
    expect(plan.notes.join(' ')).toMatch(/wet sour service/);
  });

  it('adds one when the purchase specification asks', () => {
    expect(buildTestPlan(question({ customerRequestedHardness: true })).hardnessSurveys).toBe(1);
  });
});

describe('reviewing a plan before the coupon is cut', () => {
  it('is quiet about an ordinary plan', () => {
    const asked = question();
    expect(reviewPlan(asked, buildTestPlan(asked))).toEqual([]);
  });

  it('questions impacts on austenitic stainless', () => {
    const asked = question({ pNumber: '8', impactTestingRequired: true });
    const codes = reviewPlan(asked, buildTestPlan(asked)).map((item) => item.code);
    expect(codes).toContain('plan.austenitic_impacts');
  });

  it('warns that a thick coupon will not fit the standing jig', () => {
    const asked = question({ couponThickness: inches('3') });
    const codes = reviewPlan(asked, buildTestPlan(asked)).map((item) => item.code);
    expect(codes).toContain('plan.thick_coupon');
  });

  it('asks for a macro section to put the hardness traverse on', () => {
    const asked = question({ pNumber: '5A' });
    const codes = reviewPlan(asked, buildTestPlan(asked)).map((item) => item.code);
    expect(codes).toContain('plan.hardness_needs_section');
  });

  it('does not ask for one on a fillet coupon, which already has macros', () => {
    const asked = question({ weldType: 'fillet', pNumber: '5A' });
    const codes = reviewPlan(asked, buildTestPlan(asked)).map((item) => item.code);
    expect(codes).not.toContain('plan.hardness_needs_section');
  });
});
