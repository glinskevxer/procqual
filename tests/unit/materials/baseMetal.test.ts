import { describe, expect, it } from 'vitest';

import { pNumberFacts } from '../../../src/codes/pnumber.js';
import { ValidationError } from '../../../src/core/errors.js';
import {
  allBaseMetals,
  baseMetal,
  baseMetalsByCategory,
  baseMetalsByPNumber,
  curveFor,
  governingTensileKsi,
  isBaseMetal,
} from '../../../src/materials/baseMetal.js';

describe('the catalogue', () => {
  it('finds a specification however it is written', () => {
    expect(baseMetal('SA-516 Gr 70').pNumber).toBe('1');
    expect(baseMetal('sa-516 gr 70').groupNumber).toBe(2);
    expect(baseMetal('  SA-516   Gr 70 ').minimumTensileKsi).toBe(70);
  });

  it('refuses one the shop does not stock', () => {
    expect(() => baseMetal('SA-999 Gr 1')).toThrow(ValidationError);
    expect(isBaseMetal('SA-999 Gr 1')).toBe(false);
    expect(isBaseMetal('SA-105')).toBe(true);
  });

  it('names a P number that the P number tables also know', () => {
    for (const specification of allBaseMetals()) {
      const facts = pNumberFacts(specification.pNumber);
      expect(facts.groups).toContain(specification.groupNumber);
    }
  });

  it('has a unique designation for every entry', () => {
    const names = allBaseMetals().map((specification) => specification.designation);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps yield below tensile everywhere', () => {
    for (const specification of allBaseMetals()) {
      expect(specification.minimumYieldKsi).toBeLessThan(specification.minimumTensileKsi);
    }
  });
});

describe('grouping', () => {
  it('lists the carbon steels together', () => {
    const carbon = baseMetalsByPNumber('1').map((specification) => specification.designation);
    expect(carbon).toContain('SA-516 Gr 70');
    expect(carbon).toContain('SA-106 Gr B');
    expect(carbon).not.toContain('SA-240 304L');
  });

  it('lists by product category', () => {
    const forgings = baseMetalsByCategory('forging').map((item) => item.designation);
    expect(forgings).toEqual(['SA-105', 'SA-350 LF2', 'SA-182 F11', 'SA-182 F22']);
  });
});

describe('the curve', () => {
  it('comes off the heat, not off the specification alone', () => {
    expect(curveFor('SA-516 Gr 70', false)).toBe('B');
    expect(curveFor('SA-516 Gr 70', true)).toBe('D');
  });

  it('stays put where normalising changes nothing', () => {
    expect(curveFor('SA-537 Cl 1', false)).toBe('D');
    expect(curveFor('SA-537 Cl 1', true)).toBe('D');
    expect(curveFor('SA-335 P22', true)).toBe('B');
  });

  it('never moves a heat to a worse curve by normalising it', () => {
    const order = { A: 0, B: 1, C: 2, D: 3 } as const;
    for (const specification of allBaseMetals()) {
      expect(order[specification.normalisedCurve]).toBeGreaterThanOrEqual(
        order[specification.curve],
      );
    }
  });
});

describe('a joint between two metals', () => {
  it('takes the weaker minimum tensile', () => {
    expect(governingTensileKsi('SA-516 Gr 70', 'SA-106 Gr B')).toBe(60);
    expect(governingTensileKsi('SA-516 Gr 70', 'SA-105')).toBe(70);
  });

  it('is not fussy about the order of the arguments', () => {
    expect(governingTensileKsi('SA-106 Gr B', 'SA-516 Gr 70')).toBe(
      governingTensileKsi('SA-516 Gr 70', 'SA-106 Gr B'),
    );
  });
});
