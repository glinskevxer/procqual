import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import {
  celsius,
  coldest,
  fahrenheit,
  hottest,
  Temperature,
} from '../../../src/core/temperature.js';

describe('construction', () => {
  it('holds Fahrenheit as given', () => {
    expect(fahrenheit('300').toFahrenheit().toString()).toBe('300');
    expect(fahrenheit(300).toString()).toBe('300 F');
  });

  it('converts Celsius on the way in', () => {
    expect(celsius('100').toFahrenheit().toString()).toBe('212');
    expect(celsius('0').toFahrenheit().toString()).toBe('32');
    expect(celsius('-40').toFahrenheit().toString()).toBe('-40');
  });

  it('converts back to Celsius', () => {
    expect(fahrenheit('212').toCelsius().toString()).toBe('100');
    expect(fahrenheit('350').toCelsius().toString()).toBe('176.67');
  });

  it('refuses a temperature below absolute zero', () => {
    expect(() => fahrenheit('-500')).toThrow(ValidationError);
    expect(() => celsius('-300')).toThrow(ValidationError);
  });
});

describe('parsing', () => {
  it('reads a bare number as Fahrenheit', () => {
    expect(Temperature.parse('300').toFahrenheit().toString()).toBe('300');
  });

  it('reads an explicit unit', () => {
    expect(Temperature.parse('300F').toFahrenheit().toString()).toBe('300');
    expect(Temperature.parse('300 F').toFahrenheit().toString()).toBe('300');
    expect(Temperature.parse('150C').toFahrenheit().toString()).toBe('302');
    expect(Temperature.parse('150 degC').toFahrenheit().toString()).toBe('302');
    expect(Temperature.parse('150 °C').toFahrenheit().toString()).toBe('302');
  });

  it('refuses what it cannot read', () => {
    expect(() => Temperature.parse('warm')).toThrow(ValidationError);
    expect(() => Temperature.parse('300K')).toThrow(ValidationError);
    expect(() => Temperature.parse('')).toThrow(ValidationError);
  });
});

describe('comparison', () => {
  const preheat = fahrenheit('250');

  it('reads a minimum the right way round', () => {
    expect(fahrenheit('250').isAtLeast(preheat)).toBe(true);
    expect(fahrenheit('275').isAtLeast(preheat)).toBe(true);
    expect(fahrenheit('249').isAtLeast(preheat)).toBe(false);
  });

  it('reads a maximum the right way round', () => {
    const interpass = fahrenheit('500');
    expect(fahrenheit('500').isAtMost(interpass)).toBe(true);
    expect(fahrenheit('501').isAtMost(interpass)).toBe(false);
  });

  it('orders and compares', () => {
    expect(fahrenheit('100').isBelow(preheat)).toBe(true);
    expect(fahrenheit('300').isAbove(preheat)).toBe(true);
    expect(preheat.equals(fahrenheit('250'))).toBe(true);
    expect(preheat.compare(fahrenheit('250'))).toBe(0);
  });

  it('compares across the unit it was written in', () => {
    expect(celsius('121.2').isAbove(fahrenheit('250'))).toBe(true);
    expect(celsius('100').isBelow(fahrenheit('250'))).toBe(true);
  });

  it('picks the coldest and the hottest of a run of readings', () => {
    const readings = [fahrenheit('300'), fahrenheit('275'), fahrenheit('510')];
    expect(
      coldest(readings[0]!, ...readings.slice(1))
        .toFahrenheit()
        .toString(),
    ).toBe('275');
    expect(
      hottest(readings[0]!, ...readings.slice(1))
        .toFahrenheit()
        .toString(),
    ).toBe('510');
  });
});

describe('differences', () => {
  it('adds a difference in degrees rather than a temperature', () => {
    expect(fahrenheit('250').plusFahrenheitDegrees(50).toFahrenheit().toString()).toBe('300');
    expect(fahrenheit('250').plusFahrenheitDegrees('-25').toFahrenheit().toString()).toBe('225');
  });

  it('serialises as a bare Fahrenheit number', () => {
    expect(JSON.parse(JSON.stringify({ t: fahrenheit('250.0') }))).toEqual({ t: '250' });
  });
});
