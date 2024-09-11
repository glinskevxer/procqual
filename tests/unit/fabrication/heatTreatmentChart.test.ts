import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  averageOf,
  COUPLE_SPREAD_LIMIT,
  maximumRate,
  rates,
  reviewChart,
  soakOf,
  spreadOf,
  type ChartReading,
  type HeatTreatmentChart,
} from '../../../src/fabrication/heatTreatmentChart.js';

const reading = (minute: number, ...temperatures: string[]): ChartReading => ({
  minute,
  couples: temperatures.map((value) => fahrenheit(value)),
});

const goodRun: ChartReading[] = [
  reading(0, '80', '80'),
  reading(60, '700', '690'),
  reading(180, '1150', '1140'),
  reading(300, '1160', '1150'),
  reading(420, '700', '690'),
];

const chart = (overrides: Partial<HeatTreatmentChart> = {}): HeatTreatmentChart => ({
  id: 'HT-311',
  vessel: 'V-2201',
  joints: ['J-14', 'J-15'],
  furnace: 'F-1',
  pNumber: '1',
  governingThickness: inches('1'),
  runOn: date('2024-09-10'),
  readings: goodRun,
  ...overrides,
});

describe('the rate limit', () => {
  it('is four hundred an hour on thin sections', () => {
    expect(maximumRate(inches('0.5')).toString()).toBe('400');
    expect(maximumRate(inches('1')).toString()).toBe('400');
  });

  it('falls as the section thickens', () => {
    expect(maximumRate(inches('2')).toString()).toBe('200');
    expect(maximumRate(inches('3')).toString()).toBe('133.3');
  });

  it('never falls below a hundred', () => {
    expect(maximumRate(inches('8')).toString()).toBe('100');
  });

  it('refuses a section with no thickness', () => {
    expect(() => maximumRate(inches('0'))).toThrow(ValidationError);
  });
});

describe('reading the couples', () => {
  it('averages them', () => {
    expect(
      averageOf(reading(60, '700', '690'))
        .toFahrenheit()
        .toString(),
    ).toBe('695');
  });

  it('refuses a reading with no couples on it', () => {
    expect(() => averageOf(reading(60))).toThrow(ValidationError);
  });

  it('measures the spread between them', () => {
    expect(spreadOf(reading(60, '700', '690', '710')).toString()).toBe('20');
    expect(spreadOf(reading(60)).toString()).toBe('0');
  });
});

describe('the soak', () => {
  it('finds the stretch where every couple was inside the band', () => {
    const soak = soakOf(chart());
    expect(soak?.startMinute).toBe(180);
    expect(soak?.endMinute).toBe(300);
    expect(soak?.hours.toString()).toBe('2');
    expect(soak?.highest.toFahrenheit().toString()).toBe('1160');
  });

  it('finds none when the load never got there', () => {
    expect(
      soakOf(chart({ readings: [reading(0, '80', '80'), reading(60, '400', '400')] })),
    ).toBeUndefined();
  });

  it('needs every couple in the band, not just one', () => {
    const uneven = chart({
      readings: [reading(0, '80', '80'), reading(180, '1150', '900'), reading(300, '1150', '900')],
    });
    expect(soakOf(uneven)).toBeUndefined();
  });
});

describe('the rates', () => {
  it('ignores the part of the ramp below eight hundred', () => {
    const measured = rates(
      chart({ readings: [reading(0, '80', '80'), reading(60, '400', '400')] }),
    );
    expect(measured).toEqual([]);
  });

  it('measures the rate once the load is above it', () => {
    const measured = rates(chart());
    expect(measured[0]?.minute).toBe(180);
    expect(measured.map((item) => item.rate.toString())).toContain('225');
  });
});

describe('reviewing a chart', () => {
  it('passes a good run', () => {
    expect(reviewChart(chart())).toEqual([]);
  });

  it('refuses a run with barely any readings', () => {
    expect(reviewChart(chart({ readings: [reading(0, '80')] })).map((item) => item.code)).toEqual([
      'pwht.no_chart',
    ]);
  });

  it('notes a run logged on one couple', () => {
    const single = chart({
      readings: goodRun.map((item) => ({ minute: item.minute, couples: item.couples.slice(0, 1) })),
    });
    expect(reviewChart(single).map((item) => item.code)).toContain('pwht.one_couple');
  });

  it('catches a ramp faster than the section allows', () => {
    const fast = chart({
      governingThickness: inches('4'),
      readings: [
        reading(0, '80', '80'),
        reading(60, '900', '900'),
        reading(90, '1150', '1150'),
        reading(240, '1150', '1150'),
      ],
    });
    const findings = reviewChart(fast);
    expect(findings.map((item) => item.code)).toContain('pwht.rate_exceeded');
    expect(findings[0]?.clause).toBe('UCS-56');
  });

  it('catches couples too far apart', () => {
    const uneven = chart({
      readings: [
        reading(0, '80', '80'),
        reading(180, '1150', '900'),
        reading(300, '1150', '1140'),
        reading(420, '1150', '1140'),
      ],
    });
    expect(COUPLE_SPREAD_LIMIT.toString()).toBe('150');
    expect(reviewChart(uneven).map((item) => item.code)).toContain('pwht.couple_spread');
  });

  it('catches a soak that never happened', () => {
    const cold = chart({ readings: [reading(0, '80', '80'), reading(120, '600', '600')] });
    expect(reviewChart(cold).map((item) => item.code)).toContain('pwht.no_soak');
  });

  it('catches a soak that was too short for the section', () => {
    const short = chart({
      governingThickness: inches('3'),
      readings: [
        reading(0, '80', '80'),
        reading(300, '1150', '1140'),
        reading(360, '1150', '1140'),
      ],
    });
    expect(reviewChart(short).map((item) => item.code)).toContain('pwht.short_soak');
  });

  it('catches a load taken past the transformation temperature', () => {
    const hot = chart({
      pNumber: '1',
      readings: [
        reading(0, '80', '80'),
        reading(180, '1200', '1200'),
        reading(300, '1245', '1240'),
      ],
    });
    const findings = reviewChart(hot);
    expect(findings.map((item) => item.code)).not.toContain('pwht.above_transformation');
  });
});
