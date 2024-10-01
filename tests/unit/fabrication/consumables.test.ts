import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import {
  exposureLimitFor,
  exposureLimitHours,
  exposureSoFar,
  hoursBetween,
  issueState,
  MAXIMUM_REBAKES,
  rebakeAccepted,
  reviewIssue,
  reviewOven,
  type ElectrodeIssue,
} from '../../../src/fabrication/consumables.js';

const issue = (overrides: Partial<ElectrodeIssue> = {}): ElectrodeIssue => ({
  id: 'I-1',
  consumable: 'E7018-1/8',
  lot: 'LOT-88214',
  oven: 'OVEN-2',
  issuedTo: 'W-118',
  issuedAt: '2024-09-02T07:00:00.000Z',
  priorExposureHours: decimal('0'),
  rebakes: 0,
  issuedOn: date('2024-09-02'),
  ...overrides,
});

const now = '2024-09-02T09:00:00.000Z';

describe('the exposure allowance', () => {
  it('gives a seventy ksi electrode four hours', () => {
    expect(exposureLimitHours('E7018-1/8')?.toString()).toBe('4');
  });

  it('cuts it as the deposit gets stronger', () => {
    expect(exposureLimitHours('E8018-B2')?.toString()).toBe('2');
    expect(exposureLimitHours('E9018-B3')?.toString()).toBe('2');
    expect(exposureLimitFor('SFA-5.5', 'E11018-M').toString()).toBe('1');
  });

  it('gives the stainless and nickel electrodes four hours', () => {
    expect(exposureLimitHours('E308L-16')?.toString()).toBe('4');
  });

  it('has nothing to say about bare wire', () => {
    expect(exposureLimitHours('ER70S-6')).toBeUndefined();
    expect(exposureLimitHours('EM12K')).toBeUndefined();
  });
});

describe('the clock', () => {
  it('counts hours between two instants', () => {
    expect(hoursBetween('2024-09-02T07:00:00.000Z', '2024-09-02T10:30:00.000Z').toString()).toBe(
      '3.5',
    );
  });

  it('refuses a window that runs backwards or reads as nothing', () => {
    expect(() => hoursBetween('2024-09-02T10:00:00.000Z', '2024-09-02T07:00:00.000Z')).toThrow(
      ValidationError,
    );
    expect(() => hoursBetween('not a time', now)).toThrow(ValidationError);
  });

  it('adds earlier exposures on to this one', () => {
    expect(exposureSoFar(issue(), now).toString()).toBe('2');
    expect(exposureSoFar(issue({ priorExposureHours: decimal('1.5') }), now).toString()).toBe(
      '3.5',
    );
  });

  it('stops counting once the tin goes back', () => {
    const returned = issue({ returnedAt: '2024-09-02T08:00:00.000Z' });
    expect(exposureSoFar(returned, now).toString()).toBe('1');
  });
});

describe('the state of a tin', () => {
  it('is fine inside the allowance', () => {
    expect(issueState(issue(), now)).toBe('within-limit');
    expect(reviewIssue(issue(), now)).toEqual([]);
  });

  it('is back in the oven once it is returned', () => {
    expect(issueState(issue({ returnedAt: '2024-09-02T08:00:00.000Z' }), now)).toBe('in-oven');
  });

  it('goes over the limit and asks for a rebake', () => {
    const over = issue({ priorExposureHours: decimal('3') });
    expect(issueState(over, now)).toBe('over-limit');
    const findings = reviewIssue(over, now);
    expect(findings[0]?.code).toBe('consumable.over_exposure');
    expect(findings[0]?.severity).toBe('deficiency');
  });

  it('is scrap once it goes over after its one rebake', () => {
    const scrap = issue({ priorExposureHours: decimal('3'), rebakes: MAXIMUM_REBAKES });
    expect(issueState(scrap, now)).toBe('scrap');
    expect(reviewIssue(scrap, now)[0]?.severity).toBe('blocking');
  });

  it('catches a tin that has been rebaked more often than it should', () => {
    const findings = reviewIssue(issue({ rebakes: 2 }), now);
    expect(findings.map((item) => item.code)).toContain('consumable.rebaked_twice');
  });

  it('warns as the allowance runs out', () => {
    const nearly = issue({ priorExposureHours: decimal('1.5') });
    const findings = reviewIssue(nearly, now);
    expect(findings[0]?.code).toBe('consumable.near_limit');
    expect(findings[0]?.severity).toBe('advisory');
  });

  it('says nothing about a consumable with no oven clock', () => {
    expect(issueState(issue({ consumable: 'ER70S-6' }), now)).toBe('not-controlled');
    expect(
      reviewIssue(issue({ consumable: 'ER70S-6', priorExposureHours: decimal('40') }), now),
    ).toEqual([]);
  });
});

describe('the oven itself', () => {
  it('accepts readings inside the holding band', () => {
    expect(
      reviewOven([
        { oven: 'OVEN-2', at: '2024-09-02T06:00:00.000Z', temperature: fahrenheit('280') },
        { oven: 'OVEN-2', at: '2024-09-02T14:00:00.000Z', temperature: fahrenheit('350') },
      ]),
    ).toEqual([]);
  });

  it('names a reading outside it', () => {
    const findings = reviewOven([
      { oven: 'OVEN-2', at: '2024-09-02T06:00:00.000Z', temperature: fahrenheit('180') },
    ]);
    expect(findings[0]?.code).toBe('oven.out_of_range');
    expect(findings[0]?.message).toMatch(/outside \[250 F, 350 F\]/);
  });

  it('records an oven with no log at all as a deficiency', () => {
    expect(reviewOven([])[0]?.code).toBe('oven.no_readings');
  });

  it('holds a rebake to its own much hotter band', () => {
    expect(rebakeAccepted(fahrenheit('750'))).toBe(true);
    expect(rebakeAccepted(fahrenheit('300'))).toBe(false);
  });
});
