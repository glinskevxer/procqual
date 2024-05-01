import { describe, expect, it } from 'vitest';

import { ValidationError, isAcceptable } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  acceptedSize,
  discontinuityAccepted,
  evaluateBends,
  mandrelDiameter,
  mandrelMultiple,
  requiredBends,
  type BendSpecimen,
  type Discontinuity,
} from '../../../src/qualification/bend.js';

const clean = (id: string, type: 'face' | 'root' | 'side'): BendSpecimen => ({
  id,
  type,
  discontinuities: [],
});

const fourSides: BendSpecimen[] = ['B1', 'B2', 'B3', 'B4'].map((id) => clean(id, 'side'));

const tear = (overrides: Partial<Discontinuity> = {}): Discontinuity => ({
  location: 'weld',
  size: inches('0.0625'),
  fusionRelated: false,
  ...overrides,
});

describe('which bends have to be cut', () => {
  it('sends a thin coupon to face and root bends', () => {
    const plan = requiredBends(inches('0.25'));
    expect(plan.allowed).toEqual(['face', 'root']);
    expect(plan.total).toBe(4);
  });

  it('lets the middle band go either way', () => {
    const plan = requiredBends(inches('0.5'));
    expect(plan.allowed).toEqual(['face', 'root', 'side']);
  });

  it('sends a thick coupon to side bends only', () => {
    const plan = requiredBends(inches('1'));
    expect(plan.allowed).toEqual(['side']);
    expect(plan.countPerType).toBe(4);
  });

  it('puts the boundaries where the table does', () => {
    expect(requiredBends(inches('0.3749')).allowed).toEqual(['face', 'root']);
    expect(requiredBends(inches('0.375')).allowed).toContain('side');
    expect(requiredBends(inches('0.7499')).allowed).toContain('face');
    expect(requiredBends(inches('0.75')).allowed).toEqual(['side']);
  });

  it('refuses a coupon with no thickness', () => {
    expect(() => requiredBends(inches('0'))).toThrow(ValidationError);
  });
});

describe('the mandrel', () => {
  it('bends the ductile families tight', () => {
    expect(mandrelMultiple('1')).toBe(4);
    expect(mandrelMultiple('8')).toBe(4);
  });

  it('opens up for the families that will not take a tight bend', () => {
    expect(mandrelMultiple('22')).toBe(6);
    expect(mandrelMultiple('10H')).toBe(6);
    expect(mandrelMultiple('6')).toBe(6);
    expect(mandrelMultiple('41')).toBe(10);
  });

  it('works out the diameter from the specimen', () => {
    expect(mandrelDiameter('1', inches('0.375')).toFraction()).toBe('1-1/2');
    expect(mandrelDiameter('22', inches('0.375')).toFraction()).toBe('2-1/4');
  });
});

describe('what opened up', () => {
  it('accepts a discontinuity at an eighth and refuses one past it', () => {
    expect(discontinuityAccepted(tear({ size: inches('0.125') }))).toBe(true);
    expect(discontinuityAccepted(tear({ size: inches('0.1251') }))).toBe(false);
  });

  it('lets a corner tear go to a quarter', () => {
    const corner = tear({ location: 'corner', size: inches('0.25') });
    expect(discontinuityAccepted(corner)).toBe(true);
    expect(acceptedSize(corner).upper?.toFraction()).toBe('1/4');
  });

  it('takes the corner allowance away once slag is behind it', () => {
    const corner = tear({ location: 'corner', size: inches('0.25'), fusionRelated: true });
    expect(discontinuityAccepted(corner)).toBe(false);
    expect(acceptedSize(corner).upper?.toFraction()).toBe('1/8');
  });

  it('holds the heat affected zone to the same eighth as the weld', () => {
    expect(
      discontinuityAccepted(tear({ location: 'heat-affected-zone', size: inches('0.2') })),
    ).toBe(false);
  });

  it('ignores anything out in the base metal', () => {
    expect(discontinuityAccepted(tear({ location: 'base-metal', size: inches('0.5') }))).toBe(true);
  });
});

describe('evaluating a set of bends', () => {
  it('passes four clean side bends on a thick coupon', () => {
    expect(evaluateBends(fourSides, inches('1'))).toEqual([]);
  });

  it('counts the specimens', () => {
    const findings = evaluateBends(fourSides.slice(0, 3), inches('1'));
    expect(findings.map((item) => item.code)).toContain('bend.too_few_specimens');
  });

  it('refuses a specimen type the thickness does not allow', () => {
    const specimens = [
      clean('B1', 'face'),
      clean('B2', 'face'),
      clean('B3', 'face'),
      clean('B4', 'face'),
    ];
    const findings = evaluateBends(specimens, inches('1'));
    expect(findings.filter((item) => item.code === 'bend.wrong_specimen_type')).toHaveLength(4);
  });

  it('reports an oversize discontinuity with its specimen', () => {
    const specimens = [
      { ...clean('B1', 'side'), discontinuities: [tear({ size: inches('0.1875') })] },
      ...fourSides.slice(1),
    ];
    const findings = evaluateBends(specimens, inches('1'));
    const failure = findings.find((item) => item.code === 'bend.open_discontinuity');
    expect(failure?.subject).toBe('B1');
    expect(failure?.message).toMatch(/3\/16 inch discontinuity in the weld/);
    expect(isAcceptable(findings)).toBe(false);
  });

  it('records an accepted corner tear without failing the set', () => {
    const specimens = [
      {
        ...clean('B1', 'side'),
        discontinuities: [tear({ location: 'corner', size: inches('0.1875') })],
      },
      ...fourSides.slice(1),
    ];
    const findings = evaluateBends(specimens, inches('1'));
    expect(findings.map((item) => item.code)).toEqual(['bend.corner_tear']);
    expect(isAcceptable(findings)).toBe(true);
  });
});
