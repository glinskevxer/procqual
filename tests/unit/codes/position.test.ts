import { describe, expect, it } from 'vitest';

import {
  combinedPositions,
  coversProductForm,
  describePosition,
  isTestPosition,
  parseTestPosition,
  positionFacts,
  positionsForWeldType,
  positionsQualifiedBy,
  qualifiesAllPositions,
} from '../../../src/codes/position.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('parsing', () => {
  it('takes a position in any case', () => {
    expect(parseTestPosition('6g')).toBe('6G');
    expect(parseTestPosition(' 3F ')).toBe('3F');
  });

  it('refuses a position that does not exist', () => {
    expect(() => parseTestPosition('7G')).toThrow(ValidationError);
    expect(isTestPosition('7G')).toBe(false);
  });
});

describe('facts', () => {
  it('knows which positions only exist on pipe', () => {
    expect(positionFacts('5G').couponForm).toBe('pipe');
    expect(positionFacts('6G').couponForm).toBe('pipe');
    expect(positionFacts('3G').couponForm).toBe('plate');
    expect(positionFacts('2G').couponForm).toBe('either');
  });

  it('knows which coupons are rolled', () => {
    expect(positionFacts('1G').axisFixed).toBe(false);
    expect(positionFacts('5G').axisFixed).toBe(true);
  });

  it('splits the positions by weld type', () => {
    expect(positionsForWeldType('fillet')).toEqual(['1F', '2F', '3F', '4F', '5F']);
    expect(positionsForWeldType('groove')).toEqual(['1G', '2G', '3G', '4G', '5G', '6G', '6GR']);
  });

  it('describes a position', () => {
    expect(describePosition('6G')).toBe('6G groove inclined axis, fixed');
  });
});

describe('what a coupon qualifies', () => {
  it('gives 1G the flat position only', () => {
    expect(positionsQualifiedBy('1G', 'groove')).toEqual(['flat']);
    expect(positionsQualifiedBy('1G', 'fillet')).toEqual(['flat']);
  });

  it('gives 3G vertical for grooves but horizontal as well for fillets', () => {
    expect(positionsQualifiedBy('3G', 'groove')).toEqual(['flat', 'vertical']);
    expect(positionsQualifiedBy('3G', 'fillet')).toEqual(['flat', 'horizontal', 'vertical']);
  });

  it('gives 6G everything', () => {
    expect(qualifiesAllPositions(['6G'], 'groove')).toBe(true);
    expect(qualifiesAllPositions(['6G'], 'fillet')).toBe(true);
  });

  it('gives a fillet coupon nothing at all for grooves', () => {
    expect(positionsQualifiedBy('3F', 'groove')).toEqual([]);
    expect(positionsQualifiedBy('5F', 'groove')).toEqual([]);
    expect(qualifiesAllPositions(['5F'], 'groove')).toBe(false);
    expect(qualifiesAllPositions(['5F'], 'fillet')).toBe(true);
  });

  it('adds two coupons together the way 2G plus 5G is meant to work', () => {
    expect(qualifiesAllPositions(['2G'], 'groove')).toBe(false);
    expect(qualifiesAllPositions(['5G'], 'groove')).toBe(false);
    expect(qualifiesAllPositions(['2G', '5G'], 'groove')).toBe(true);
    expect(combinedPositions(['2G', '5G'], 'groove')).toEqual([
      'flat',
      'horizontal',
      'vertical',
      'overhead',
    ]);
  });

  it('keeps the combined list in a stable order', () => {
    expect(combinedPositions(['4G', '3G'], 'groove')).toEqual(['flat', 'vertical', 'overhead']);
    expect(combinedPositions([], 'groove')).toEqual([]);
  });
});

describe('product form carry over', () => {
  it('lets a pipe coupon cover plate work', () => {
    expect(coversProductForm('pipe', 'plate')).toBe(true);
  });

  it('does not let a plate coupon cover pipe on its own', () => {
    expect(coversProductForm('plate', 'pipe')).toBe(false);
  });

  it('always covers its own form', () => {
    expect(coversProductForm('plate', 'plate')).toBe(true);
    expect(coversProductForm('pipe', 'pipe')).toBe(true);
  });
});
