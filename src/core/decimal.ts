import { ValidationError } from './errors.js';

/**
 * Fixed point decimal arithmetic on a scaled bigint.
 *
 * Thickness ranges are the reason this exists. A qualified range runs from a
 * coupon thickness to twice that thickness, the boundary is inclusive, and a
 * production part sits on the boundary often enough that a float comparison
 * decides real work. 0.375 * 2 is exact in binary, 0.1 * 3 is not, and there
 * is no reading of the code that says "close enough".
 */

export type RoundingMode = 'half-up' | 'half-even' | 'floor' | 'ceil' | 'truncate';

const MAX_SCALE = 12;

export class Decimal {
  private readonly units: bigint;
  private readonly scale: number;

  private constructor(units: bigint, scale: number) {
    this.units = units;
    this.scale = scale;
  }

  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  static fromUnits(units: bigint, scale: number): Decimal {
    if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
      throw new ValidationError('scale', `scale must be an integer in 0..${MAX_SCALE}`, {
        scale,
      });
    }
    return new Decimal(units, scale);
  }

  static fromInteger(value: number | bigint): Decimal {
    if (typeof value === 'number' && !Number.isInteger(value)) {
      throw new ValidationError('value', 'fromInteger needs a whole number', { value });
    }
    return new Decimal(BigInt(value), 0);
  }

  static parse(text: string): Decimal {
    const trimmed = text.trim();
    const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(trimmed);
    if (match === null) {
      throw new ValidationError('value', `not a decimal number: ${JSON.stringify(text)}`, {
        text,
      });
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const whole = match[2] ?? '0';
    const fraction = match[3] ?? '';
    if (fraction.length > MAX_SCALE) {
      throw new ValidationError('value', `more than ${MAX_SCALE} decimal places`, { text });
    }
    const units = sign * BigInt(`${whole}${fraction}`);
    return new Decimal(units, fraction.length);
  }

  /** Read a JavaScript number, which is only safe through its own printing. */
  static fromNumber(value: number): Decimal {
    if (!Number.isFinite(value)) {
      throw new ValidationError('value', 'not a finite number', { value });
    }
    return Decimal.parse(value.toFixed(Math.min(MAX_SCALE, 10)).replace(/0+$/, '').replace(/\.$/, ''));
  }

  getScale(): number {
    return this.scale;
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  isPositive(): boolean {
    return this.units > 0n;
  }

  negate(): Decimal {
    return new Decimal(-this.units, this.scale);
  }

  abs(): Decimal {
    return this.units < 0n ? this.negate() : this;
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(this.atScale(scale) + other.atScale(scale), scale);
  }

  subtract(other: Decimal): Decimal {
    return this.add(other.negate());
  }

  multiply(other: Decimal): Decimal {
    const scale = this.scale + other.scale;
    if (scale > MAX_SCALE) {
      return new Decimal(this.units * other.units, scale).round(MAX_SCALE, 'half-even');
    }
    return new Decimal(this.units * other.units, scale);
  }

  divide(other: Decimal, scale: number, mode: RoundingMode = 'half-even'): Decimal {
    if (other.isZero()) {
      throw new ValidationError('divisor', 'division by zero', {});
    }
    if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
      throw new ValidationError('scale', `scale must be an integer in 0..${MAX_SCALE}`, {
        scale,
      });
    }
    const numerator = this.units * pow10(BigInt(other.scale + scale));
    const denominator = other.units * pow10(BigInt(this.scale));
    return new Decimal(divideRounded(numerator, denominator, mode), scale);
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const scale = Math.max(this.scale, other.scale);
    const left = this.atScale(scale);
    const right = other.atScale(scale);
    if (left < right) {
      return -1;
    }
    return left > right ? 1 : 0;
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  lessThan(other: Decimal): boolean {
    return this.compare(other) < 0;
  }

  lessThanOrEqual(other: Decimal): boolean {
    return this.compare(other) <= 0;
  }

  greaterThan(other: Decimal): boolean {
    return this.compare(other) > 0;
  }

  greaterThanOrEqual(other: Decimal): boolean {
    return this.compare(other) >= 0;
  }

  /** The same value with any trailing zeros dropped from its scale. */
  normalized(): Decimal {
    let units = this.units;
    let scale = this.scale;
    while (scale > 0 && units % 10n === 0n) {
      units /= 10n;
      scale -= 1;
    }
    return new Decimal(units, scale);
  }

  round(scale: number, mode: RoundingMode = 'half-up'): Decimal {
    if (scale >= this.scale) {
      return new Decimal(this.atScale(scale), scale);
    }
    const drop = this.scale - scale;
    const units = divideRounded(this.units, pow10(BigInt(drop)), mode);
    return new Decimal(units, scale);
  }

  toString(): string {
    const negative = this.units < 0n;
    const digits = (negative ? -this.units : this.units).toString().padStart(this.scale + 1, '0');
    const whole = digits.slice(0, digits.length - this.scale) || '0';
    const fraction = this.scale === 0 ? '' : `.${digits.slice(digits.length - this.scale)}`;
    return `${negative ? '-' : ''}${whole}${fraction}`;
  }

  toFixed(scale: number, mode: RoundingMode = 'half-up'): string {
    return this.round(scale, mode).toString();
  }

  toNumber(): number {
    return Number(this.toString());
  }

  toJSON(): string {
    return this.toString();
  }

  private atScale(scale: number): bigint {
    return this.units * pow10(BigInt(scale - this.scale));
  }
}

export function decimal(value: string | number): Decimal {
  return typeof value === 'string' ? Decimal.parse(value) : Decimal.fromNumber(value);
}

export function minDecimal(first: Decimal, ...rest: readonly Decimal[]): Decimal {
  return rest.reduce((best, item) => (item.lessThan(best) ? item : best), first);
}

export function maxDecimal(first: Decimal, ...rest: readonly Decimal[]): Decimal {
  return rest.reduce((best, item) => (item.greaterThan(best) ? item : best), first);
}

export function sumDecimals(values: readonly Decimal[]): Decimal {
  return values.reduce((total, item) => total.add(item), Decimal.zero());
}

function pow10(exponent: bigint): bigint {
  return 10n ** exponent;
}

function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  if (remainder === 0n) {
    return negative ? -quotient : quotient;
  }
  return negative ? -bump(quotient, remainder, absDenominator, true, mode)
    : bump(quotient, remainder, absDenominator, false, mode);
}

function bump(
  quotient: bigint,
  remainder: bigint,
  denominator: bigint,
  negative: boolean,
  mode: RoundingMode,
): bigint {
  const twice = remainder * 2n;
  switch (mode) {
    case 'truncate':
      return quotient;
    case 'floor':
      return negative ? quotient + 1n : quotient;
    case 'ceil':
      return negative ? quotient : quotient + 1n;
    case 'half-up':
      return twice >= denominator ? quotient + 1n : quotient;
    case 'half-even':
      if (twice > denominator) {
        return quotient + 1n;
      }
      if (twice < denominator) {
        return quotient;
      }
      return quotient % 2n === 0n ? quotient : quotient + 1n;
  }
}
