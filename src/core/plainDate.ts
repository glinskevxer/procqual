import { ValidationError } from './errors.js';

/**
 * A calendar date with no time and no zone.
 *
 * Continuity is counted in whole months from the last day a welder deposited
 * metal with a process, expiry lands on a date rather than an instant, and a
 * qualification does not lapse an hour earlier because the shop is in a
 * different time zone from the head office. Every date in the system is one of
 * these, and `Date` is only ever used to read the wall clock.
 */

const DAY_MS = 86_400_000;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class PlainDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  private constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  static of(year: number, month: number, day: number): PlainDate {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      throw new ValidationError('date', 'a date needs whole numbers', { year, month, day });
    }
    if (month < 1 || month > 12) {
      throw new ValidationError('date', `month out of range: ${month}`, { month });
    }
    const limit = daysInMonth(year, month);
    if (day < 1 || day > limit) {
      throw new ValidationError('date', `day out of range for that month: ${day}`, {
        year,
        month,
        day,
        limit,
      });
    }
    return new PlainDate(year, month, day);
  }

  static parse(text: string): PlainDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (match === null) {
      throw new ValidationError('date', `not an ISO date: ${JSON.stringify(text)}`, { text });
    }
    return PlainDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  static fromEpochDay(days: number): PlainDate {
    const date = new Date(days * DAY_MS);
    return new PlainDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  static fromInstant(instant: Date): PlainDate {
    return new PlainDate(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
  }

  toEpochDay(): number {
    return Math.floor(Date.UTC(this.year, this.month - 1, this.day) / DAY_MS);
  }

  addDays(days: number): PlainDate {
    return PlainDate.fromEpochDay(this.toEpochDay() + days);
  }

  /**
   * Move by whole months, clamping the day of month. The last day of January
   * plus one month is the last day of February, which is the reading every
   * expiry table in the shop uses.
   */
  addMonths(months: number): PlainDate {
    const total = this.year * 12 + (this.month - 1) + months;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    const day = Math.min(this.day, daysInMonth(year, month));
    return new PlainDate(year, month, day);
  }

  addYears(years: number): PlainDate {
    return this.addMonths(years * 12);
  }

  daysUntil(other: PlainDate): number {
    return other.toEpochDay() - this.toEpochDay();
  }

  /** Whole months between the two dates, truncated toward zero. */
  monthsUntil(other: PlainDate): number {
    const gross = (other.year - this.year) * 12 + (other.month - this.month);
    if (gross > 0 && other.day < this.day) {
      return gross - 1;
    }
    if (gross < 0 && other.day > this.day) {
      return gross + 1;
    }
    return gross;
  }

  compare(other: PlainDate): -1 | 0 | 1 {
    const left = this.toEpochDay();
    const right = other.toEpochDay();
    if (left < right) {
      return -1;
    }
    return left > right ? 1 : 0;
  }

  equals(other: PlainDate): boolean {
    return this.compare(other) === 0;
  }

  isBefore(other: PlainDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: PlainDate): boolean {
    return this.compare(other) > 0;
  }

  isOnOrBefore(other: PlainDate): boolean {
    return this.compare(other) <= 0;
  }

  isOnOrAfter(other: PlainDate): boolean {
    return this.compare(other) >= 0;
  }

  toString(): string {
    return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

export function date(text: string): PlainDate {
  return PlainDate.parse(text);
}

export function earliest(first: PlainDate, ...rest: readonly PlainDate[]): PlainDate {
  return rest.reduce((best, item) => (item.isBefore(best) ? item : best), first);
}

export function latest(first: PlainDate, ...rest: readonly PlainDate[]): PlainDate {
  return rest.reduce((best, item) => (item.isAfter(best) ? item : best), first);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return MONTH_LENGTHS[month - 1] ?? 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
