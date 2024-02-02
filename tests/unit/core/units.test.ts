import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import {
  formatFraction,
  inches,
  Length,
  maxLength,
  millimetres,
  minLength,
  parseFractionalInches,
} from '../../../src/core/units.js';

describe('parsing a length', () => {
  it('reads a plain decimal as inches', () => {
    expect(Length.parse('0.375').toInches().toString()).toBe('0.375');
  });

  it('reads a simple fraction', () => {
    expect(Length.parse('3/8').toInches().equals(decimal('0.375'))).toBe(true);
  });

  it('reads a mixed number with a dash or a space', () => {
    expect(Length.parse('1-1/2').toInches().equals(decimal('1.5'))).toBe(true);
    expect(Length.parse('1 1/2').toInches().equals(decimal('1.5'))).toBe(true);
  });

  it('drops an inch mark', () => {
    expect(Length.parse('3/8"').toInches().equals(decimal('0.375'))).toBe(true);
  });

  it('reads a millimetre value and converts it', () => {
    const value = Length.parse('12.7 mm');
    expect(value.toInches().round(4).toString()).toBe('0.5000');
    expect(Length.parse('12.7mm').equals(value)).toBe(true);
  });

  it('reads an explicit inch suffix', () => {
    expect(Length.parse('2 in').toInches().toString()).toBe('2');
    expect(Length.parse('2 inches').toInches().toString()).toBe('2');
  });

  it('rejects an empty string', () => {
    expect(() => Length.parse('   ')).toThrow(ValidationError);
  });

  it('rejects a fraction over zero', () => {
    expect(() => Length.parse('1/0')).toThrow(/zero denominator/);
  });

  it('rejects nonsense', () => {
    expect(() => Length.parse('thick')).toThrow(ValidationError);
  });
});

describe('converting', () => {
  it('goes to millimetres and back', () => {
    expect(inches('1').toMillimetres().toString()).toBe('25.400');
    expect(millimetres('25.4').toInches().round(4).toString()).toBe('1.0000');
  });

  it('has a zero', () => {
    expect(Length.zero().isZero()).toBe(true);
  });

  it('serialises as bare inches', () => {
    expect(JSON.parse(JSON.stringify({ t: inches('0.3750') }))).toEqual({ t: '0.375' });
    expect(JSON.parse(JSON.stringify({ t: inches('2') }))).toEqual({ t: '2' });
  });

  it('prints with a unit', () => {
    expect(inches('0.500').toString()).toBe('0.5 in');
  });
});

describe('arithmetic and comparison', () => {
  it('adds and subtracts', () => {
    expect(inches('0.375').add(inches('0.125')).toInches().equals(decimal('0.5'))).toBe(true);
    expect(inches('1').subtract(inches('0.25')).toInches().equals(decimal('0.75'))).toBe(true);
  });

  it('scales, which is what a two times thickness rule needs', () => {
    expect(inches('0.375').scaleBy(2).toInches().equals(decimal('0.75'))).toBe(true);
  });

  it('compares on the boundary exactly', () => {
    const limit = inches('0.750');
    expect(inches('3/4').equals(limit)).toBe(true);
    expect(inches('3/4').lessThanOrEqual(limit)).toBe(true);
    expect(inches('3/4').greaterThanOrEqual(limit)).toBe(true);
    expect(inches('3/4').lessThan(limit)).toBe(false);
    expect(inches('0.7501').greaterThan(limit)).toBe(true);
    expect(inches('0.5').compare(limit)).toBe(-1);
  });

  it('picks the smallest and the largest', () => {
    const list = [inches('0.5'), inches('0.25'), inches('1.125')];
    expect(minLength(list[0]!, ...list.slice(1)).toFraction()).toBe('1/4');
    expect(maxLength(list[0]!, ...list.slice(1)).toFraction()).toBe('1-1/8');
  });
});

describe('formatting as a fraction', () => {
  it('reduces to the lowest sixteenths', () => {
    expect(inches('0.5').toFraction()).toBe('1/2');
    expect(inches('0.375').toFraction()).toBe('3/8');
    expect(inches('0.0625').toFraction()).toBe('1/16');
  });

  it('writes a mixed number', () => {
    expect(inches('1.5').toFraction()).toBe('1-1/2');
    expect(inches('2').toFraction()).toBe('2');
  });

  it('rounds to the nearest tick of the requested denominator', () => {
    expect(formatFraction(decimal('0.33'), 16)).toBe('5/16');
    expect(formatFraction(decimal('0.33'), 32)).toBe('11/32');
    expect(formatFraction(decimal('0.33'), 2)).toBe('1/2');
  });

  it('keeps a negative sign', () => {
    expect(formatFraction(decimal('-0.375'))).toBe('-3/8');
    expect(formatFraction(decimal('-1.5'))).toBe('-1-1/2');
  });

  it('rejects a nonsense denominator', () => {
    expect(() => formatFraction(decimal('1'), 0)).toThrow(ValidationError);
    expect(() => formatFraction(decimal('1'), 2.5)).toThrow(ValidationError);
  });
});

describe('parseFractionalInches', () => {
  it('handles all three notations', () => {
    expect(parseFractionalInches('0.25').toString()).toBe('0.25');
    expect(parseFractionalInches('1/4').equals(decimal('0.25'))).toBe(true);
    expect(parseFractionalInches('2-1/4').equals(decimal('2.25'))).toBe(true);
  });
});
