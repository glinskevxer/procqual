import { describe, expect, it } from 'vitest';

import {
  describePwht,
  holdingTemperatureAccepted,
  holdingTimeHours,
  isAboveTransformation,
  minimumPreheat,
  preheatRule,
  pwhtRequired,
  pwhtRule,
} from '../../../src/codes/heatTreatment.js';
import { ValidationError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';

describe('preheat', () => {
  it('leaves thin ordinary carbon steel at the ambient figure', () => {
    expect(minimumPreheat('1', inches('0.5')).toFahrenheit().toString()).toBe('50');
  });

  it('raises it once the plate gets thick', () => {
    expect(minimumPreheat('1', inches('2')).toFahrenheit().toString()).toBe('175');
    expect(minimumPreheat('1', inches('1.5')).toFahrenheit().toString()).toBe('50');
    expect(minimumPreheat('1', inches('1.51')).toFahrenheit().toString()).toBe('175');
  });

  it('raises it on a strong metal however thin the plate is', () => {
    expect(minimumPreheat('1', inches('0.25'), 80).toFahrenheit().toString()).toBe('175');
    expect(minimumPreheat('1', inches('0.25'), 70).toFahrenheit().toString()).toBe('50');
  });

  it('steps at a much thinner section on the low alloys', () => {
    expect(minimumPreheat('3', inches('0.5')).toFahrenheit().toString()).toBe('50');
    expect(minimumPreheat('3', inches('0.75')).toFahrenheit().toString()).toBe('175');
  });

  it('holds the chrome molys high at any thickness', () => {
    expect(minimumPreheat('5B', inches('0.25')).toFahrenheit().toString()).toBe('400');
    expect(minimumPreheat('15E', inches('0.25')).toFahrenheit().toString()).toBe('400');
  });

  it('asks for nothing on austenitic stainless or aluminium', () => {
    expect(minimumPreheat('8', inches('3')).toFahrenheit().toString()).toBe('50');
    expect(minimumPreheat('22', inches('3')).toFahrenheit().toString()).toBe('50');
  });

  it('exposes the rule itself', () => {
    expect(preheatRule('4').stepThickness.toFraction()).toBe('1/2');
    expect(preheatRule('1').strongMetalKsi).toBe(71);
  });
});

describe('when heat treatment is called for', () => {
  it('leaves thin carbon steel alone and catches thick', () => {
    expect(pwhtRequired('1', inches('1'))).toBe(false);
    expect(pwhtRequired('1', inches('1.5'))).toBe(false);
    expect(pwhtRequired('1', inches('2'))).toBe(true);
  });

  it('catches the low alloys much earlier', () => {
    expect(pwhtRequired('3', inches('0.5'))).toBe(false);
    expect(pwhtRequired('3', inches('0.75'))).toBe(true);
  });

  it('always catches the chrome molys', () => {
    expect(pwhtRequired('5A', inches('0.125'))).toBe(true);
    expect(pwhtRequired('15E', inches('0.125'))).toBe(true);
  });

  it('never catches austenitic stainless, duplex, aluminium or nickel', () => {
    expect(pwhtRequired('8', inches('4'))).toBe(false);
    expect(pwhtRequired('10H', inches('4'))).toBe(false);
    expect(pwhtRequired('22', inches('4'))).toBe(false);
    expect(pwhtRequired('45', inches('4'))).toBe(false);
  });

  it('refuses a P number it has no rule for', () => {
    expect(() => pwhtRequired('99', inches('1'))).toThrow(ValidationError);
    expect(() => preheatRule('99')).toThrow(ValidationError);
  });
});

describe('holding time', () => {
  it('is an hour to the inch through the ordinary range', () => {
    expect(holdingTimeHours(inches('1')).toString()).toBe('1');
    expect(holdingTimeHours(inches('2.5')).toString()).toBe('2.5');
  });

  it('never goes below a quarter of an hour', () => {
    expect(holdingTimeHours(inches('0.125')).toString()).toBe('0.25');
    expect(holdingTimeHours(inches('0.25')).toString()).toBe('0.25');
  });

  it('drops to a quarter hour to the inch past five inches', () => {
    expect(holdingTimeHours(inches('5')).toString()).toBe('5');
    expect(holdingTimeHours(inches('7')).toString()).toBe('5.5');
    expect(holdingTimeHours(inches('9')).toString()).toBe('6');
  });

  it('refuses a section with no thickness', () => {
    expect(() => holdingTimeHours(inches('0'))).toThrow(ValidationError);
  });
});

describe('holding temperature', () => {
  it('accepts a soak inside the band', () => {
    expect(holdingTemperatureAccepted('1', fahrenheit('1150'))).toBe(true);
    expect(holdingTemperatureAccepted('1', fahrenheit('1050'))).toBe(false);
    expect(holdingTemperatureAccepted('1', fahrenheit('1300'))).toBe(false);
  });

  it('holds the band ends inclusive', () => {
    expect(holdingTemperatureAccepted('1', fahrenheit('1100'))).toBe(true);
    expect(holdingTemperatureAccepted('1', fahrenheit('1250'))).toBe(true);
  });
});

describe('the transformation temperature', () => {
  it('is above the ordinary soak band, so a normal treatment is safe', () => {
    expect(isAboveTransformation('1', fahrenheit('1150'))).toBe(false);
    expect(pwhtRule('1').upperTransformation.toFahrenheit().toString()).toBe('1340');
  });

  it('catches a soak that has gone past it', () => {
    expect(isAboveTransformation('1', fahrenheit('1400'))).toBe(true);
    expect(isAboveTransformation('15E', fahrenheit('1500'))).toBe(true);
    expect(isAboveTransformation('15E', fahrenheit('1400'))).toBe(false);
  });

  it('treats a solution anneal on austenitic stainless as being past it', () => {
    expect(isAboveTransformation('8', fahrenheit('1950'))).toBe(true);
  });
});

describe('describing the treatment', () => {
  it('says so when there is none', () => {
    expect(describePwht('8', inches('2'))).toBe('no post weld heat treatment required');
  });

  it('gives the band and the time', () => {
    expect(describePwht('1', inches('2'))).toBe('hold [1100 F, 1250 F] for 2 hours');
  });
});
