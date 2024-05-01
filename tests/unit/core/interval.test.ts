import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import { Interval } from '../../../src/core/interval.js';
import { inches, type Length } from '../../../src/core/units.js';

const d = decimal;

describe('construction', () => {
  it('refuses a crossed pair', () => {
    expect(() => Interval.closed(d('2'), d('1'))).toThrow(ValidationError);
  });

  it('allows a point interval', () => {
    const point = Interval.exactly(d('0.5'));
    expect(point.isPoint()).toBe(true);
    expect(point.contains(d('0.5'))).toBe(true);
    expect(point.isEmpty()).toBe(false);
  });

  it('knows when it is bounded', () => {
    expect(Interval.closed(d('1'), d('2')).isBounded()).toBe(true);
    expect(Interval.atLeast(d('1')).isBounded()).toBe(false);
    expect(Interval.atMost(d('2')).isBounded()).toBe(false);
    expect(Interval.unbounded<Length>().isBounded()).toBe(false);
  });

  it('calls a degenerate half open interval empty', () => {
    const empty = new Interval(d('1'), d('1'), { upperInclusive: false });
    expect(empty.isEmpty()).toBe(true);
    expect(empty.contains(d('1'))).toBe(false);
  });
});

describe('contains', () => {
  const range = Interval.closed(inches('0.1875'), inches('0.75'));

  it('includes both ends of a closed range', () => {
    expect(range.contains(inches('3/16'))).toBe(true);
    expect(range.contains(inches('3/4'))).toBe(true);
  });

  it('excludes just outside either end', () => {
    expect(range.contains(inches('0.1874'))).toBe(false);
    expect(range.contains(inches('0.7501'))).toBe(false);
  });

  it('honours an exclusive bound', () => {
    const open = new Interval(inches('0.1875'), inches('0.75'), {
      lowerInclusive: false,
      upperInclusive: false,
    });
    expect(open.contains(inches('3/16'))).toBe(false);
    expect(open.contains(inches('3/4'))).toBe(false);
    expect(open.contains(inches('0.5'))).toBe(true);
  });

  it('accepts anything above an unbounded lower end', () => {
    const overTwoSeven = Interval.atLeast(inches('2.875'));
    expect(overTwoSeven.contains(inches('24'))).toBe(true);
    expect(overTwoSeven.contains(inches('2.875'))).toBe(true);
    expect(overTwoSeven.contains(inches('1'))).toBe(false);
  });

  it('accepts anything from an unbounded interval', () => {
    expect(Interval.unbounded<Length>().contains(inches('0'))).toBe(true);
  });
});

describe('covers', () => {
  const qualified = Interval.closed(inches('0.1875'), inches('0.75'));

  it('covers a range inside it', () => {
    expect(qualified.covers(Interval.closed(inches('0.25'), inches('0.5')))).toBe(true);
  });

  it('covers itself', () => {
    expect(qualified.covers(qualified)).toBe(true);
  });

  it('does not cover a range that runs past either end', () => {
    expect(qualified.covers(Interval.closed(inches('0.125'), inches('0.5')))).toBe(false);
    expect(qualified.covers(Interval.closed(inches('0.5'), inches('1')))).toBe(false);
  });

  it('does not cover an unbounded range', () => {
    expect(qualified.covers(Interval.atLeast(inches('0.25')))).toBe(false);
    expect(qualified.covers(Interval.atMost(inches('0.5')))).toBe(false);
  });

  it('is covered by an unbounded range', () => {
    expect(Interval.unbounded<Length>().covers(qualified)).toBe(true);
    expect(Interval.atLeast(inches('0.1')).covers(qualified)).toBe(true);
  });

  it('minds an exclusive boundary on the covering range', () => {
    const openTop = new Interval(inches('0'), inches('0.75'), { upperInclusive: false });
    expect(openTop.covers(Interval.closed(inches('0.5'), inches('0.75')))).toBe(false);
    expect(
      openTop.covers(new Interval(inches('0.5'), inches('0.75'), { upperInclusive: false })),
    ).toBe(true);
  });

  it('covers an empty range trivially', () => {
    const empty = new Interval(inches('1'), inches('1'), { upperInclusive: false });
    expect(qualified.covers(empty)).toBe(true);
  });
});

describe('intersect and overlaps', () => {
  it('takes the tighter of each bound', () => {
    const left = Interval.closed(d('1'), d('10'));
    const right = Interval.closed(d('5'), d('20'));
    const both = left.intersect(right);
    expect(both.toString()).toBe('[5, 10]');
    expect(left.overlaps(right)).toBe(true);
  });

  it('produces an empty interval when nothing is shared', () => {
    const left = Interval.closed(d('1'), d('2'));
    const right = Interval.closed(d('5'), d('6'));
    expect(left.intersect(right).isEmpty()).toBe(true);
    expect(left.overlaps(right)).toBe(false);
  });

  it('treats touching closed ranges as overlapping at the point', () => {
    const left = Interval.closed(d('1'), d('2'));
    const right = Interval.closed(d('2'), d('3'));
    expect(left.overlaps(right)).toBe(true);
    expect(left.intersect(right).isPoint()).toBe(true);
  });

  it('does not overlap when the touching bound is exclusive on one side', () => {
    const left = new Interval(d('1'), d('2'), { upperInclusive: false });
    const right = Interval.closed(d('2'), d('3'));
    expect(left.overlaps(right)).toBe(false);
  });

  it('carries an unbounded side through', () => {
    const open = Interval.atLeast(d('5'));
    expect(open.intersect(Interval.atMost(d('9'))).toString()).toBe('[5, 9]');
    expect(open.intersect(Interval.unbounded()).toString()).toBe('[5, +inf]');
    expect(Interval.unbounded<Length>().intersect(Interval.unbounded()).toString()).toBe(
      '[-inf, +inf]',
    );
  });
});

describe('rendering', () => {
  it('prints the bracket form', () => {
    expect(Interval.closed(d('1'), d('2')).toString()).toBe('[1, 2]');
    expect(Interval.atLeast(d('1'), false).toString()).toBe('(1, +inf]');
    expect(Interval.atMost(d('2'), false).toString()).toBe('[-inf, 2)');
  });

  it('serialises the bounds and their inclusivity', () => {
    expect(Interval.atLeast(inches('0.25')).toJSON()).toEqual({
      lower: '0.25 in',
      upper: null,
      lowerInclusive: true,
      upperInclusive: true,
    });
  });
});
