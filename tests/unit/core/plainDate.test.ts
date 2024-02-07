import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import {
  date,
  daysInMonth,
  earliest,
  isLeapYear,
  latest,
  PlainDate,
} from '../../../src/core/plainDate.js';

describe('construction', () => {
  it('parses an ISO date', () => {
    const value = date('2024-03-14');
    expect(value.year).toBe(2024);
    expect(value.month).toBe(3);
    expect(value.day).toBe(14);
  });

  it('rejects anything that is not an ISO date', () => {
    expect(() => date('14/03/2024')).toThrow(ValidationError);
    expect(() => date('2024-3-4')).toThrow(ValidationError);
    expect(() => date('')).toThrow(ValidationError);
  });

  it('rejects an impossible month or day', () => {
    expect(() => PlainDate.of(2024, 13, 1)).toThrow(/month out of range/);
    expect(() => PlainDate.of(2024, 0, 1)).toThrow(/month out of range/);
    expect(() => PlainDate.of(2023, 2, 29)).toThrow(/day out of range/);
    expect(() => PlainDate.of(2024, 4, 31)).toThrow(/day out of range/);
    expect(() => PlainDate.of(2024, 1, 0)).toThrow(/day out of range/);
  });

  it('rejects fractional parts', () => {
    expect(() => PlainDate.of(2024.5, 1, 1)).toThrow(ValidationError);
  });

  it('accepts the twenty ninth of February in a leap year', () => {
    expect(PlainDate.of(2024, 2, 29).toString()).toBe('2024-02-29');
  });

  it('reads a date out of an instant in UTC', () => {
    const instant = new Date(Date.UTC(2025, 0, 2, 23, 30));
    expect(PlainDate.fromInstant(instant).toString()).toBe('2025-01-02');
  });
});

describe('day arithmetic', () => {
  it('walks forward over a month end', () => {
    expect(date('2024-01-31').addDays(1).toString()).toBe('2024-02-01');
  });

  it('walks backward over a year end', () => {
    expect(date('2024-01-01').addDays(-1).toString()).toBe('2023-12-31');
  });

  it('counts the days between two dates', () => {
    expect(date('2024-01-01').daysUntil(date('2024-03-01'))).toBe(60);
    expect(date('2024-03-01').daysUntil(date('2024-01-01'))).toBe(-60);
    expect(date('2024-05-05').daysUntil(date('2024-05-05'))).toBe(0);
  });
});

describe('month arithmetic', () => {
  it('adds whole months', () => {
    expect(date('2024-01-15').addMonths(6).toString()).toBe('2024-07-15');
    expect(date('2024-11-15').addMonths(3).toString()).toBe('2025-02-15');
  });

  it('clamps the day when the target month is shorter', () => {
    expect(date('2024-01-31').addMonths(1).toString()).toBe('2024-02-29');
    expect(date('2023-01-31').addMonths(1).toString()).toBe('2023-02-28');
    expect(date('2024-03-31').addMonths(-1).toString()).toBe('2024-02-29');
  });

  it('adds years through months', () => {
    expect(date('2024-02-29').addYears(1).toString()).toBe('2025-02-28');
  });

  it('counts whole months, which is what the continuity rule asks for', () => {
    expect(date('2024-01-15').monthsUntil(date('2024-07-15'))).toBe(6);
    expect(date('2024-01-15').monthsUntil(date('2024-07-14'))).toBe(5);
    expect(date('2024-01-15').monthsUntil(date('2024-07-16'))).toBe(6);
    expect(date('2024-07-15').monthsUntil(date('2024-01-15'))).toBe(-6);
    expect(date('2024-07-15').monthsUntil(date('2024-01-16'))).toBe(-5);
  });
});

describe('comparison', () => {
  const middle = date('2024-06-01');

  it('orders dates', () => {
    expect(date('2024-05-31').isBefore(middle)).toBe(true);
    expect(date('2024-06-02').isAfter(middle)).toBe(true);
    expect(middle.equals(date('2024-06-01'))).toBe(true);
    expect(middle.compare(date('2024-06-01'))).toBe(0);
  });

  it('has inclusive forms for a boundary day', () => {
    expect(middle.isOnOrBefore(middle)).toBe(true);
    expect(middle.isOnOrAfter(middle)).toBe(true);
    expect(middle.isBefore(middle)).toBe(false);
  });

  it('picks the earliest and the latest', () => {
    const list = [date('2024-06-01'), date('2024-01-01'), date('2024-12-31')];
    expect(earliest(list[0]!, ...list.slice(1)).toString()).toBe('2024-01-01');
    expect(latest(list[0]!, ...list.slice(1)).toString()).toBe('2024-12-31');
  });
});

describe('calendar helpers', () => {
  it('knows the leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('knows how long each month is', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('serialises back to ISO', () => {
    expect(JSON.parse(JSON.stringify({ d: date('2024-06-01') }))).toEqual({ d: '2024-06-01' });
  });
});
