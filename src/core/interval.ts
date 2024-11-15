import { ValidationError } from './errors.js';

/**
 * Closed, half open and unbounded intervals over anything that can compare
 * itself to its own kind.
 *
 * Qualified ranges are the reason. A procedure qualified on a 3/8 inch coupon
 * qualifies base metal from 3/16 to 3/4 inclusive, a welder qualified on pipe
 * over 2-7/8 outside diameter qualifies that diameter and everything above it
 * with no upper limit, and the interesting questions are always whether one
 * range covers another rather than whether a single number sits inside one.
 */

/**
 * What an interval needs of its element type.
 *
 * The `toString` is not decoration. An interval prints itself into findings
 * and into the journal, and a bound that stringifies as `[object Object]`
 * turns a range in a report into nothing at all. Requiring it here means the
 * compiler refuses an element type that cannot say what it is.
 */
export interface Comparable<T> {
  compare(other: T): -1 | 0 | 1;
  toString(): string;
}

export interface IntervalOptions {
  readonly lowerInclusive?: boolean | undefined;
  readonly upperInclusive?: boolean | undefined;
}

export class Interval<T extends Comparable<T>> {
  readonly lower: T | undefined;
  readonly upper: T | undefined;
  readonly lowerInclusive: boolean;
  readonly upperInclusive: boolean;

  constructor(lower: T | undefined, upper: T | undefined, options: IntervalOptions = {}) {
    this.lower = lower;
    this.upper = upper;
    this.lowerInclusive = options.lowerInclusive ?? true;
    this.upperInclusive = options.upperInclusive ?? true;
    if (lower !== undefined && upper !== undefined && lower.compare(upper) > 0) {
      throw new ValidationError('interval', 'lower bound is above the upper bound', {
        lower: String(lower),
        upper: String(upper),
      });
    }
  }

  static closed<T extends Comparable<T>>(lower: T, upper: T): Interval<T> {
    return new Interval(lower, upper);
  }

  static atLeast<T extends Comparable<T>>(lower: T, inclusive = true): Interval<T> {
    return new Interval<T>(lower, undefined, { lowerInclusive: inclusive });
  }

  static atMost<T extends Comparable<T>>(upper: T, inclusive = true): Interval<T> {
    return new Interval<T>(undefined, upper, { upperInclusive: inclusive });
  }

  static unbounded<T extends Comparable<T>>(): Interval<T> {
    return new Interval<T>(undefined, undefined);
  }

  static exactly<T extends Comparable<T>>(point: T): Interval<T> {
    return new Interval(point, point);
  }

  isBounded(): boolean {
    return this.lower !== undefined && this.upper !== undefined;
  }

  isPoint(): boolean {
    return (
      this.lower !== undefined &&
      this.upper !== undefined &&
      this.lower.compare(this.upper) === 0 &&
      this.lowerInclusive &&
      this.upperInclusive
    );
  }

  /**
   * True when nothing can sit inside. Only a degenerate half open interval can
   * be empty, since the constructor already refuses a crossed pair.
   */
  isEmpty(): boolean {
    if (this.lower === undefined || this.upper === undefined) {
      return false;
    }
    const order = this.lower.compare(this.upper);
    if (order < 0) {
      return false;
    }
    return !(this.lowerInclusive && this.upperInclusive);
  }

  contains(value: T): boolean {
    if (this.lower !== undefined) {
      const order = value.compare(this.lower);
      if (order < 0 || (order === 0 && !this.lowerInclusive)) {
        return false;
      }
    }
    if (this.upper !== undefined) {
      const order = value.compare(this.upper);
      if (order > 0 || (order === 0 && !this.upperInclusive)) {
        return false;
      }
    }
    return true;
  }

  /** True when every value of `other` is also inside this interval. */
  covers(other: Interval<T>): boolean {
    if (other.isEmpty()) {
      return true;
    }
    if (this.lower !== undefined) {
      if (other.lower === undefined) {
        return false;
      }
      const order = other.lower.compare(this.lower);
      if (order < 0) {
        return false;
      }
      if (order === 0 && other.lowerInclusive && !this.lowerInclusive) {
        return false;
      }
    }
    if (this.upper !== undefined) {
      if (other.upper === undefined) {
        return false;
      }
      const order = other.upper.compare(this.upper);
      if (order > 0) {
        return false;
      }
      if (order === 0 && other.upperInclusive && !this.upperInclusive) {
        return false;
      }
    }
    return true;
  }

  overlaps(other: Interval<T>): boolean {
    return !this.intersect(other).isEmpty();
  }

  intersect(other: Interval<T>): Interval<T> {
    const lower = pickBound(this, other, 'lower');
    const upper = pickBound(this, other, 'upper');
    if (
      lower.value !== undefined &&
      upper.value !== undefined &&
      lower.value.compare(upper.value) > 0
    ) {
      return new Interval<T>(upper.value, upper.value, {
        lowerInclusive: false,
        upperInclusive: false,
      });
    }
    return new Interval(lower.value, upper.value, {
      lowerInclusive: lower.inclusive,
      upperInclusive: upper.inclusive,
    });
  }

  toString(): string {
    const open = this.lowerInclusive ? '[' : '(';
    const close = this.upperInclusive ? ']' : ')';
    const left = this.lower === undefined ? '-inf' : String(this.lower);
    const right = this.upper === undefined ? '+inf' : String(this.upper);
    return `${open}${left}, ${right}${close}`;
  }

  toJSON(): {
    lower: string | null;
    upper: string | null;
    lowerInclusive: boolean;
    upperInclusive: boolean;
  } {
    return {
      lower: this.lower === undefined ? null : String(this.lower),
      upper: this.upper === undefined ? null : String(this.upper),
      lowerInclusive: this.lowerInclusive,
      upperInclusive: this.upperInclusive,
    };
  }
}

interface Bound<T> {
  value: T | undefined;
  inclusive: boolean;
}

function pickBound<T extends Comparable<T>>(
  left: Interval<T>,
  right: Interval<T>,
  side: 'lower' | 'upper',
): Bound<T> {
  const leftValue = side === 'lower' ? left.lower : left.upper;
  const rightValue = side === 'lower' ? right.lower : right.upper;
  const leftInclusive = side === 'lower' ? left.lowerInclusive : left.upperInclusive;
  const rightInclusive = side === 'lower' ? right.lowerInclusive : right.upperInclusive;
  if (leftValue === undefined) {
    return { value: rightValue, inclusive: rightInclusive };
  }
  if (rightValue === undefined) {
    return { value: leftValue, inclusive: leftInclusive };
  }
  const order = leftValue.compare(rightValue);
  const takeLeft = side === 'lower' ? order > 0 : order < 0;
  if (order === 0) {
    return { value: leftValue, inclusive: leftInclusive && rightInclusive };
  }
  return takeLeft
    ? { value: leftValue, inclusive: leftInclusive }
    : { value: rightValue, inclusive: rightInclusive };
}
