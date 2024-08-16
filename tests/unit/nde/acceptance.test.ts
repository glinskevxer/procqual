import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  elongatedLimit,
  judge,
  judgeExamination,
  judgeRadiographic,
  judgeSurface,
  rejectedIndications,
} from '../../../src/nde/acceptance.js';
import type { Indication } from '../../../src/nde/examination.js';
import { sampleExamination } from '../../support/nde.js';

const indication = (overrides: Partial<Indication> = {}): Indication => ({
  type: 'slag',
  size: inches('1/8'),
  fromDatum: inches('12'),
  ...overrides,
});

describe('the elongated limit', () => {
  it('is a flat quarter inch on thin sections', () => {
    expect(elongatedLimit(inches('1/4')).toFraction()).toBe('1/4');
    expect(elongatedLimit(inches('0.75')).toFraction()).toBe('1/4');
  });

  it('becomes a third of the thickness through the middle band', () => {
    expect(elongatedLimit(inches('1.5')).toFraction()).toBe('1/2');
    expect(elongatedLimit(inches('2.25')).toFraction()).toBe('3/4');
  });

  it('goes flat again above two and a quarter', () => {
    expect(elongatedLimit(inches('4')).toFraction()).toBe('3/4');
  });

  it('refuses a section with no thickness', () => {
    expect(() => elongatedLimit(inches('0'))).toThrow(ValidationError);
  });
});

describe('radiographic acceptance', () => {
  it('rejects a crack whatever its size', () => {
    const verdict = judgeRadiographic(
      indication({ type: 'crack', size: inches('0.001') }),
      inches('2'),
    );
    expect(verdict.verdict).toBe('reject');
    expect(verdict.limit).toBeUndefined();
    expect(verdict.reason).toMatch(/at any size/);
  });

  it('rejects lack of fusion and lack of penetration the same way', () => {
    expect(judgeRadiographic(indication({ type: 'incomplete-fusion' }), inches('2')).verdict).toBe(
      'reject',
    );
    expect(
      judgeRadiographic(indication({ type: 'incomplete-penetration' }), inches('2')).verdict,
    ).toBe('reject');
  });

  it('measures slag against the limit for the thickness', () => {
    expect(judgeRadiographic(indication({ size: inches('1/4') }), inches('1/2')).verdict).toBe(
      'accept',
    );
    expect(judgeRadiographic(indication({ size: inches('5/16') }), inches('1/2')).verdict).toBe(
      'reject',
    );
    expect(judgeRadiographic(indication({ size: inches('5/16') }), inches('2')).verdict).toBe(
      'accept',
    );
  });

  it('holds rounded indications to three sixteenths', () => {
    expect(
      judgeRadiographic(indication({ type: 'porosity', size: inches('3/16') }), inches('1/2'))
        .verdict,
    ).toBe('accept');
    expect(
      judgeRadiographic(indication({ type: 'porosity', size: inches('1/4') }), inches('1/2'))
        .verdict,
    ).toBe('reject');
  });

  it('holds undercut to a thirty second', () => {
    expect(
      judgeRadiographic(indication({ type: 'undercut', size: inches('1/32') }), inches('1/2'))
        .verdict,
    ).toBe('accept');
    expect(
      judgeRadiographic(indication({ type: 'undercut', size: inches('1/16') }), inches('1/2'))
        .verdict,
    ).toBe('reject');
  });

  it('lets a geometric indication through', () => {
    expect(
      judgeRadiographic(indication({ type: 'geometric', size: inches('2') }), inches('1/2'))
        .verdict,
    ).toBe('accept');
  });
});

describe('surface acceptance', () => {
  it('rejects any linear indication however short', () => {
    expect(judgeSurface(indication({ size: inches('1/32') })).verdict).toBe('reject');
    expect(judgeSurface(indication({ size: inches('1/32') })).reason).toMatch(/any linear/);
  });

  it('still rejects a crack outright', () => {
    expect(judgeSurface(indication({ type: 'crack' })).verdict).toBe('reject');
  });

  it('holds rounded indications to the same three sixteenths', () => {
    expect(judgeSurface(indication({ type: 'porosity', size: inches('1/8') })).verdict).toBe(
      'accept',
    );
    expect(judgeSurface(indication({ type: 'porosity', size: inches('1/4') })).verdict).toBe(
      'reject',
    );
  });

  it('lets a geometric indication through', () => {
    expect(judgeSurface(indication({ type: 'geometric' })).verdict).toBe('accept');
  });
});

describe('picking the right rules for the method', () => {
  it('reads a magnetic particle report by the surface rules', () => {
    const examination = sampleExamination({ method: 'MT' });
    expect(judge(examination, indication({ size: inches('1/16') }), inches('2')).verdict).toBe(
      'reject',
    );
  });

  it('reads a radiograph by the length rules', () => {
    const examination = sampleExamination({ method: 'RT' });
    expect(judge(examination, indication({ size: inches('1/16') }), inches('2')).verdict).toBe(
      'accept',
    );
  });

  it('reads an ultrasonic report by the length rules as well', () => {
    const examination = sampleExamination({ method: 'UT' });
    expect(judge(examination, indication({ size: inches('1/16') }), inches('2')).verdict).toBe(
      'accept',
    );
  });
});

describe('judging a whole examination', () => {
  it('accepts one with nothing on it', () => {
    const result = judgeExamination(sampleExamination(), inches('1/2'));
    expect(result.accepted).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('accepts one whose indications are all inside the limits', () => {
    const examination = sampleExamination({
      indications: [indication({ size: inches('1/8') }), indication({ type: 'porosity' })],
    });
    expect(judgeExamination(examination, inches('1/2')).accepted).toBe(true);
  });

  it('names every rejected indication with where it was', () => {
    const examination = sampleExamination({
      indications: [
        indication({ size: inches('1/8') }),
        indication({ type: 'crack', size: inches('1/16'), fromDatum: inches('40') }),
      ],
    });
    const result = judgeExamination(examination, inches('1/2'));
    expect(result.accepted).toBe(false);
    expect(result.findings[0]?.message).toMatch(/crack of 1\/16 at 40 from the datum/);
    expect(rejectedIndications(result)).toHaveLength(1);
  });
});
