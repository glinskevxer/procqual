import { describe, expect, it } from 'vitest';

import {
  aNumberFacts,
  allANumbers,
  analysisFitsGroup,
  classifyDeposit,
  describeANumber,
  isANumber,
  parseANumber,
  qualifiesANumber,
  type DepositAnalysis,
} from '../../../src/codes/anumber.js';
import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';

const analysis = (values: Record<string, string>): DepositAnalysis => {
  const out: DepositAnalysis = {};
  for (const [element, value] of Object.entries(values)) {
    out[element as keyof DepositAnalysis] = decimal(value);
  }
  return out;
};

describe('parsing', () => {
  it('reads a number or the written form', () => {
    expect(parseANumber(8)).toBe(8);
    expect(parseANumber('A-No 1')).toBe(1);
    expect(parseANumber(' 12 ')).toBe(12);
  });

  it('refuses a group that does not exist', () => {
    expect(() => parseANumber(99)).toThrow(ValidationError);
    expect(isANumber(99)).toBe(false);
  });

  it('describes a group', () => {
    expect(describeANumber(1)).toBe('A-No 1 (mild steel)');
  });

  it('lists them all once', () => {
    const codes = allANumbers().map((facts) => facts.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(12);
  });
});

describe('classifying a measured deposit', () => {
  it('puts an ordinary carbon steel deposit in group one', () => {
    expect(classifyDeposit(analysis({ C: '0.08', Mn: '1.10', Si: '0.55' }))).toBe(1);
  });

  it('puts a half moly deposit in group two', () => {
    expect(classifyDeposit(analysis({ C: '0.10', Mo: '0.50' }))).toBe(2);
  });

  it('separates the chromium moly bands by chromium content', () => {
    expect(classifyDeposit(analysis({ C: '0.09', Cr: '1.20', Mo: '0.50' }))).toBe(3);
    expect(classifyDeposit(analysis({ C: '0.09', Cr: '2.30', Mo: '1.00' }))).toBe(4);
    expect(classifyDeposit(analysis({ C: '0.09', Cr: '9.00', Mo: '1.00' }))).toBe(5);
  });

  it('separates austenitic from martensitic by nickel, not by chromium', () => {
    const austenitic = analysis({ C: '0.04', Cr: '19.50', Ni: '10.00' });
    const martensitic = analysis({ C: '0.10', Cr: '12.50', Ni: '0.30' });
    expect(classifyDeposit(austenitic)).toBe(8);
    expect(classifyDeposit(martensitic)).toBe(6);
  });

  it('takes the high alloy group when the nickel runs above fifteen', () => {
    expect(classifyDeposit(analysis({ C: '0.05', Cr: '21.00', Ni: '20.00' }))).toBe(9);
  });

  it('reads a missing element as absent', () => {
    expect(classifyDeposit(analysis({ C: '0.10' }))).toBe(1);
    expect(analysisFitsGroup(analysis({ C: '0.10' }), 1)).toBe(true);
    expect(analysisFitsGroup(analysis({ C: '0.10' }), 2)).toBe(false);
  });

  it('returns nothing for a deposit that fits no group', () => {
    expect(classifyDeposit(analysis({ C: '0.45', Cr: '0.30' }))).toBeUndefined();
    expect(classifyDeposit(analysis({ C: '0.05', Cr: '35.00', Ni: '2.00' }))).toBeUndefined();
  });

  it('holds the boundary of a band inclusive', () => {
    expect(classifyDeposit(analysis({ C: '0.15', Cr: '2.00', Mo: '0.65' }))).toBe(4);
    expect(classifyDeposit(analysis({ C: '0.15', Cr: '1.99', Mo: '0.65' }))).toBe(3);
  });
});

describe('bands', () => {
  it('records the bands that define a group', () => {
    const bands = aNumberFacts(3).bands;
    expect(bands.map((limit) => limit.element)).toEqual(['C', 'Cr', 'Mo']);
    expect(bands[1]?.range.toString()).toBe('[0.40, 2.00]');
  });
});

describe('qualification', () => {
  it('gives an A number no reach beyond itself', () => {
    expect(qualifiesANumber(8, 8)).toBe(true);
    expect(qualifiesANumber(8, 9)).toBe(false);
    expect(qualifiesANumber(1, 2)).toBe(false);
  });
});
