import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  assertMethodApplicable,
  describeDemand,
  fullRadiographyThreshold,
  methodsRequired,
  requiredExaminations,
  requiresFullRadiography,
  surfaceMethodFor,
  volumetricExtent,
  type ExaminationQuestion,
} from '../../../src/nde/requirement.js';
import { sampleJoint } from '../../support/joints.js';

const question = (overrides: Partial<ExaminationQuestion> = {}): ExaminationQuestion => ({
  joint: sampleJoint(),
  lethalService: false,
  repair: false,
  ...overrides,
});

describe('the surface method', () => {
  it('uses magnetic particle on the magnetic families', () => {
    expect(surfaceMethodFor('1')).toBe('MT');
    expect(surfaceMethodFor('4')).toBe('MT');
    expect(surfaceMethodFor('15E')).toBe('MT');
  });

  it('uses dye penetrant on the ones a yoke will not touch', () => {
    expect(surfaceMethodFor('8')).toBe('PT');
    expect(surfaceMethodFor('10H')).toBe('PT');
    expect(surfaceMethodFor('22')).toBe('PT');
    expect(surfaceMethodFor('43')).toBe('PT');
  });

  it('refuses magnetic particle on a material it cannot work on', () => {
    expect(() => assertMethodApplicable('MT', '8')).toThrow(ValidationError);
    expect(() => assertMethodApplicable('MT', '8')).toThrow(/not magnetic/);
    expect(() => assertMethodApplicable('MT', '1')).not.toThrow();
    expect(() => assertMethodApplicable('PT', '8')).not.toThrow();
  });
});

describe('when full radiography is forced', () => {
  it('lets a thin carbon steel joint keep what was planned', () => {
    expect(requiresFullRadiography(question())).toBe(false);
    expect(volumetricExtent(question({ joint: sampleJoint({ radiography: 'spot' }) }))).toBe(
      'spot',
    );
  });

  it('forces it above the family limit', () => {
    expect(fullRadiographyThreshold('1')?.toFraction()).toBe('1-1/2');
    const thick = question({
      joint: sampleJoint({ thickness: inches('2'), radiography: 'spot' }),
    });
    expect(requiresFullRadiography(thick)).toBe(true);
    expect(volumetricExtent(thick)).toBe('full');
  });

  it('sets that limit much lower on the low alloys', () => {
    expect(fullRadiographyThreshold('4')?.toFraction()).toBe('5/8');
    const chrome = question({
      joint: sampleJoint({
        baseMetalLeft: 'SA-335 P22',
        baseMetalRight: 'SA-335 P22',
        thickness: inches('3/4'),
        radiography: 'none',
      }),
    });
    expect(requiresFullRadiography(chrome)).toBe(true);
  });

  it('forces it for lethal service at any thickness', () => {
    const lethal = question({
      lethalService: true,
      joint: sampleJoint({ radiography: 'none', thickness: inches('1/4') }),
    });
    expect(volumetricExtent(lethal)).toBe('full');
  });

  it('has no threshold at all for austenitic stainless', () => {
    expect(fullRadiographyThreshold('8')).toBeUndefined();
    const stainless = question({
      joint: sampleJoint({
        baseMetalLeft: 'SA-240 304L',
        baseMetalRight: 'SA-240 304L',
        thickness: inches('3'),
        radiography: 'spot',
      }),
    });
    expect(requiresFullRadiography(stainless)).toBe(false);
  });
});

describe('the demands on a joint', () => {
  it('always looks at the weld', () => {
    expect(requiredExaminations(question())[0]?.method).toBe('VT');
  });

  it('asks for radiography at the extent the joint carries', () => {
    const demands = requiredExaminations(question());
    const volumetric = demands.find((demand) => demand.method === 'RT');
    expect(volumetric?.extent).toBe('full');
    expect(volumetric?.reason).toBe('full radiography was specified');
  });

  it('says why when the code forced it', () => {
    const demands = requiredExaminations(
      question({ joint: sampleJoint({ thickness: inches('2'), radiography: 'spot' }) }),
    );
    expect(demands.find((demand) => demand.method === 'RT')?.reason).toMatch(
      /over the 1-1\/2 inch limit/,
    );
  });

  it('leaves radiography off entirely when none was specified and none is forced', () => {
    const demands = requiredExaminations(
      question({ joint: sampleJoint({ type: 3, radiography: 'none' }) }),
    );
    expect(demands.map((demand) => demand.method)).not.toContain('RT');
  });

  it('swaps in ultrasonic where the geometry defeats a film', () => {
    const demands = requiredExaminations(question({ ultrasonicInPlaceOfRadiography: true }));
    expect(demands.map((demand) => demand.method)).toContain('UT');
    expect(demands.map((demand) => demand.method)).not.toContain('RT');
  });

  it('adds a surface examination to the attachment categories', () => {
    expect(methodsRequired(question({ joint: sampleJoint({ category: 'D', type: 7 }) }))).toContain(
      'MT',
    );
    expect(methodsRequired(question({ joint: sampleJoint({ category: 'C', type: 1 }) }))).toContain(
      'MT',
    );
  });

  it('picks the right surface method for a stainless nozzle', () => {
    const stainless = question({
      joint: sampleJoint({
        category: 'D',
        type: 7,
        baseMetalLeft: 'SA-240 304L',
        baseMetalRight: 'SA-240 304L',
        radiography: 'none',
      }),
    });
    expect(methodsRequired(stainless)).toContain('PT');
    expect(methodsRequired(stainless)).not.toContain('MT');
  });

  it('adds a surface examination to the families that get a soak', () => {
    const chrome = question({
      joint: sampleJoint({ baseMetalLeft: 'SA-335 P22', baseMetalRight: 'SA-335 P22' }),
    });
    expect(requiredExaminations(chrome).find((demand) => demand.clause === 'UCS-56')).toBeDefined();
  });

  it('leaves a plain carbon steel seam without one', () => {
    expect(methodsRequired(question())).toEqual(['VT', 'RT']);
  });

  it('re-examines a repair by the method the original weld had', () => {
    const repaired = requiredExaminations(question({ repair: true }));
    expect(repaired.some((demand) => demand.clause === 'UW-38')).toBe(true);
  });

  it('re-examines a repair on the surface where the weld had no volumetric', () => {
    const repaired = requiredExaminations(
      question({ repair: true, joint: sampleJoint({ type: 3, radiography: 'none' }) }),
    );
    expect(repaired.find((demand) => demand.clause === 'UW-38')?.method).toBe('MT');
  });
});

describe('describing a demand', () => {
  it('reads back with its clause', () => {
    expect(describeDemand(requiredExaminations(question())[0]!)).toBe(
      'VT full [UW-35] every weld is looked at',
    );
  });
});
