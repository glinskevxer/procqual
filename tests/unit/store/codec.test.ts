import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { Interval } from '../../../src/core/interval.js';
import { date } from '../../../src/core/plainDate.js';
import { parseWith } from '../../../src/core/schema.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  DecodeError,
  encodeDate,
  encodeDecimal,
  encodeDocumentNumber,
  encodeInterval,
  encodeLength,
  encodeTemperature,
  orThrow,
  readLengthInterval,
  readTemperature,
} from '../../../src/store/codec.js';

describe('encoding a value', () => {
  it('writes a length as bare inches', () => {
    expect(encodeLength(inches('3/8'))).toBe('0.375');
    expect(encodeLength(inches('2.000'))).toBe('2');
  });

  it('writes a temperature as bare Fahrenheit', () => {
    expect(encodeTemperature(fahrenheit('250'))).toBe('250');
  });

  it('writes a decimal, a date and a document number as they print', () => {
    expect(encodeDecimal(decimal('1.50'))).toBe('1.50');
    expect(encodeDate(date('2024-06-01'))).toBe('2024-06-01');
    expect(encodeDocumentNumber(DocumentNumber.parse('WPS-1 Rev 2'))).toBe('WPS-1 Rev 2');
  });
});

describe('intervals', () => {
  it('goes out with both bounds and their inclusivity', () => {
    expect(encodeInterval(Interval.closed(inches('0.0625'), inches('0.75')))).toEqual({
      lower: '0.0625',
      upper: '0.75',
      lowerInclusive: true,
      upperInclusive: true,
    });
  });

  it('writes an open end as null rather than leaving it out', () => {
    expect(encodeInterval(Interval.atLeast(inches('2.875')))).toEqual({
      lower: '2.875',
      upper: null,
      lowerInclusive: true,
      upperInclusive: true,
    });
  });

  it('round trips', () => {
    const original = new Interval(inches('0.25'), inches('1'), { upperInclusive: false });
    const read = parseWith(readLengthInterval, encodeInterval(original));
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.toString()).toBe(original.toString());
    }
  });

  it('round trips an unbounded interval', () => {
    const read = parseWith(readLengthInterval, encodeInterval(Interval.unbounded()));
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.lower).toBeUndefined();
      expect(read.value.upper).toBeUndefined();
    }
  });

  it('refuses a crossed pair rather than building a broken interval', () => {
    const read = parseWith(readLengthInterval, {
      lower: '2',
      upper: '1',
      lowerInclusive: true,
      upperInclusive: true,
    });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error[0]?.message).toMatch(/lower bound is above/);
    }
  });

  it('refuses a record missing its inclusivity flags', () => {
    expect(parseWith(readLengthInterval, { lower: '1', upper: '2' }).ok).toBe(false);
  });
});

describe('temperatures', () => {
  it('reads a bare number and a suffixed one', () => {
    const bare = parseWith(readTemperature, '250');
    expect(bare.ok).toBe(true);
    if (bare.ok) {
      expect(bare.value.toFahrenheit().toString()).toBe('250');
    }
    const celsius = parseWith(readTemperature, '121C');
    expect(celsius.ok).toBe(true);
  });

  it('passes a temperature straight through', () => {
    const read = parseWith(readTemperature, fahrenheit('250'));
    expect(read.ok).toBe(true);
  });

  it('refuses what it cannot read', () => {
    const read = parseWith(readTemperature, 'warm');
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error[0]?.message).toMatch(/expected a temperature/);
    }
  });
});

describe('orThrow', () => {
  it('unwraps a good read', () => {
    expect(orThrow('a length', parseWith(readTemperature, '250')).toString()).toBe('250 F');
  });

  it('throws with the field paths on a bad one', () => {
    expect(() => orThrow('a temperature', parseWith(readTemperature, 'warm'))).toThrow(DecodeError);
    expect(() => orThrow('a temperature', parseWith(readTemperature, 'warm'))).toThrow(
      /cannot read a temperature/,
    );
  });
});
