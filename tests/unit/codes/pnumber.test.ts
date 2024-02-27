import { describe, expect, it } from 'vitest';

import {
  allPNumbers,
  describePNumber,
  groupIsEssential,
  groupsQualifiedBy,
  hasGroup,
  isDissimilar,
  isPNumber,
  parsePNumber,
  pNumberFacts,
  pNumbersQualifiedBy,
  qualifiesPNumber,
} from '../../../src/codes/pnumber.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('parsing', () => {
  it('accepts the bare number and the written form', () => {
    expect(parsePNumber('1')).toBe('1');
    expect(parsePNumber('P-No 5A')).toBe('5A');
    expect(parsePNumber('p-no. 8')).toBe('8');
    expect(parsePNumber(' 15e ')).toBe('15E');
  });

  it('refuses a P number the shop does not carry', () => {
    expect(() => parsePNumber('99')).toThrow(ValidationError);
    expect(isPNumber('99')).toBe(false);
    expect(isPNumber('P-No 1')).toBe(true);
  });

  it('describes a P number with its family', () => {
    expect(describePNumber('8')).toBe('P-No 8 (austenitic stainless)');
  });

  it('lists every P number once', () => {
    const codes = allPNumbers().map((facts) => facts.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('1');
    expect(codes).toContain('45');
  });
});

describe('groups', () => {
  it('knows which groups exist under a P number', () => {
    expect(pNumberFacts('1').groups).toEqual([1, 2, 3, 4]);
    expect(hasGroup('5A', 1)).toBe(true);
    expect(hasGroup('5A', 2)).toBe(false);
  });

  it('refuses a group that does not belong to the P number', () => {
    expect(() => groupsQualifiedBy('5A', 3, false)).toThrow(/has no group 3/);
  });

  it('ignores the group entirely when no impact testing is called for', () => {
    expect(groupIsEssential(false)).toBe(false);
    expect(groupsQualifiedBy('1', 2, false)).toEqual([1, 2, 3, 4]);
  });

  it('limits the coupon to its own group and below once toughness is required', () => {
    expect(groupIsEssential(true)).toBe(true);
    expect(groupsQualifiedBy('1', 2, true)).toEqual([1, 2]);
    expect(groupsQualifiedBy('1', 4, true)).toEqual([1, 2, 3, 4]);
    expect(groupsQualifiedBy('1', 1, true)).toEqual([1]);
  });
});

describe('what one coupon speaks for', () => {
  it('always speaks for its own P number', () => {
    expect(pNumbersQualifiedBy('8')).toEqual(['8']);
    expect(qualifiesPNumber('8', '8')).toBe(true);
  });

  it('reaches down from the harder metals to the easier ones', () => {
    expect(pNumbersQualifiedBy('4')).toEqual(['4', '3', '1']);
    expect(qualifiesPNumber('4', '1')).toBe(true);
    expect(qualifiesPNumber('5B', '3')).toBe(true);
  });

  it('never reaches upward', () => {
    expect(qualifiesPNumber('1', '4')).toBe(false);
    expect(qualifiesPNumber('3', '5A')).toBe(false);
  });

  it('does not cross into a different metal family', () => {
    expect(qualifiesPNumber('4', '8')).toBe(false);
    expect(qualifiesPNumber('8', '1')).toBe(false);
    expect(qualifiesPNumber('41', '1')).toBe(false);
  });

  it('reads the argument in the written form too', () => {
    expect(qualifiesPNumber('P-No 4', 'P-No 1')).toBe(true);
  });
});

describe('dissimilar joints', () => {
  it('spots two different P numbers', () => {
    expect(isDissimilar('1', '8')).toBe(true);
    expect(isDissimilar('P-No 1', '1')).toBe(false);
  });
});

describe('family facts', () => {
  it('records where post weld heat treatment is customary', () => {
    expect(pNumberFacts('4').pwhtCustomary).toBe(true);
    expect(pNumberFacts('8').pwhtCustomary).toBe(false);
  });

  it('records the preheat family the metal belongs to', () => {
    expect(pNumberFacts('1').preheatFamily).toBe('carbon');
    expect(pNumberFacts('15E').preheatFamily).toBe('chrome-moly');
    expect(pNumberFacts('22').preheatFamily).toBe('none');
  });
});
