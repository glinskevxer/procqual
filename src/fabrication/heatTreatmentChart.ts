import { holdingTimeHours, isAboveTransformation, pwhtRule } from '../codes/heatTreatment.js';
import { Decimal, decimal } from '../core/decimal.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { coldest, fahrenheit, hottest, type Temperature } from '../core/temperature.js';
import type { Length } from '../core/units.js';

/**
 * Reading a post weld heat treatment chart.
 *
 * The soak is the part everyone looks at and it is the easy part. What goes
 * wrong is the ramp. Heating a thick section too fast puts a temperature
 * difference across the wall, the difference puts stress into the joint, and
 * the whole point of the treatment was to take stress out. So the allowed rate
 * falls as the section thickens, which means the same furnace programme is
 * fine on one vessel and wrong on the next.
 *
 * The other thing a chart has to show is that the whole piece got there. One
 * thermocouple proves one place was hot. The spread between the couples is
 * what proves the load was soaked rather than the door end of it.
 */

export const RAMP_ABOVE = fahrenheit('800');
export const MAXIMUM_RATE_NUMERATOR = decimal('400');
export const MINIMUM_ALLOWED_RATE = decimal('100');
export const COUPLE_SPREAD_LIMIT = decimal('150');

export interface ChartReading {
  /** Minutes from the start of the run. */
  readonly minute: number;
  /** One temperature per thermocouple, in couple order. */
  readonly couples: readonly Temperature[];
}

export interface HeatTreatmentChart {
  readonly id: string;
  readonly vessel: string;
  readonly joints: readonly string[];
  readonly furnace: string;
  readonly pNumber: string;
  readonly governingThickness: Length;
  readonly runOn: PlainDate;
  readonly readings: readonly ChartReading[];
}

/**
 * Maximum heating or cooling rate above eight hundred degrees, in degrees an
 * hour. Four hundred divided by the thickness in inches, never below a hundred
 * and never above four hundred.
 */
export function maximumRate(thickness: Length): Decimal {
  const inchesThick = thickness.toInches();
  if (!inchesThick.isPositive()) {
    throw new ValidationError('governingThickness', 'the section has no thickness', {});
  }
  if (inchesThick.lessThanOrEqual(decimal('1'))) {
    return MAXIMUM_RATE_NUMERATOR;
  }
  const rate = MAXIMUM_RATE_NUMERATOR.divide(inchesThick, 1).normalized();
  return rate.lessThan(MINIMUM_ALLOWED_RATE) ? MINIMUM_ALLOWED_RATE : rate;
}

export function averageOf(reading: ChartReading): Temperature {
  if (reading.couples.length === 0) {
    throw new ValidationError('couples', `the reading at minute ${reading.minute} has no couples`, {
      minute: reading.minute,
    });
  }
  const total = reading.couples.reduce(
    (running, couple) => running.add(couple.toFahrenheit()),
    Decimal.zero(),
  );
  return fahrenheit(total.divide(Decimal.fromInteger(reading.couples.length), 1));
}

export function spreadOf(reading: ChartReading): Decimal {
  if (reading.couples.length === 0) {
    return Decimal.zero();
  }
  const [first, ...rest] = reading.couples;
  if (first === undefined) {
    return Decimal.zero();
  }
  return hottest(first, ...rest)
    .toFahrenheit()
    .subtract(coldest(first, ...rest).toFahrenheit());
}

export interface SoakReading {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly hours: Decimal;
  readonly lowest: Temperature;
  readonly highest: Temperature;
}

/** The stretch where every couple sat inside the holding band. */
export function soakOf(chart: HeatTreatmentChart): SoakReading | undefined {
  const band = pwhtRule(chart.pNumber).holdingRange;
  const inBand = chart.readings.filter((reading) =>
    reading.couples.every((couple) => band.contains(couple)),
  );
  const first = inBand[0];
  const last = inBand[inBand.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const [head, ...rest] = inBand.flatMap((reading) => reading.couples);
  if (head === undefined) {
    return undefined;
  }
  return {
    startMinute: first.minute,
    endMinute: last.minute,
    hours: decimal(((last.minute - first.minute) / 60).toFixed(2)).normalized(),
    lowest: coldest(head, ...rest),
    highest: hottest(head, ...rest),
  };
}

/** Rates between consecutive readings, once the load is above the ramp point. */
export function rates(chart: HeatTreatmentChart): readonly { minute: number; rate: Decimal }[] {
  const out: { minute: number; rate: Decimal }[] = [];
  for (let index = 1; index < chart.readings.length; index += 1) {
    const previous = chart.readings[index - 1];
    const current = chart.readings[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const before = averageOf(previous);
    const after = averageOf(current);
    if (before.isBelow(RAMP_ABOVE) && after.isBelow(RAMP_ABOVE)) {
      continue;
    }
    const minutes = current.minute - previous.minute;
    if (minutes <= 0) {
      continue;
    }
    const change = after.toFahrenheit().subtract(before.toFahrenheit()).abs();
    out.push({
      minute: current.minute,
      rate: change.multiply(decimal('60')).divide(Decimal.fromInteger(minutes), 1).normalized(),
    });
  }
  return out;
}

export function reviewChart(chart: HeatTreatmentChart): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = chart.id;
  if (chart.readings.length < 2) {
    findings.push(
      blocking('pwht.no_chart', 'the run has fewer than two readings, so it is not a chart', {
        subject,
      }),
    );
    return findings;
  }
  if (chart.readings.some((reading) => reading.couples.length < 2)) {
    findings.push(
      deficiency(
        'pwht.one_couple',
        'one couple proves one place was hot, not that the load was soaked',
        { subject },
      ),
    );
  }

  const limit = maximumRate(chart.governingThickness);
  for (const item of rates(chart)) {
    if (item.rate.greaterThan(limit)) {
      findings.push(
        blocking(
          'pwht.rate_exceeded',
          `${item.rate.toString()} degrees an hour at minute ${item.minute} against a limit of ${limit.toString()}`,
          { clause: 'UCS-56', subject },
        ),
      );
    }
  }

  for (const reading of chart.readings) {
    if (spreadOf(reading).greaterThan(COUPLE_SPREAD_LIMIT)) {
      findings.push(
        blocking(
          'pwht.couple_spread',
          `the couples were ${spreadOf(reading).toString()} degrees apart at minute ${reading.minute}`,
          { subject },
        ),
      );
    }
  }

  const soak = soakOf(chart);
  const required = holdingTimeHours(chart.governingThickness);
  if (soak === undefined) {
    findings.push(
      blocking('pwht.no_soak', 'the chart never shows every couple inside the holding band', {
        subject,
      }),
    );
  } else {
    if (soak.hours.lessThan(required)) {
      findings.push(
        blocking(
          'pwht.short_soak',
          `held for ${soak.hours.toString()} hours against ${required.toString()} required`,
          { clause: 'UCS-56', subject },
        ),
      );
    }
    if (isAboveTransformation(chart.pNumber, soak.highest)) {
      findings.push(
        blocking(
          'pwht.above_transformation',
          `the load reached ${soak.highest.toString()}, which is past the transformation temperature and rebuilds the grain`,
          { subject },
        ),
      );
    }
  }
  return findings;
}
