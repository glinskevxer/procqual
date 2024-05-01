import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  evaluateSpecimen,
  evaluateTensile,
  lowestStrength,
  relaxationApplies,
  specimenArea,
  specimenStrengthKsi,
  type TensileRequirement,
  type TensileSpecimen,
} from '../../../src/qualification/tensile.js';

const requirement: TensileRequirement = { specifiedMinimumKsi: decimal('70') };

const specimen = (overrides: Partial<TensileSpecimen> = {}): TensileSpecimen => ({
  id: 'T1',
  width: inches('0.75'),
  thickness: inches('0.375'),
  ultimateLoadPounds: decimal('20000'),
  failureLocation: 'weld',
  ...overrides,
});

describe('the arithmetic', () => {
  it('takes the area from the width and the thickness', () => {
    expect(specimenArea(specimen()).toString()).toBe('0.28125');
  });

  it('turns load into ksi', () => {
    expect(specimenStrengthKsi(specimen()).toString()).toBe('71.1111');
  });

  it('refuses a specimen with no cross section', () => {
    expect(() => specimenArea(specimen({ width: inches('0') }))).toThrow(ValidationError);
  });
});

describe('the relaxation', () => {
  it('is open only to a break out in the base metal', () => {
    expect(relaxationApplies(specimen({ failureLocation: 'base-metal' }))).toBe(true);
    expect(relaxationApplies(specimen({ failureLocation: 'weld' }))).toBe(false);
    expect(relaxationApplies(specimen({ failureLocation: 'fusion-line' }))).toBe(false);
    expect(relaxationApplies(specimen({ failureLocation: 'heat-affected-zone' }))).toBe(false);
  });

  it('drops the requirement to ninety five percent when it applies', () => {
    const result = evaluateSpecimen(specimen({ failureLocation: 'base-metal' }), requirement);
    expect(result.requiredKsi.toString()).toBe('66.5');
    expect(result.relaxed).toBe(true);
  });

  it('holds the full requirement for a break in the weld', () => {
    const result = evaluateSpecimen(specimen(), requirement);
    expect(result.requiredKsi.toString()).toBe('70');
    expect(result.relaxed).toBe(false);
  });

  it('saves a specimen that would otherwise fail', () => {
    const low = specimen({ ultimateLoadPounds: decimal('19000') });
    expect(evaluateSpecimen(low, requirement).accepted).toBe(false);
    expect(evaluateSpecimen({ ...low, failureLocation: 'base-metal' }, requirement).accepted).toBe(
      true,
    );
  });

  it('does not save a specimen that broke in the weld', () => {
    const low = specimen({ ultimateLoadPounds: decimal('19000'), failureLocation: 'fusion-line' });
    expect(evaluateSpecimen(low, requirement).accepted).toBe(false);
  });
});

describe('evaluating a set', () => {
  it('accepts two good specimens with nothing to report', () => {
    const { results, findings } = evaluateTensile(
      [specimen(), specimen({ id: 'T2' })],
      requirement,
    );
    expect(results.every((result) => result.accepted)).toBe(true);
    expect(findings).toEqual([]);
  });

  it('wants at least two specimens', () => {
    const { findings } = evaluateTensile([specimen()], requirement);
    expect(findings.map((item) => item.code)).toContain('tensile.too_few_specimens');
    expect(findings[0]?.severity).toBe('blocking');
  });

  it('names each specimen that fell short', () => {
    const { findings } = evaluateTensile(
      [specimen(), specimen({ id: 'T2', ultimateLoadPounds: decimal('18000') })],
      requirement,
    );
    const failure = findings.find((item) => item.code === 'tensile.below_minimum');
    expect(failure?.subject).toBe('T2');
    expect(failure?.message).toMatch(/against 70 ksi required/);
  });

  it('notes a relaxation on the record rather than hiding it', () => {
    const { findings } = evaluateTensile(
      [specimen(), specimen({ id: 'T2', failureLocation: 'base-metal' })],
      requirement,
    );
    const note = findings.find((item) => item.code === 'tensile.relaxed');
    expect(note?.severity).toBe('advisory');
    expect(note?.subject).toBe('T2');
  });

  it('reports the weakest specimen of the set', () => {
    const { results } = evaluateTensile(
      [specimen(), specimen({ id: 'T2', ultimateLoadPounds: decimal('21000') })],
      requirement,
    );
    expect(lowestStrength(results)?.toString()).toBe('71.1111');
    expect(lowestStrength([])).toBeUndefined();
  });
});
