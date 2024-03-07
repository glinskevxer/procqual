import { Decimal, decimal } from './decimal.js';
import { ValidationError } from './errors.js';

/**
 * Measurements, in the units the shop floor actually writes down.
 *
 * Coupon thicknesses arrive as fractional inches on a paper form, material
 * certificates arrive in millimetres, and the code tables are in inches. All
 * three have to compare exactly against each other, so everything is held as
 * an exact decimal number of inches and only formatted back on the way out.
 */

const MM_PER_INCH = decimal('25.4');
const LENGTH_SCALE = 6;

export class Length {
  private readonly inches: Decimal;

  private constructor(inches: Decimal) {
    this.inches = inches.normalized();
  }

  static ofInches(value: Decimal | string | number): Length {
    return new Length(toDecimal(value));
  }

  static ofMillimetres(value: Decimal | string | number): Length {
    return new Length(toDecimal(value).divide(MM_PER_INCH, LENGTH_SCALE));
  }

  static zero(): Length {
    return new Length(Decimal.zero());
  }

  /**
   * Read the notations a welding engineer writes by hand.
   *
   * Accepts `0.375`, `3/8`, `3/8"`, `1-1/2`, `1 1/2`, `12.7 mm` and `12.7mm`.
   * A bare number is inches, because the code tables are.
   */
  static parse(text: string): Length {
    const trimmed = text.trim().replace(/"$/, '').trim();
    if (trimmed === '') {
      throw new ValidationError('length', 'empty length');
    }
    const metric = /^([\d.]+)\s*mm$/i.exec(trimmed);
    if (metric !== null) {
      return Length.ofMillimetres(decimal(metric[1] ?? '0'));
    }
    const imperial = /^([\d.]+)\s*(?:in|inch|inches)$/i.exec(trimmed);
    if (imperial !== null) {
      return Length.ofInches(decimal(imperial[1] ?? '0'));
    }
    return Length.ofInches(parseFractionalInches(trimmed));
  }

  toInches(): Decimal {
    return this.inches;
  }

  toMillimetres(): Decimal {
    return this.inches.multiply(MM_PER_INCH).round(3, 'half-up');
  }

  add(other: Length): Length {
    return new Length(this.inches.add(other.inches));
  }

  subtract(other: Length): Length {
    return new Length(this.inches.subtract(other.inches));
  }

  scaleBy(factor: Decimal | string | number): Length {
    return new Length(this.inches.multiply(toDecimal(factor)));
  }

  compare(other: Length): -1 | 0 | 1 {
    return this.inches.compare(other.inches);
  }

  equals(other: Length): boolean {
    return this.inches.equals(other.inches);
  }

  lessThan(other: Length): boolean {
    return this.inches.lessThan(other.inches);
  }

  lessThanOrEqual(other: Length): boolean {
    return this.inches.lessThanOrEqual(other.inches);
  }

  greaterThan(other: Length): boolean {
    return this.inches.greaterThan(other.inches);
  }

  greaterThanOrEqual(other: Length): boolean {
    return this.inches.greaterThanOrEqual(other.inches);
  }

  isZero(): boolean {
    return this.inches.isZero();
  }

  /** Plain decimal inches, which is how the tables in `codes` are written. */
  toString(): string {
    return `${trimZeros(this.inches)} in`;
  }

  /** The form a fitter reads off a tape, rounded to the nearest sixteenth. */
  toFraction(denominator = 16): string {
    return formatFraction(this.inches, denominator);
  }

  toJSON(): string {
    return trimZeros(this.inches);
  }
}

export function inches(value: Decimal | string | number): Length {
  return Length.ofInches(value);
}

export function millimetres(value: Decimal | string | number): Length {
  return Length.ofMillimetres(value);
}

export function minLength(first: Length, ...rest: readonly Length[]): Length {
  return rest.reduce((best, item) => (item.lessThan(best) ? item : best), first);
}

export function maxLength(first: Length, ...rest: readonly Length[]): Length {
  return rest.reduce((best, item) => (item.greaterThan(best) ? item : best), first);
}

export function parseFractionalInches(text: string): Decimal {
  const mixed = /^(\d+)[\s-](\d+)\/(\d+)$/.exec(text);
  if (mixed !== null) {
    const whole = decimal(mixed[1] ?? '0');
    return whole.add(fraction(mixed[2] ?? '0', mixed[3] ?? '1'));
  }
  const simple = /^(\d+)\/(\d+)$/.exec(text);
  if (simple !== null) {
    return fraction(simple[1] ?? '0', simple[2] ?? '1');
  }
  return decimal(text);
}

export function formatFraction(value: Decimal, denominator = 16): string {
  if (denominator <= 0 || !Number.isInteger(denominator)) {
    throw new ValidationError('denominator', 'denominator must be a positive integer', {
      denominator,
    });
  }
  const negative = value.isNegative();
  const absolute = value.abs();
  const ticks = absolute
    .multiply(Decimal.fromInteger(denominator))
    .round(0, 'half-up')
    .toNumber();
  const whole = Math.floor(ticks / denominator);
  let numerator = ticks - whole * denominator;
  let bottom = denominator;
  while (numerator !== 0 && numerator % 2 === 0 && bottom % 2 === 0) {
    numerator /= 2;
    bottom /= 2;
  }
  const sign = negative ? '-' : '';
  if (numerator === 0) {
    return `${sign}${whole}`;
  }
  if (whole === 0) {
    return `${sign}${numerator}/${bottom}`;
  }
  return `${sign}${whole}-${numerator}/${bottom}`;
}

function fraction(numerator: string, denominator: string): Decimal {
  const bottom = decimal(denominator);
  if (bottom.isZero()) {
    throw new ValidationError('length', 'fraction with a zero denominator', { denominator });
  }
  return decimal(numerator).divide(bottom, LENGTH_SCALE);
}

function toDecimal(value: Decimal | string | number): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  return typeof value === 'string' ? parseFractionalInches(value.trim()) : decimal(value);
}

function trimZeros(value: Decimal): string {
  return value.normalized().toString();
}
