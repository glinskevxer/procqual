import { describe, expect, it } from 'vitest';

import { FixedClock, ManualClock, SystemClock } from '../../../src/core/clock.js';
import { date } from '../../../src/core/plainDate.js';

describe('SystemClock', () => {
  it('reads the wall clock', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before - 1000);
    expect(now).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('reports a date that matches its own instant', () => {
    const clock = new SystemClock();
    expect(clock.today().toString()).toBe(clock.now().toISOString().slice(0, 10));
  });
});

describe('FixedClock', () => {
  it('never moves', () => {
    const clock = new FixedClock('2024-06-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2024-06-01T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2024-06-01T12:00:00.000Z');
    expect(clock.today().toString()).toBe('2024-06-01');
  });

  it('can be built from a date alone', () => {
    const clock = FixedClock.onDate('2024-06-01');
    expect(clock.today().toString()).toBe('2024-06-01');
    expect(FixedClock.onDate(date('2025-01-02')).today().toString()).toBe('2025-01-02');
  });

  it('hands out a copy so a caller cannot move it', () => {
    const clock = new FixedClock('2024-06-01T12:00:00.000Z');
    const stolen = clock.now();
    stolen.setUTCFullYear(1999);
    expect(clock.today().toString()).toBe('2024-06-01');
  });

  it('refuses an instant it cannot read', () => {
    expect(() => new FixedClock('not a date')).toThrow(/not an instant/);
  });
});

describe('ManualClock', () => {
  it('moves by days', () => {
    const clock = ManualClock.onDate('2024-01-31');
    clock.advanceDays(1);
    expect(clock.today().toString()).toBe('2024-02-01');
    clock.advanceDays(-1);
    expect(clock.today().toString()).toBe('2024-01-31');
  });

  it('moves by months and clamps the day', () => {
    const clock = ManualClock.onDate('2024-01-31');
    clock.advanceMonths(1);
    expect(clock.today().toString()).toBe('2024-02-29');
  });

  it('moves by milliseconds without changing the day until it should', () => {
    const clock = new ManualClock('2024-06-01T23:59:59.000Z');
    clock.advanceMillis(500);
    expect(clock.today().toString()).toBe('2024-06-01');
    clock.advanceMillis(1000);
    expect(clock.today().toString()).toBe('2024-06-02');
  });

  it('can be set outright', () => {
    const clock = new ManualClock('2024-06-01T00:00:00.000Z');
    clock.set('2025-01-01T00:00:00.000Z');
    expect(clock.today().toString()).toBe('2025-01-01');
    clock.setDate(date('2025-03-04'));
    expect(clock.today().toString()).toBe('2025-03-04');
  });

  it('walks a six month continuity window', () => {
    const clock = ManualClock.onDate('2024-01-15');
    const lastUsed = clock.today();
    clock.advanceMonths(6);
    expect(lastUsed.monthsUntil(clock.today())).toBe(6);
    clock.advanceDays(-1);
    expect(lastUsed.monthsUntil(clock.today())).toBe(5);
  });
});
