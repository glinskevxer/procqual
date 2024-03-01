import { describe, expect, it } from 'vitest';

import {
  allFNumbers,
  describeFNumber,
  fNumberFacts,
  fNumbersQualifiedBy,
  isFNumber,
  isUsedWith,
  needsAtmosphericControl,
  parseFNumber,
  qualifiesFNumber,
} from '../../../src/codes/fnumber.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('parsing', () => {
  it('reads a bare number or the written form', () => {
    expect(parseFNumber(4)).toBe(4);
    expect(parseFNumber('F-No 6')).toBe(6);
    expect(parseFNumber(' 43 ')).toBe(43);
  });

  it('refuses an F number that is not carried', () => {
    expect(() => parseFNumber(99)).toThrow(ValidationError);
    expect(() => parseFNumber('F-No 7')).toThrow(/not an F number/);
    expect(isFNumber(7)).toBe(false);
  });

  it('lists them all with unique codes', () => {
    const codes = allFNumbers().map((facts) => facts.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('describes one', () => {
    expect(describeFNumber(4)).toBe('F-No 4 (low hydrogen electrodes)');
  });
});

describe('process fit', () => {
  it('keeps covered electrodes on shielded metal arc', () => {
    expect(isUsedWith(4, 'SMAW')).toBe(true);
    expect(isUsedWith(4, 'GTAW')).toBe(false);
  });

  it('spreads bare wire across the wire processes', () => {
    expect(isUsedWith(6, 'GTAW')).toBe(true);
    expect(isUsedWith(6, 'SAW')).toBe(true);
    expect(isUsedWith(6, 'SMAW')).toBe(false);
  });
});

describe('the covered electrode ladder', () => {
  it('reaches down from four to one under shielded metal arc', () => {
    expect(fNumbersQualifiedBy(4, 'SMAW')).toEqual([1, 2, 3, 4]);
    expect(fNumbersQualifiedBy(3, 'SMAW')).toEqual([1, 2, 3]);
    expect(fNumbersQualifiedBy(1, 'SMAW')).toEqual([1]);
  });

  it('does not reach upward', () => {
    expect(qualifiesFNumber(2, 'SMAW', 4)).toBe(false);
    expect(qualifiesFNumber(4, 'SMAW', 2)).toBe(true);
  });

  it('stops at the ladder, so stainless covered electrodes stand alone', () => {
    expect(fNumbersQualifiedBy(5, 'SMAW')).toEqual([5]);
    expect(qualifiesFNumber(5, 'SMAW', 4)).toBe(false);
  });

  it('does not apply the ladder to a process other than shielded metal arc', () => {
    expect(fNumbersQualifiedBy(4, 'GTAW')).toEqual([4]);
    expect(fNumbersQualifiedBy(6, 'GTAW')).toEqual([6]);
    expect(qualifiesFNumber(6, 'GTAW', 4)).toBe(false);
  });
});

describe('atmospheric control', () => {
  it('puts low hydrogen covered electrodes on the oven clock', () => {
    expect(needsAtmosphericControl(4)).toBe(true);
    expect(needsAtmosphericControl(43)).toBe(true);
  });

  it('leaves bare wire and the ordinary coatings off it', () => {
    expect(needsAtmosphericControl(6)).toBe(false);
    expect(needsAtmosphericControl(41)).toBe(false);
    expect(needsAtmosphericControl(3)).toBe(false);
  });

  it('records low hydrogen on the facts themselves', () => {
    expect(fNumberFacts(4).lowHydrogen).toBe(true);
    expect(fNumberFacts(1).lowHydrogen).toBe(false);
  });
});
