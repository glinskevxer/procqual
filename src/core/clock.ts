import { PlainDate } from './plainDate.js';

/**
 * Reading the time is an injected capability, not a global.
 *
 * Continuity, expiry and the rolling repair rate window all turn on today's
 * date, and a test that has to wait six months to prove a lapse is not a test.
 * Everything that needs the date takes a Clock.
 */
export interface Clock {
  /** The current instant, used for journal timestamps. */
  now(): Date;
  /** Today's calendar date in the yard's own reckoning, which is UTC here. */
  today(): PlainDate;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): PlainDate {
    return PlainDate.fromInstant(this.now());
  }
}

/** A clock that never moves. Most tests want this one. */
export class FixedClock implements Clock {
  private readonly instant: Date;

  constructor(instant: Date | string) {
    this.instant = typeof instant === 'string' ? parseInstant(instant) : new Date(instant);
  }

  static onDate(day: PlainDate | string): FixedClock {
    const value = typeof day === 'string' ? PlainDate.parse(day) : day;
    return new FixedClock(`${value.toString()}T00:00:00.000Z`);
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }

  today(): PlainDate {
    return PlainDate.fromInstant(this.instant);
  }
}

/** A clock a test can push forward, for continuity and expiry cases. */
export class ManualClock implements Clock {
  private instant: Date;

  constructor(instant: Date | string) {
    this.instant = typeof instant === 'string' ? parseInstant(instant) : new Date(instant);
  }

  static onDate(day: PlainDate | string): ManualClock {
    const value = typeof day === 'string' ? PlainDate.parse(day) : day;
    return new ManualClock(`${value.toString()}T00:00:00.000Z`);
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }

  today(): PlainDate {
    return PlainDate.fromInstant(this.instant);
  }

  set(instant: Date | string): void {
    this.instant = typeof instant === 'string' ? parseInstant(instant) : new Date(instant);
  }

  setDate(day: PlainDate | string): void {
    const value = typeof day === 'string' ? PlainDate.parse(day) : day;
    this.set(`${value.toString()}T00:00:00.000Z`);
  }

  advanceMillis(millis: number): void {
    this.instant = new Date(this.instant.getTime() + millis);
  }

  advanceDays(days: number): void {
    this.setDate(this.today().addDays(days));
  }

  advanceMonths(months: number): void {
    this.setDate(this.today().addMonths(months));
  }
}

function parseInstant(text: string): Date {
  const value = new Date(text);
  if (Number.isNaN(value.getTime())) {
    throw new TypeError(`not an instant: ${text}`);
  }
  return value;
}
