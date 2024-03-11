import { describe, expect, it } from 'vitest';

import {
  coversThickness,
  coversWork,
  explainThicknessCeiling,
  qualifiedDepositThickness,
  qualifiedDiameter,
  type PerformanceCoupon,
} from '../../../src/codes/performanceRange.js';
import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';

const plateCoupon = (overrides: Partial<PerformanceCoupon> = {}): PerformanceCoupon => ({
  depositThickness: inches('3/8'),
  layers: 4,
  productForm: 'plate',
  ...overrides,
});

const pipeCoupon = (overrides: Partial<PerformanceCoupon> = {}): PerformanceCoupon => ({
  depositThickness: inches('3/8'),
  layers: 4,
  productForm: 'pipe',
  outsideDiameter: inches('6'),
  ...overrides,
});

describe('deposit thickness', () => {
  it('doubles a thin deposit', () => {
    const range = qualifiedDepositThickness(plateCoupon());
    expect(range.upper?.toFraction()).toBe('3/4');
  });

  it('takes the ceiling off entirely at half an inch', () => {
    const range = qualifiedDepositThickness(plateCoupon({ depositThickness: inches('1/2') }));
    expect(range.upper).toBeUndefined();
    expect(coversThickness(plateCoupon({ depositThickness: inches('1/2') }), inches('12'))).toBe(
      true,
    );
  });

  it('holds the doubling right up to the boundary', () => {
    const justUnder = qualifiedDepositThickness(
      plateCoupon({ depositThickness: inches('0.4999') }),
    );
    expect(justUnder.upper?.toInches().toString()).toBe('0.9998');
  });

  it('drops to a tenth over when the coupon has fewer than three layers', () => {
    const range = qualifiedDepositThickness(plateCoupon({ layers: 2 }));
    expect(range.upper?.toInches().toString()).toBe('0.4125');
  });

  it('applies the layer rule even to a thick deposit', () => {
    const range = qualifiedDepositThickness(
      plateCoupon({ depositThickness: inches('1'), layers: 1 }),
    );
    expect(range.upper?.toInches().toString()).toBe('1.1');
  });

  it('refuses a coupon that deposited nothing', () => {
    expect(() => qualifiedDepositThickness(plateCoupon({ depositThickness: inches('0') }))).toThrow(
      ValidationError,
    );
  });

  it('refuses a layer count that is not a whole number of layers', () => {
    expect(() => qualifiedDepositThickness(plateCoupon({ layers: 0 }))).toThrow(/at least one/);
    expect(() => qualifiedDepositThickness(plateCoupon({ layers: 2.5 }))).toThrow(ValidationError);
  });
});

describe('diameter', () => {
  it('holds a small coupon to its own size and up', () => {
    const range = qualifiedDiameter(pipeCoupon({ outsideDiameter: inches('0.84') }));
    expect(range.lower?.toInches().toString()).toBe('0.84');
    expect(range.upper).toBeUndefined();
  });

  it('drops the floor to one inch through the middle band', () => {
    expect(qualifiedDiameter(pipeCoupon({ outsideDiameter: inches('1') })).lower?.toFraction()).toBe(
      '1',
    );
    expect(
      qualifiedDiameter(pipeCoupon({ outsideDiameter: inches('2.875') })).lower?.toFraction(),
    ).toBe('1');
  });

  it('holds the floor at two and seven eighths above that band', () => {
    expect(
      qualifiedDiameter(pipeCoupon({ outsideDiameter: inches('6') })).lower?.toInches().toString(),
    ).toBe('2.875');
  });

  it('puts a plate coupon at twenty four inches and up', () => {
    expect(qualifiedDiameter(plateCoupon()).lower?.toFraction()).toBe('24');
  });

  it('refuses a pipe coupon with no diameter', () => {
    const coupon: PerformanceCoupon = { ...pipeCoupon(), outsideDiameter: undefined };
    expect(() => qualifiedDiameter(coupon)).toThrow(/needs an outside diameter/);
    expect(() => qualifiedDiameter(pipeCoupon({ outsideDiameter: inches('0') }))).toThrow(
      ValidationError,
    );
  });
});

describe('reaching the work', () => {
  it('lets a pipe coupon cover plate work', () => {
    expect(coversWork(pipeCoupon(), { productForm: 'plate' })).toBe(true);
  });

  it('lets a plate coupon cover only large pipe', () => {
    expect(coversWork(plateCoupon(), { productForm: 'pipe', outsideDiameter: inches('30') })).toBe(
      true,
    );
    expect(coversWork(plateCoupon(), { productForm: 'pipe', outsideDiameter: inches('6') })).toBe(
      false,
    );
  });

  it('lets a plate coupon cover plate work', () => {
    expect(coversWork(plateCoupon(), { productForm: 'plate' })).toBe(true);
  });

  it('checks a pipe coupon against the diameter band', () => {
    const coupon = pipeCoupon({ outsideDiameter: inches('6') });
    expect(coversWork(coupon, { productForm: 'pipe', outsideDiameter: inches('3') })).toBe(true);
    expect(coversWork(coupon, { productForm: 'pipe', outsideDiameter: inches('2') })).toBe(false);
  });

  it('cannot answer for pipe work with no diameter given', () => {
    expect(coversWork(pipeCoupon(), { productForm: 'pipe' })).toBe(false);
  });
});

describe('explaining the ceiling', () => {
  it('names the rule that set it', () => {
    expect(explainThicknessCeiling(plateCoupon())).toMatch(/twice the deposit/);
    expect(explainThicknessCeiling(plateCoupon({ layers: 2 }))).toMatch(/fewer than three layers/);
    expect(explainThicknessCeiling(plateCoupon({ depositThickness: inches('1/2') }))).toMatch(
      /no ceiling/,
    );
  });
});
