import { describe, expect, it } from 'vitest';

import {
  coversBaseMetalThickness,
  coversDepositThickness,
  explainBaseMetalCeiling,
  isShortCircuiting,
  qualifiedBaseMetalRange,
  qualifiedDepositRange,
  type CouponConditions,
} from '../../../src/codes/thicknessRange.js';
import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';

const coupon = (overrides: Partial<CouponConditions> = {}): CouponConditions => ({
  couponThickness: inches('3/8'),
  depositThickness: inches('3/8'),
  process: 'SMAW',
  heatTreatedAboveTransformation: false,
  ...overrides,
});

describe('base metal range', () => {
  it('doubles a coupon in the middle of the range', () => {
    const range = qualifiedBaseMetalRange(coupon());
    expect(range.lower?.toFraction()).toBe('1/16');
    expect(range.upper?.toFraction()).toBe('3/4');
  });

  it('lifts the floor once the coupon passes three eighths', () => {
    const range = qualifiedBaseMetalRange(coupon({ couponThickness: inches('1/2') }));
    expect(range.lower?.toFraction()).toBe('3/16');
    expect(range.upper?.toFraction()).toBe('1');
  });

  it('holds the floor at the coupon itself for very thin material', () => {
    const range = qualifiedBaseMetalRange(coupon({ couponThickness: inches('0.05') }));
    expect(range.lower?.toInches().toString()).toBe('0.05');
    expect(range.upper?.toInches().toString()).toBe('0.1');
  });

  it('goes to a flat eight inches from three quarters up', () => {
    const range = qualifiedBaseMetalRange(coupon({ couponThickness: inches('3/4') }));
    expect(range.upper?.toFraction()).toBe('8');
    expect(
      qualifiedBaseMetalRange(coupon({ couponThickness: inches('2') })).upper?.toFraction(),
    ).toBe('8');
  });

  it('drops back to a third again over the coupon at six inches', () => {
    const range = qualifiedBaseMetalRange(coupon({ couponThickness: inches('6') }));
    expect(range.upper?.toInches().toString()).toBe('7.98');
  });

  it('holds the boundary at three quarters inclusive on the eight inch side', () => {
    const justUnder = qualifiedBaseMetalRange(coupon({ couponThickness: inches('0.7499') }));
    const exactly = qualifiedBaseMetalRange(coupon({ couponThickness: inches('0.75') }));
    expect(justUnder.upper?.toInches().toString()).toBe('1.4998');
    expect(exactly.upper?.toFraction()).toBe('8');
  });

  it('refuses a coupon with no thickness', () => {
    expect(() => qualifiedBaseMetalRange(coupon({ couponThickness: inches('0') }))).toThrow(
      ValidationError,
    );
  });
});

describe('heat treatment above the transformation temperature', () => {
  it('pulls the ceiling back to a tenth over the coupon', () => {
    const range = qualifiedBaseMetalRange(
      coupon({ couponThickness: inches('1'), heatTreatedAboveTransformation: true }),
    );
    expect(range.upper?.toInches().toString()).toBe('1.1');
  });

  it('beats the flat eight inch ceiling rather than losing to it', () => {
    const plain = qualifiedBaseMetalRange(coupon({ couponThickness: inches('2') }));
    const annealed = qualifiedBaseMetalRange(
      coupon({ couponThickness: inches('2'), heatTreatedAboveTransformation: true }),
    );
    expect(plain.upper?.toFraction()).toBe('8');
    expect(annealed.upper?.toInches().toString()).toBe('2.2');
  });

  it('leaves the floor alone', () => {
    const range = qualifiedBaseMetalRange(
      coupon({ couponThickness: inches('1/4'), heatTreatedAboveTransformation: true }),
    );
    expect(range.lower?.toFraction()).toBe('1/16');
  });
});

describe('deposit range', () => {
  it('doubles a thin deposit', () => {
    const range = qualifiedDepositRange(coupon({ depositThickness: inches('1/4') }));
    expect(range.upper?.toFraction()).toBe('1/2');
    expect(range.lower?.toFraction()).toBe('0');
  });

  it('goes to eight inches once both the deposit and the coupon are thick enough', () => {
    const range = qualifiedDepositRange(
      coupon({ couponThickness: inches('1'), depositThickness: inches('1') }),
    );
    expect(range.upper?.toFraction()).toBe('8');
  });

  it('only doubles when the coupon itself is thin', () => {
    const range = qualifiedDepositRange(
      coupon({ couponThickness: inches('0.5'), depositThickness: inches('0.8') }),
    );
    expect(range.upper?.toInches().toString()).toBe('1.6');
  });

  it('pulls back to a tenth over for short circuiting transfer', () => {
    const conditions = coupon({
      process: 'GMAW',
      transferMode: 'short-circuiting',
      depositThickness: inches('1/4'),
    });
    expect(isShortCircuiting(conditions)).toBe(true);
    expect(qualifiedDepositRange(conditions).upper?.toInches().toString()).toBe('0.275');
  });

  it('leaves the other transfer modes on the ordinary rule', () => {
    const conditions = coupon({
      process: 'GMAW',
      transferMode: 'spray',
      depositThickness: inches('1/4'),
    });
    expect(isShortCircuiting(conditions)).toBe(false);
    expect(qualifiedDepositRange(conditions).upper?.toFraction()).toBe('1/2');
  });

  it('does not read short circuiting off a process that cannot run it', () => {
    const conditions = coupon({ process: 'SMAW', transferMode: 'short-circuiting' });
    expect(isShortCircuiting(conditions)).toBe(false);
  });

  it('refuses a deposit with no thickness', () => {
    expect(() => qualifiedDepositRange(coupon({ depositThickness: inches('0') }))).toThrow(
      ValidationError,
    );
  });
});

describe('covering a production thickness', () => {
  const conditions = coupon({ couponThickness: inches('3/8'), depositThickness: inches('3/8') });

  it('takes a part inside the range and refuses one outside', () => {
    expect(coversBaseMetalThickness(conditions, inches('1/2'))).toBe(true);
    expect(coversBaseMetalThickness(conditions, inches('3/4'))).toBe(true);
    expect(coversBaseMetalThickness(conditions, inches('0.7501'))).toBe(false);
    expect(coversBaseMetalThickness(conditions, inches('0.05'))).toBe(false);
  });

  it('checks the deposit separately', () => {
    expect(coversDepositThickness(conditions, inches('3/4'))).toBe(true);
    expect(coversDepositThickness(conditions, inches('1'))).toBe(false);
  });
});

describe('explaining the ceiling', () => {
  it('names the rule that set it', () => {
    expect(explainBaseMetalCeiling(coupon())).toMatch(/twice the coupon/);
    expect(explainBaseMetalCeiling(coupon({ couponThickness: inches('1') }))).toMatch(
      /flat eight inches/,
    );
    expect(explainBaseMetalCeiling(coupon({ couponThickness: inches('7') }))).toMatch(/1.33/);
    expect(explainBaseMetalCeiling(coupon({ heatTreatedAboveTransformation: true }))).toMatch(
      /upper transformation temperature/,
    );
  });
});
