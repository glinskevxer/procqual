import { describe, expect, it } from 'vitest';

import { Interval } from '../../../src/core/interval.js';
import { inches } from '../../../src/core/units.js';
import {
  describeSuggestion,
  positionFor,
  suggestCoupons,
  thinnestCouponFor,
} from '../../../src/qualification/couponPlanner.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleWps } from '../../support/wps.js';

describe('running the thickness table backwards', () => {
  it('asks for half the production thickness in the middle of the range', () => {
    expect(thinnestCouponFor(inches('1/2'), 'SMAW').toFraction()).toBe('1/4');
    expect(thinnestCouponFor(inches('1'), 'SMAW').toFraction()).toBe('1/2');
  });

  it('never asks for less than a sixteenth', () => {
    expect(thinnestCouponFor(inches('1/16'), 'SMAW').toFraction()).toBe('1/16');
    expect(thinnestCouponFor(inches('0.05'), 'SMAW').toInches().toString()).toBe('0.05');
  });

  it('stops at three quarters, where the range jumps to eight inches', () => {
    expect(thinnestCouponFor(inches('2'), 'SMAW').toFraction()).toBe('3/4');
    expect(thinnestCouponFor(inches('6'), 'SMAW').toFraction()).toBe('3/4');
  });

  it('produces a coupon that actually covers what was asked for', () => {
    for (const wanted of ['1/8', '1/4', '1/2', '3/4', '1', '4']) {
      const coupon = thinnestCouponFor(inches(wanted), 'SMAW');
      expect(coupon.toInches().isPositive()).toBe(true);
    }
  });
});

describe('choosing a position', () => {
  it('takes the cheapest coupon that covers everything claimed', () => {
    expect(positionFor(['flat'], 'groove')).toBe('1G');
    expect(positionFor(['flat', 'horizontal'], 'groove')).toBe('2G');
    expect(positionFor(['flat', 'horizontal', 'vertical', 'overhead'], 'groove')).toBe('6G');
  });

  it('reads the fillet column when the weld is a fillet', () => {
    expect(positionFor(['flat', 'horizontal', 'vertical'], 'fillet')).toBe('3F');
  });

  it('finds nothing when no single coupon covers the claim', () => {
    expect(positionFor(['flat', 'sideways'], 'groove')).toBeUndefined();
  });
});

describe('suggesting a coupon', () => {
  it('says nothing when the procedure is already supported', () => {
    expect(suggestCoupons(sampleWps(), [samplePqr()])).toEqual([]);
  });

  it('suggests one for a process no record covers', () => {
    const both = sampleWps({
      layers: [
        sampleWps().layers[0]!,
        { ...sampleWps().layers[0]!, process: 'GTAW', fNumbers: [6] },
      ],
    });
    const suggestions = suggestCoupons(both, [samplePqr()]);
    expect(suggestions.map((item) => item.process)).toEqual(['SMAW', 'GTAW']);
    const tig = suggestions.find((item) => item.process === 'GTAW');
    expect(tig?.reasons).toContain('no record covers GTAW at all');
    expect(tig?.fNumber).toBe(6);
  });

  it('asks for a thicker coupon when the claim runs past what is covered', () => {
    const wide = sampleWps({
      baseMetalThickness: Interval.closed(inches('0.0625'), inches('2')),
    });
    const suggestion = suggestCoupons(wide, [samplePqr()])[0];
    expect(suggestion?.couponThickness.toFraction()).toBe('3/4');
    expect(suggestion?.reasons.join(' ')).toContain('reaches the 2 top of the claimed range');
  });

  it('takes the highest P number claimed, which reaches the others downward', () => {
    const wide = sampleWps({ pNumbers: ['1', '3'] });
    const suggestion = suggestCoupons(wide, [samplePqr()])[0];
    expect(suggestion?.pNumber).toBe('3');
    expect(suggestion?.reasons.join(' ')).toContain('reaches the others downward');
  });

  it('carries the toughness flag through', () => {
    const tough = sampleWps({ toughnessQualified: true, pNumbers: ['1', '8'] });
    const suggestion = suggestCoupons(tough, [samplePqr()])[0];
    expect(suggestion?.toughnessRequired).toBe(true);
    expect(suggestion?.position).toBe('6G');
    expect(suggestion?.pNumber).toBe('8');
  });

  it('reads back as one line a welding engineer can act on', () => {
    const wide = sampleWps({ pNumbers: ['1', '3'] });
    const suggestion = suggestCoupons(wide, [samplePqr()])[0];
    expect(describeSuggestion(suggestion!)).toBe(
      'SMAW coupon, 3/8 in the 6G position, P-No 3 with F-No 4',
    );
  });
});
