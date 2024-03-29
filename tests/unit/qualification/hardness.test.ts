import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import {
  evaluateHardness,
  hardnessRequirement,
  highestReading,
  zonesCovered,
  type HardnessQuestion,
  type HardnessSurvey,
} from '../../../src/qualification/hardness.js';

const question = (overrides: Partial<HardnessQuestion> = {}): HardnessQuestion => ({
  pNumber: '1',
  sourService: false,
  customerRequested: false,
  ...overrides,
});

const survey = (overrides: Partial<HardnessSurvey> = {}): HardnessSurvey => ({
  id: 'HS-1',
  scale: 'HV10',
  readings: [
    { zone: 'parent', value: decimal('180') },
    { zone: 'heat-affected-zone', value: decimal('220') },
    { zone: 'weld', value: decimal('210') },
  ],
  ...overrides,
});

describe('when a survey is called for', () => {
  it('is not for ordinary carbon steel on ordinary service', () => {
    const requirement = hardnessRequirement(question());
    expect(requirement.required).toBe(false);
    expect(requirement.reason).toMatch(/no survey called for/);
  });

  it('is for every chromium molybdenum family', () => {
    expect(hardnessRequirement(question({ pNumber: '4' })).required).toBe(true);
    expect(hardnessRequirement(question({ pNumber: '5B' })).required).toBe(true);
    expect(hardnessRequirement(question({ pNumber: '15E' })).required).toBe(true);
    expect(hardnessRequirement(question({ pNumber: '4' })).reason).toMatch(/chromium molybdenum/);
  });

  it('is for wet sour service whatever the family', () => {
    const requirement = hardnessRequirement(question({ sourService: true }));
    expect(requirement.required).toBe(true);
    expect(requirement.limit.toString()).toBe('248');
    expect(requirement.reason).toBe('wet sour service');
  });

  it('lets sour service beat the family limit', () => {
    const sour = hardnessRequirement(question({ pNumber: '5A', sourService: true }));
    const dry = hardnessRequirement(question({ pNumber: '5A' }));
    expect(dry.limit.toString()).toBe('241');
    expect(sour.limit.toString()).toBe('248');
  });

  it('is for anything the purchase specification asks about', () => {
    const requirement = hardnessRequirement(question({ customerRequested: true }));
    expect(requirement.required).toBe(true);
    expect(requirement.reason).toMatch(/purchase specification/);
  });
});

describe('reading a survey', () => {
  it('lists the zones it crossed in a fixed order', () => {
    expect(zonesCovered(survey())).toEqual(['parent', 'heat-affected-zone', 'weld']);
    expect(
      zonesCovered(survey({ readings: [{ zone: 'weld', value: decimal('200') }] })),
    ).toEqual(['weld']);
  });

  it('finds the highest reading', () => {
    expect(highestReading(survey()).toString()).toBe('220');
    expect(() => highestReading(survey({ readings: [] }))).toThrow(ValidationError);
  });
});

describe('evaluating a survey', () => {
  const chromeMoly = hardnessRequirement(question({ pNumber: '4' }));

  it('says nothing when no survey was called for', () => {
    expect(evaluateHardness([], hardnessRequirement(question()))).toEqual([]);
  });

  it('records a deficiency when one was called for and none was taken', () => {
    const findings = evaluateHardness([], chromeMoly);
    expect(findings.map((item) => item.code)).toEqual(['hardness.no_survey']);
    expect(findings[0]?.message).toMatch(/chromium molybdenum/);
  });

  it('accepts a clean traverse', () => {
    expect(evaluateHardness([survey()], chromeMoly)).toEqual([]);
  });

  it('refuses a survey that never crossed the heat affected zone', () => {
    const missed = survey({
      readings: [
        { zone: 'parent', value: decimal('180') },
        { zone: 'weld', value: decimal('210') },
      ],
    });
    const findings = evaluateHardness([missed], chromeMoly);
    expect(findings.map((item) => item.code)).toEqual(['hardness.zone_missed']);
  });

  it('names every reading over the limit', () => {
    const hard = survey({
      readings: [
        { zone: 'parent', value: decimal('180') },
        { zone: 'heat-affected-zone', value: decimal('265') },
        { zone: 'weld', value: decimal('249') },
      ],
    });
    const findings = evaluateHardness([hard], chromeMoly);
    expect(findings).toHaveLength(2);
    expect(findings[0]?.message).toMatch(/265 HV10 in the heat-affected-zone/);
  });

  it('will not compare a survey taken on the wrong scale', () => {
    const findings = evaluateHardness([survey({ scale: 'HRC' })], chromeMoly);
    expect(findings.map((item) => item.code)).toEqual(['hardness.wrong_scale']);
  });
});
