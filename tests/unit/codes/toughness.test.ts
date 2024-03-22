import { describe, expect, it } from 'vitest';

import {
  assessToughness,
  exemptionTemperature,
  impactTestingRequired,
  isExemptionCurve,
  parseExemptionCurve,
  type ToughnessQuestion,
} from '../../../src/codes/toughness.js';
import { ValidationError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';

const question = (overrides: Partial<ToughnessQuestion> = {}): ToughnessQuestion => ({
  curve: 'B',
  governingThickness: inches('1'),
  minimumDesignMetalTemperature: fahrenheit('20'),
  ...overrides,
});

describe('the curves', () => {
  it('parses a curve letter', () => {
    expect(parseExemptionCurve(' b ')).toBe('B');
    expect(isExemptionCurve('E')).toBe(false);
    expect(() => parseExemptionCurve('E')).toThrow(ValidationError);
  });

  it('reads a listed point straight off', () => {
    expect(exemptionTemperature('B', inches('1')).toFahrenheit().toString()).toBe('38');
    expect(exemptionTemperature('C', inches('2')).toFahrenheit().toString()).toBe('42');
  });

  it('runs a straight line between two listed points', () => {
    expect(exemptionTemperature('B', inches('1.25')).toFahrenheit().toString()).toBe('48');
    expect(exemptionTemperature('B', inches('0.875')).toFahrenheit().toString()).toBe('31');
  });

  it('goes flat below a quarter inch', () => {
    expect(exemptionTemperature('D', inches('0.125')).toFahrenheit().toString()).toBe('-55');
    expect(exemptionTemperature('B', inches('0.1')).toFahrenheit().toString()).toBe('-55');
  });

  it('keeps curve A on its own figure at the thin end', () => {
    expect(exemptionTemperature('A', inches('0.125')).toFahrenheit().toString()).toBe('18');
  });

  it('goes flat above four inches rather than guessing past the figure', () => {
    expect(exemptionTemperature('A', inches('6')).toFahrenheit().toString()).toBe('120');
    expect(exemptionTemperature('A', inches('4')).toFahrenheit().toString()).toBe('120');
  });

  it('gets colder as the curve letter goes up', () => {
    const at = (curve: 'A' | 'B' | 'C' | 'D') =>
      exemptionTemperature(curve, inches('1')).toFahrenheit().toNumber();
    expect(at('A')).toBeGreaterThan(at('B'));
    expect(at('B')).toBeGreaterThan(at('C'));
    expect(at('C')).toBeGreaterThan(at('D'));
  });

  it('gets warmer as the section gets thicker', () => {
    const at = (thickness: string) =>
      exemptionTemperature('B', inches(thickness)).toFahrenheit().toNumber();
    expect(at('0.5')).toBeLessThan(at('1'));
    expect(at('1')).toBeLessThan(at('2'));
  });

  it('refuses a section with no thickness', () => {
    expect(() => exemptionTemperature('B', inches('0'))).toThrow(ValidationError);
  });
});

describe('the assessment', () => {
  it('exempts a vessel designed warmer than the curve', () => {
    const assessment = assessToughness(question({ minimumDesignMetalTemperature: fahrenheit('50') }));
    expect(assessment.required).toBe(false);
    expect(assessment.reason).toMatch(/at or above/);
  });

  it('calls for testing when the vessel is designed colder', () => {
    const assessment = assessToughness(question({ minimumDesignMetalTemperature: fahrenheit('0') }));
    expect(assessment.required).toBe(true);
    expect(assessment.reason).toMatch(/is below the curve B exemption/);
  });

  it('treats the exemption temperature itself as exempt', () => {
    expect(
      impactTestingRequired(question({ minimumDesignMetalTemperature: fahrenheit('38') })),
    ).toBe(false);
    expect(
      impactTestingRequired(question({ minimumDesignMetalTemperature: fahrenheit('37') })),
    ).toBe(true);
  });

  it('gives thirty degrees back for heat treatment the code did not ask for', () => {
    const plain = assessToughness(question({ minimumDesignMetalTemperature: fahrenheit('10') }));
    const treated = assessToughness(
      question({ minimumDesignMetalTemperature: fahrenheit('10'), heatTreatedWhenNotRequired: true }),
    );
    expect(plain.required).toBe(true);
    expect(treated.required).toBe(false);
    expect(treated.allowanceDegrees).toBe(30);
    expect(treated.exemptionTemperature.toFahrenheit().toString()).toBe('8');
  });

  it('reports no allowance when none was earned', () => {
    expect(assessToughness(question()).allowanceDegrees).toBe(0);
  });

  it('gets harder to exempt as the section thickens', () => {
    const thin = question({ governingThickness: inches('0.5') });
    const thick = question({ governingThickness: inches('2') });
    expect(impactTestingRequired(thin)).toBe(false);
    expect(impactTestingRequired(thick)).toBe(true);
  });
});
