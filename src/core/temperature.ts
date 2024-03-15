import { Decimal, decimal } from './decimal.js';
import { ValidationError } from './errors.js';

/**
 * Temperature, held in Fahrenheit because every chart, every recorder and
 * every code table in this shop is.
 *
 * Two things make this worth a type rather than a number. Preheat is a
 * minimum and interpass is a maximum, so a bare number gets compared the wrong
 * way round eventually. And conversion is affine rather than proportional, so
 * a temperature difference is not a temperature and the two must not be added
 * to each other by accident.
 */

const NINE_FIFTHS = decimal('1.8');
const FREEZING_OFFSET = decimal('32');
const ABSOLUTE_ZERO_F = decimal('-459.67');

export class Temperature {
  private readonly fahrenheit: Decimal;

  private constructor(fahrenheit: Decimal) {
    this.fahrenheit = fahrenheit.normalized();
  }

  static ofFahrenheit(value: Decimal | string | number): Temperature {
    const held = toDecimal(value);
    if (held.lessThan(ABSOLUTE_ZERO_F)) {
      throw new ValidationError('temperature', 'below absolute zero', {
        value: held.toString(),
      });
    }
    return new Temperature(held);
  }

  static ofCelsius(value: Decimal | string | number): Temperature {
    return Temperature.ofFahrenheit(toDecimal(value).multiply(NINE_FIFTHS).add(FREEZING_OFFSET));
  }

  /** Reads `300F`, `300 F`, `150C`, `150 degC` and a bare number as Fahrenheit. */
  static parse(text: string): Temperature {
    const trimmed = text.trim().replace(/\s*(?:deg|°)\s*/i, '');
    const match = /^([+-]?[\d.]+)\s*([FC])?$/i.exec(trimmed);
    if (match === null) {
      throw new ValidationError('temperature', `not a temperature: ${JSON.stringify(text)}`, {
        text,
      });
    }
    const value = decimal(match[1] ?? '0');
    return (match[2] ?? 'F').toUpperCase() === 'C'
      ? Temperature.ofCelsius(value)
      : Temperature.ofFahrenheit(value);
  }

  toFahrenheit(): Decimal {
    return this.fahrenheit;
  }

  toCelsius(): Decimal {
    return this.fahrenheit.subtract(FREEZING_OFFSET).divide(NINE_FIFTHS, 2).normalized();
  }

  /** Raise or lower by a difference in Fahrenheit degrees. */
  plusFahrenheitDegrees(degrees: Decimal | string | number): Temperature {
    return Temperature.ofFahrenheit(this.fahrenheit.add(toDecimal(degrees)));
  }

  compare(other: Temperature): -1 | 0 | 1 {
    return this.fahrenheit.compare(other.fahrenheit);
  }

  equals(other: Temperature): boolean {
    return this.compare(other) === 0;
  }

  isBelow(other: Temperature): boolean {
    return this.compare(other) < 0;
  }

  isAbove(other: Temperature): boolean {
    return this.compare(other) > 0;
  }

  isAtLeast(other: Temperature): boolean {
    return this.compare(other) >= 0;
  }

  isAtMost(other: Temperature): boolean {
    return this.compare(other) <= 0;
  }

  toString(): string {
    return `${this.fahrenheit.toString()} F`;
  }

  toJSON(): string {
    return this.fahrenheit.toString();
  }
}

export function fahrenheit(value: Decimal | string | number): Temperature {
  return Temperature.ofFahrenheit(value);
}

export function celsius(value: Decimal | string | number): Temperature {
  return Temperature.ofCelsius(value);
}

export function coldest(first: Temperature, ...rest: readonly Temperature[]): Temperature {
  return rest.reduce((best, item) => (item.isBelow(best) ? item : best), first);
}

export function hottest(first: Temperature, ...rest: readonly Temperature[]): Temperature {
  return rest.reduce((best, item) => (item.isAbove(best) ? item : best), first);
}

function toDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : decimal(value);
}
