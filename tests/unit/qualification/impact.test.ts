import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { isAcceptable, ValidationError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  averageEnergy,
  evaluateImpacts,
  gradeSet,
  requiredEnergy,
  widthFactor,
  type ImpactRequirement,
  type ImpactSet,
  type ImpactSpecimen,
} from '../../../src/qualification/impact.js';

const requirement: ImpactRequirement = {
  specifiedMinimumTensileKsi: 70,
  lateralExpansionRequired: false,
};

const specimen = (id: string, energy: string, expansion = '0.030'): ImpactSpecimen => ({
  id,
  energyFootPounds: decimal(energy),
  lateralExpansion: inches(expansion),
});

const set = (energies: readonly string[], overrides: Partial<ImpactSet> = {}): ImpactSet => ({
  location: 'weld',
  testTemperature: fahrenheit('-20'),
  width: '10',
  specimens: energies.map((energy, index) => specimen(`C${index + 1}`, energy)),
  ...overrides,
});

describe('the requirement', () => {
  it('steps with the strength of the base metal', () => {
    expect(
      requiredEnergy({ ...requirement, specifiedMinimumTensileKsi: 60 }, '10').average.toString(),
    ).toBe('13');
    expect(
      requiredEnergy({ ...requirement, specifiedMinimumTensileKsi: 70 }, '10').average.toString(),
    ).toBe('15');
    expect(
      requiredEnergy({ ...requirement, specifiedMinimumTensileKsi: 80 }, '10').average.toString(),
    ).toBe('20');
    expect(
      requiredEnergy({ ...requirement, specifiedMinimumTensileKsi: 110 }, '10').average.toString(),
    ).toBe('25');
  });

  it('holds the single specimen figure below the average figure', () => {
    const required = requiredEnergy(requirement, '10');
    expect(required.individual.lessThan(required.average)).toBe(true);
    expect(required.individual.toString()).toBe('12');
  });

  it('comes down in proportion for a subsize bar', () => {
    expect(widthFactor('7.5').toString()).toBe('0.8333');
    expect(requiredEnergy(requirement, '7.5').average.toString()).toBe('12.5');
    expect(requiredEnergy(requirement, '5').average.toString()).toBe('10');
    expect(requiredEnergy(requirement, '2.5').average.toString()).toBe('5');
  });

  it('refuses a width it does not know', () => {
    expect(() => widthFactor('9' as never)).toThrow(ValidationError);
  });
});

describe('grading one set', () => {
  it('accepts a comfortable set', () => {
    const verdict = gradeSet(set(['20', '22', '18']), requirement);
    expect(verdict.averageFootPounds.toString()).toBe('20');
    expect(verdict.accepted).toBe(true);
    expect(verdict.belowIndividual).toEqual([]);
  });

  it('allows exactly one specimen below the single specimen figure', () => {
    const verdict = gradeSet(set(['22', '22', '11']), requirement);
    expect(verdict.belowIndividual).toEqual(['C3']);
    expect(verdict.accepted).toBe(true);
  });

  it('fails a set with two specimens below it', () => {
    const verdict = gradeSet(set(['30', '11', '11']), requirement);
    expect(verdict.averageFootPounds.greaterThanOrEqual(verdict.requiredAverage)).toBe(true);
    expect(verdict.belowIndividual).toHaveLength(2);
    expect(verdict.accepted).toBe(false);
  });

  it('fails a set on its spread even when the average is fine', () => {
    const verdict = gradeSet(set(['40', '40', '5']), requirement);
    expect(verdict.averageFootPounds.toString()).toBe('28.33');
    expect(verdict.belowFloor).toEqual(['C3']);
    expect(verdict.accepted).toBe(false);
  });

  it('fails a set whose average misses even with every specimen above the floor', () => {
    const verdict = gradeSet(set(['13', '13', '13']), requirement);
    expect(verdict.belowFloor).toEqual([]);
    expect(verdict.accepted).toBe(false);
  });

  it('works out the average', () => {
    expect(averageEnergy(set(['10', '11', '12'])).toString()).toBe('11');
    expect(() => averageEnergy(set([]))).toThrow(ValidationError);
  });
});

describe('evaluating the sets on a coupon', () => {
  it('says nothing when every set passes', () => {
    const findings = evaluateImpacts(
      [set(['20', '22', '18']), set(['20', '22', '18'], { location: 'heat-affected-zone' })],
      requirement,
    );
    expect(findings).toEqual([]);
  });

  it('records a deficiency when toughness is wanted and nothing was tested', () => {
    const findings = evaluateImpacts([], requirement);
    expect(findings.map((item) => item.code)).toEqual(['impact.no_sets']);
    expect(findings[0]?.severity).toBe('deficiency');
  });

  it('insists on three specimens to a set', () => {
    const findings = evaluateImpacts([set(['20', '22'])], requirement);
    expect(findings.map((item) => item.code)).toEqual(['impact.wrong_specimen_count']);
  });

  it('names the set that failed on its average', () => {
    const findings = evaluateImpacts([set(['10', '10', '10'])], requirement);
    const failure = findings.find((item) => item.code === 'impact.average_below_minimum');
    expect(failure?.subject).toBe('weld');
    expect(isAcceptable(findings)).toBe(false);
  });

  it('records the one allowed low specimen without failing the coupon', () => {
    const findings = evaluateImpacts([set(['22', '22', '11'])], requirement);
    expect(findings.map((item) => item.code)).toEqual(['impact.one_low_specimen']);
    expect(isAcceptable(findings)).toBe(true);
  });

  it('grades lateral expansion only when it was asked for', () => {
    const thin = set(['20', '22', '18']);
    const flattened: ImpactSet = {
      ...thin,
      specimens: [specimen('C1', '20', '0.010'), specimen('C2', '22'), specimen('C3', '18')],
    };
    expect(evaluateImpacts([flattened], requirement)).toEqual([]);
    const graded = evaluateImpacts([flattened], {
      ...requirement,
      lateralExpansionRequired: true,
    });
    expect(graded.map((item) => item.code)).toEqual(['impact.lateral_expansion']);
    expect(graded[0]?.subject).toBe('C1');
  });
});
