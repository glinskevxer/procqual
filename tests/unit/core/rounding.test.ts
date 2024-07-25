import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { inches, Length } from '../../../src/core/units.js';

/**
 * The rounding boundaries the range tables land on.
 *
 * Every qualified range in this system is arrived at by multiplying a coupon
 * thickness by a fraction, and the answer is then compared against a
 * production thickness for equality. These are the cases where a float would
 * disagree with the arithmetic anybody would do on paper.
 */

describe('the products the thickness tables produce', () => {
  it('doubles the common coupon thicknesses exactly', () => {
    expect(decimal('0.375').multiply(decimal('2')).equals(decimal('0.75'))).toBe(true);
    expect(decimal('0.1875').multiply(decimal('2')).equals(decimal('0.375'))).toBe(true);
    expect(decimal('0.0625').multiply(decimal('2')).equals(decimal('0.125'))).toBe(true);
  });

  it('multiplies by 1.1 without drifting', () => {
    expect(decimal('0.375').multiply(decimal('1.1')).equals(decimal('0.4125'))).toBe(true);
    expect(decimal('2').multiply(decimal('1.1')).equals(decimal('2.2'))).toBe(true);
  });

  it('multiplies by 1.33 without drifting', () => {
    expect(decimal('6').multiply(decimal('1.33')).equals(decimal('7.98'))).toBe(true);
  });

  it('adds the sixteenths up to a whole inch', () => {
    let total = decimal('0');
    for (let index = 0; index < 16; index += 1) {
      total = total.add(decimal('0.0625'));
    }
    expect(total.equals(decimal('1'))).toBe(true);
  });
});

describe('the boundaries a range comparison sits on', () => {
  it('treats a fraction and its decimal as the same thickness', () => {
    expect(inches('3/4').equals(inches('0.75'))).toBe(true);
    expect(inches('3/16').equals(inches('0.1875'))).toBe(true);
    expect(inches('1-1/2').equals(inches('1.5'))).toBe(true);
  });

  it('separates a thickness from one a ten thousandth away', () => {
    expect(inches('0.75').equals(inches('0.7501'))).toBe(false);
    expect(inches('0.75').lessThan(inches('0.7501'))).toBe(true);
  });

  it('keeps the millimetre conversions on the right side of a boundary', () => {
    expect(Length.parse('12.7 mm').lessThanOrEqual(inches('0.5'))).toBe(true);
    expect(Length.parse('12.8 mm').greaterThan(inches('0.5'))).toBe(true);
  });
});

describe('rounding a measured value', () => {
  it('rounds half away from zero when asked to', () => {
    expect(decimal('0.0625').round(3, 'half-up').toString()).toBe('0.063');
    expect(decimal('0.1875').round(3, 'half-up').toString()).toBe('0.188');
  });

  it('rounds half to even when asked to', () => {
    expect(decimal('0.0625').round(3, 'half-even').toString()).toBe('0.062');
    expect(decimal('0.1875').round(3, 'half-even').toString()).toBe('0.188');
  });

  it('does not move a value that is already at the scale asked for', () => {
    expect(decimal('0.375').round(3, 'half-up').equals(decimal('0.375'))).toBe(true);
    expect(decimal('0.375').round(6, 'half-up').equals(decimal('0.375'))).toBe(true);
  });
});
