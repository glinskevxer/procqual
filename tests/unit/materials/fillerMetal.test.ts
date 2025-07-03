import { describe, expect, it } from 'vitest';

import { isUsedWith } from '../../../src/codes/fnumber.js';
import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  allStock,
  classificationOf,
  dissimilarAnswers,
  dissimilarReason,
  fillersForJoint,
  isFillerAllowed,
  nearestAnswer,
  needsHoldingOven,
  stockForProcess,
  stockItem,
  stocksDiameter,
} from '../../../src/materials/fillerMetal.js';

describe('the store room', () => {
  it('finds a consumable by its code', () => {
    expect(stockItem('E7018-1/8').tradeName).toBe('Atom Arc 7018');
    expect(stockItem('er308l').classification).toBe('ER308L');
  });

  it('refuses a code it does not keep', () => {
    expect(() => stockItem('E6011')).toThrow(ValidationError);
  });

  it('keeps a unique code for every item', () => {
    const codes = allStock().map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every item at least one diameter and one process', () => {
    for (const item of allStock()) {
      expect(item.diameters.length).toBeGreaterThan(0);
      expect(item.processes.length).toBeGreaterThan(0);
    }
  });

  it('reads the classification of every item without complaint', () => {
    for (const item of allStock()) {
      const facts = classificationOf(item.code);
      expect(facts.fNumber).toBeDefined();
      expect(item.processes.some((process) => isUsedWith(facts.fNumber ?? 0, process))).toBe(true);
    }
  });

  it('says which diameters it stocks', () => {
    expect(stocksDiameter('E7018-1/8', inches('1/8'))).toBe(true);
    expect(stocksDiameter('E7018-1/8', inches('3/16'))).toBe(false);
  });

  it('lists the stock for a process', () => {
    const saw = stockForProcess('SAW').map((item) => item.code);
    expect(saw).toEqual(['EM12K']);
    expect(stockForProcess('SMAW').length).toBeGreaterThan(3);
    expect(stockForProcess('PAW')).toEqual([]);
  });
});

describe('the holding oven', () => {
  it('catches the low hydrogen covered electrodes', () => {
    expect(needsHoldingOven('E7018-1/8')).toBe(true);
    expect(needsHoldingOven('E9018-B3')).toBe(true);
    expect(needsHoldingOven('E308L-16')).toBe(true);
  });

  it('leaves bare wire and cellulosic rod out of it', () => {
    expect(needsHoldingOven('ER70S-6')).toBe(false);
    expect(needsHoldingOven('E6010-1/8')).toBe(false);
    expect(needsHoldingOven('EM12K')).toBe(false);
  });
});

describe('the standing answers', () => {
  it('carries a reason with each of them', () => {
    for (const answer of dissimilarAnswers()) {
      expect(answer.reason.length).toBeGreaterThan(20);
      expect(answer.codes.length).toBeGreaterThan(0);
    }
  });

  it('names a reason for a pair it knows', () => {
    expect(dissimilarReason('1', '8')).toContain('stay austenitic after it has been diluted');
    expect(dissimilarReason('8', '1')).toBe(dissimilarReason('1', '8'));
  });

  it('names none for a pair it does not', () => {
    expect(dissimilarReason('15E', '22')).toBeUndefined();
  });

  it('covers the chrome moly ladder as well as the carbon steel one', () => {
    expect(fillersForJoint('3', '4').map((item) => item.code)).toEqual(['E8018-B2', 'ER80S-B2']);
    expect(fillersForJoint('4', '5A').map((item) => item.code)).toEqual(['E9018-B3', 'ER90S-B3']);
  });

  it('every code it names is a consumable the store room keeps', () => {
    for (const answer of dissimilarAnswers()) {
      for (const code of answer.codes) {
        expect(() => stockItem(code)).not.toThrow();
      }
    }
  });
});

describe('the nearest answer to a pair nobody has decided', () => {
  it('is the pair itself when there is one', () => {
    expect(nearestAnswer('1', '8')?.pair).toEqual(['1', '8']);
  });

  it('shares a side when there is not', () => {
    const nearest = nearestAnswer('9B', '8');
    expect(nearest).toBeDefined();
    expect(nearest?.pair.includes('9B') || nearest?.pair.includes('8')).toBe(true);
  });

  it('finds nothing at all for a pair with neither side on the list', () => {
    expect(nearestAnswer('21', '22')).toBeUndefined();
  });
});

describe('matching a filler to a joint', () => {
  it('offers whatever suits the family for a joint between like metals', () => {
    const codes = fillersForJoint('1', '1').map((item) => item.code);
    expect(codes).toContain('E7018-1/8');
    expect(codes).toContain('ER70S-6');
    expect(codes).not.toContain('ER2209');
  });

  it('gives a standing answer for a carbon to stainless joint', () => {
    const codes = fillersForJoint('1', '8').map((item) => item.code);
    expect(codes).toEqual(['E309L-16', 'ER309L', 'ERNiCrMo-3']);
  });

  it('does not offer either side of the joint its own filler', () => {
    const codes = fillersForJoint('1', '8').map((item) => item.code);
    expect(codes).not.toContain('E7018-1/8');
    expect(codes).not.toContain('E308L-16');
  });

  it('reads the pair in either order', () => {
    expect(fillersForJoint('8', '1').map((item) => item.code)).toEqual(
      fillersForJoint('1', '8').map((item) => item.code),
    );
  });

  it('offers nothing at all for a pair with no standing answer', () => {
    expect(fillersForJoint('15E', '8')).toEqual([]);
    expect(isFillerAllowed('ERNiCrMo-3', '15E', '8')).toBe(false);
  });

  it('answers the yes or no question directly', () => {
    expect(isFillerAllowed('E309L-16', '1', '8')).toBe(true);
    expect(isFillerAllowed('E7018-1/8', '1', '8')).toBe(false);
    expect(isFillerAllowed('E7018-1/8', '1', '1')).toBe(true);
  });
});
