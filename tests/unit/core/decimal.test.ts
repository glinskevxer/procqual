import { describe, expect, it } from 'vitest';

import {
  Decimal,
  decimal,
  maxDecimal,
  minDecimal,
  sumDecimals,
} from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('parsing', () => {
  it('reads a plain decimal and keeps its scale', () => {
    const value = Decimal.parse('0.375');
    expect(value.toString()).toBe('0.375');
    expect(value.getScale()).toBe(3);
  });

  it('reads a negative number', () => {
    expect(Decimal.parse('-12.50').toString()).toBe('-12.50');
  });

  it('reads a whole number at scale zero', () => {
    const value = Decimal.parse('  42 ');
    expect(value.getScale()).toBe(0);
    expect(value.toString()).toBe('42');
  });

  it('keeps a trailing point as scale zero', () => {
    expect(Decimal.parse('7.').toString()).toBe('7');
  });

  it('rejects text that is not a number', () => {
    expect(() => Decimal.parse('3/8')).toThrow(ValidationError);
    expect(() => Decimal.parse('')).toThrow(ValidationError);
    expect(() => Decimal.parse('1e6')).toThrow(ValidationError);
  });

  it('rejects more decimal places than it can hold', () => {
    expect(() => Decimal.parse('0.1234567890123')).toThrow(/decimal places/);
  });

  it('reads a javascript number through its own printing', () => {
    expect(Decimal.fromNumber(0.375).toString()).toBe('0.375');
    expect(Decimal.fromNumber(-2).toString()).toBe('-2');
    expect(() => Decimal.fromNumber(Number.NaN)).toThrow(ValidationError);
    expect(() => Decimal.fromNumber(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });

  it('rejects a fractional value from fromInteger', () => {
    expect(() => Decimal.fromInteger(1.5)).toThrow(ValidationError);
    expect(Decimal.fromInteger(9n).toString()).toBe('9');
  });

  it('rejects an impossible scale', () => {
    expect(() => Decimal.fromUnits(1n, -1)).toThrow(ValidationError);
    expect(() => Decimal.fromUnits(1n, 40)).toThrow(ValidationError);
  });
});

describe('arithmetic', () => {
  it('adds across different scales', () => {
    expect(decimal('0.1').add(decimal('0.2')).toString()).toBe('0.3');
    expect(decimal('1').add(decimal('0.005')).toString()).toBe('1.005');
  });

  it('subtracts', () => {
    expect(decimal('1.000').subtract(decimal('0.375')).toString()).toBe('0.625');
  });

  it('multiplies and adds the scales', () => {
    const product = decimal('0.375').multiply(decimal('2'));
    expect(product.toString()).toBe('0.750');
    expect(product.getScale()).toBe(3);
  });

  it('does not drift where a float would', () => {
    const total = sumDecimals([decimal('0.1'), decimal('0.1'), decimal('0.1')]);
    expect(total.toString()).toBe('0.3');
    expect(total.equals(decimal('0.3'))).toBe(true);
  });

  it('divides to a requested scale', () => {
    expect(decimal('1').divide(decimal('3'), 4).toString()).toBe('0.3333');
    expect(decimal('2').divide(decimal('3'), 4).toString()).toBe('0.6667');
  });

  it('refuses to divide by zero', () => {
    expect(() => decimal('1').divide(Decimal.zero(), 2)).toThrow(/division by zero/);
  });

  it('refuses an out of range division scale', () => {
    expect(() => decimal('1').divide(decimal('2'), 99)).toThrow(ValidationError);
  });

  it('negates and takes an absolute value', () => {
    expect(decimal('-3.5').abs().toString()).toBe('3.5');
    expect(decimal('3.5').abs().toString()).toBe('3.5');
    expect(decimal('3.5').negate().toString()).toBe('-3.5');
  });

  it('reports its sign', () => {
    expect(Decimal.zero().isZero()).toBe(true);
    expect(decimal('-1').isNegative()).toBe(true);
    expect(decimal('1').isPositive()).toBe(true);
  });
});

describe('comparison', () => {
  it('compares across scales', () => {
    expect(decimal('1.50').equals(decimal('1.5'))).toBe(true);
    expect(decimal('1.50').compare(decimal('1.5'))).toBe(0);
    expect(decimal('0.9').lessThan(decimal('1'))).toBe(true);
    expect(decimal('1').greaterThan(decimal('0.9'))).toBe(true);
  });

  it('treats the boundary as included where asked', () => {
    const limit = decimal('0.750');
    expect(decimal('0.75').lessThanOrEqual(limit)).toBe(true);
    expect(decimal('0.75').greaterThanOrEqual(limit)).toBe(true);
    expect(decimal('0.7501').lessThanOrEqual(limit)).toBe(false);
  });

  it('picks a minimum and a maximum', () => {
    const values = [decimal('0.5'), decimal('0.25'), decimal('1.125')];
    expect(minDecimal(values[0]!, ...values.slice(1)).toString()).toBe('0.25');
    expect(maxDecimal(values[0]!, ...values.slice(1)).toString()).toBe('1.125');
  });
});

describe('rounding', () => {
  it('rounds half up away from zero', () => {
    expect(decimal('0.125').round(2, 'half-up').toString()).toBe('0.13');
    expect(decimal('-0.125').round(2, 'half-up').toString()).toBe('-0.13');
  });

  it('rounds half to even', () => {
    expect(decimal('0.125').round(2, 'half-even').toString()).toBe('0.12');
    expect(decimal('0.135').round(2, 'half-even').toString()).toBe('0.14');
  });

  it('truncates', () => {
    expect(decimal('0.129').round(2, 'truncate').toString()).toBe('0.12');
    expect(decimal('-0.129').round(2, 'truncate').toString()).toBe('-0.12');
  });

  it('floors and ceilings with the sign in mind', () => {
    expect(decimal('0.121').round(2, 'floor').toString()).toBe('0.12');
    expect(decimal('-0.121').round(2, 'floor').toString()).toBe('-0.13');
    expect(decimal('0.121').round(2, 'ceil').toString()).toBe('0.13');
    expect(decimal('-0.121').round(2, 'ceil').toString()).toBe('-0.12');
  });

  it('pads when asked to round to a wider scale', () => {
    expect(decimal('1.5').round(3).toString()).toBe('1.500');
  });

  it('formats to a fixed scale', () => {
    expect(decimal('1.005').toFixed(2)).toBe('1.01');
  });
});

describe('conversion', () => {
  it('round trips through json', () => {
    expect(JSON.parse(JSON.stringify({ t: decimal('0.375') }))).toEqual({ t: '0.375' });
  });

  it('converts back to a number when a caller really wants one', () => {
    expect(decimal('0.375').toNumber()).toBe(0.375);
  });
});
