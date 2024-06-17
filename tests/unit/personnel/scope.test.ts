import { describe, expect, it } from 'vitest';

import { inches } from '../../../src/core/units.js';
import {
  performanceBaseMetals,
  scopeCovers,
  scopeMisses,
  scopeOf,
  type JointRequirement,
} from '../../../src/personnel/scope.js';
import { sampleQualification } from '../../support/welders.js';

const joint = (overrides: Partial<JointRequirement> = {}): JointRequirement => ({
  process: 'SMAW',
  weldType: 'groove',
  productForm: 'plate',
  position: 'vertical',
  progression: 'uphill',
  fNumber: 4,
  pNumber: '1',
  depositThickness: inches('1/2'),
  backing: true,
  ...overrides,
});

describe('base metal for a welder', () => {
  it('treats the ferrous and nickel families as one group', () => {
    expect(performanceBaseMetals('1')).toContain('8');
    expect(performanceBaseMetals('8')).toContain('1');
    expect(performanceBaseMetals('5A')).toContain('15E');
  });

  it('keeps aluminium separate', () => {
    expect(performanceBaseMetals('22')).toEqual(['21', '22', '23']);
    expect(performanceBaseMetals('22')).not.toContain('1');
  });

  it('leaves an ungrouped family on its own', () => {
    expect(performanceBaseMetals('99')).toEqual(['99']);
  });
});

describe('the scope of a coupon', () => {
  const scope = scopeOf(sampleQualification(), '1');

  it('takes the position table for the weld type it was', () => {
    expect(scope.positions).toEqual(['flat', 'vertical']);
    expect(scope.filletPositions).toEqual(['flat', 'horizontal', 'vertical']);
  });

  it('carries the filler ladder through', () => {
    expect(scope.fNumbers).toEqual([1, 2, 3, 4]);
  });

  it('doubles a thin deposit', () => {
    expect(scope.depositThickness.upper?.toFraction()).toBe('3/4');
  });

  it('puts a plate coupon at twenty four inch pipe and up', () => {
    expect(scope.diameter.lower?.toFraction()).toBe('24');
  });
});

describe('reaching a joint', () => {
  it('covers a joint inside every part of the scope', () => {
    expect(scopeCovers(sampleQualification(), '1', joint())).toBe(true);
  });

  it('reports everything that misses, not just the first', () => {
    const misses = scopeMisses(
      sampleQualification(),
      '1',
      joint({ process: 'GTAW', fNumber: 6, position: 'overhead', depositThickness: inches('1') }),
    );
    expect(misses.map((item) => item.field)).toEqual([
      'process',
      'filler',
      'position',
      'thickness',
    ]);
  });

  it('lets a welder cross the base metal families', () => {
    expect(scopeCovers(sampleQualification(), '1', joint({ pNumber: '8', fNumber: 4 }))).toBe(true);
  });

  it('will not cross into aluminium', () => {
    const misses = scopeMisses(sampleQualification(), '1', joint({ pNumber: '22' }));
    expect(misses.map((item) => item.field)).toContain('base metal');
  });
});

describe('backing', () => {
  it('holds a backed coupon to backed joints', () => {
    const misses = scopeMisses(sampleQualification(), '1', joint({ backing: false }));
    expect(misses.map((item) => item.field)).toEqual(['backing']);
  });

  it('lets an open root coupon do both', () => {
    const open = sampleQualification({ backing: false });
    expect(scopeCovers(open, '1', joint({ backing: false }))).toBe(true);
    expect(scopeCovers(open, '1', joint({ backing: true }))).toBe(true);
  });
});

describe('vertical progression', () => {
  it('only bites on a vertical joint', () => {
    expect(scopeCovers(sampleQualification(), '1', joint({ progression: 'downhill' }))).toBe(false);
    expect(
      scopeCovers(sampleQualification(), '1', joint({ position: 'flat', progression: 'downhill' })),
    ).toBe(true);
  });

  it('is ignored when the coupon recorded none', () => {
    const noProgression = sampleQualification({ verticalProgression: 'not-applicable' });
    expect(scopeCovers(noProgression, '1', joint({ progression: 'downhill' }))).toBe(true);
  });
});

describe('product form and diameter', () => {
  const pipeCoupon = sampleQualification({
    productForm: 'pipe',
    outsideDiameter: inches('6'),
    position: '6G',
  });

  it('lets a pipe coupon cover plate', () => {
    expect(scopeCovers(pipeCoupon, '1', joint())).toBe(true);
  });

  it('holds a plate coupon off small pipe', () => {
    const misses = scopeMisses(
      sampleQualification(),
      '1',
      joint({ productForm: 'pipe', outsideDiameter: inches('6') }),
    );
    expect(misses.map((item) => item.field)).toContain('product form');
  });

  it('lets a plate coupon onto large pipe', () => {
    expect(
      scopeCovers(
        sampleQualification(),
        '1',
        joint({ productForm: 'pipe', outsideDiameter: inches('30') }),
      ),
    ).toBe(true);
  });

  it('holds a pipe coupon to the diameter band it proved', () => {
    const misses = scopeMisses(
      pipeCoupon,
      '1',
      joint({ productForm: 'pipe', outsideDiameter: inches('2') }),
    );
    expect(misses.map((item) => item.field)).toContain('diameter');
  });
});

describe('deposit thickness', () => {
  it('takes the ceiling off at half an inch in three layers', () => {
    const thick = sampleQualification({ depositThickness: inches('1/2'), layers: 5 });
    expect(scopeCovers(thick, '1', joint({ depositThickness: inches('4') }))).toBe(true);
  });

  it('puts it back on for a coupon run in two layers', () => {
    const shallow = sampleQualification({ depositThickness: inches('1/2'), layers: 2 });
    const misses = scopeMisses(shallow, '1', joint({ depositThickness: inches('1') }));
    expect(misses.map((item) => item.field)).toEqual(['thickness']);
  });
});
