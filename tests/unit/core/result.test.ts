import { describe, expect as vitestExpect, it } from 'vitest';

import {
  all,
  andThen,
  err,
  expect as unwrapExpect,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  partition,
  unwrapOr,
} from '../../../src/core/result.js';

describe('ok and err', () => {
  it('carries the value on the success branch', () => {
    const result = ok(12);
    vitestExpect(result.ok).toBe(true);
    vitestExpect(result.value).toBe(12);
  });

  it('carries the error on the failure branch', () => {
    const result = err('no');
    vitestExpect(result.ok).toBe(false);
    vitestExpect(result.error).toBe('no');
  });

  it('narrows through the guards', () => {
    const good = ok('a');
    const bad = err('b');
    vitestExpect(isOk(good)).toBe(true);
    vitestExpect(isErr(good)).toBe(false);
    vitestExpect(isOk(bad)).toBe(false);
    vitestExpect(isErr(bad)).toBe(true);
  });
});

describe('map', () => {
  it('applies the function to a success', () => {
    const result = map(ok(3), (n) => n * 2);
    vitestExpect(result).toEqual(ok(6));
  });

  it('leaves a failure alone', () => {
    const result = map(err<string>('bad'), (n: number) => n * 2);
    vitestExpect(result).toEqual(err('bad'));
  });
});

describe('mapErr', () => {
  it('rewrites the error branch', () => {
    const result = mapErr(err('bad'), (e) => `${e}!`);
    vitestExpect(result).toEqual(err('bad!'));
  });

  it('leaves a success alone', () => {
    const result = mapErr(ok(1), (e: string) => `${e}!`);
    vitestExpect(result).toEqual(ok(1));
  });
});

describe('andThen', () => {
  const halve = (n: number) => (n % 2 === 0 ? ok(n / 2) : err('odd'));

  it('chains a second successful step', () => {
    vitestExpect(andThen(ok(8), halve)).toEqual(ok(4));
  });

  it('reports the failure of the second step', () => {
    vitestExpect(andThen(ok(7), halve)).toEqual(err('odd'));
  });

  it('short circuits when the first step failed', () => {
    vitestExpect(andThen(err<string>('first'), halve)).toEqual(err('first'));
  });
});

describe('unwrapOr', () => {
  it('returns the value of a success', () => {
    vitestExpect(unwrapOr(ok(5), 0)).toBe(5);
  });

  it('returns the fallback for a failure', () => {
    vitestExpect(unwrapOr(err<string>('x'), 0)).toBe(0);
  });
});

describe('expect', () => {
  it('unwraps a success', () => {
    vitestExpect(unwrapExpect(ok('value'), 'should be there')).toBe('value');
  });

  it('throws with the message and the error text', () => {
    vitestExpect(() => unwrapExpect(err('coupon failed'), 'setup')).toThrow(
      'setup: coupon failed',
    );
  });

  it('describes an Error error', () => {
    vitestExpect(() => unwrapExpect(err(new Error('boom')), 'setup')).toThrow('setup: boom');
  });

  it('describes a structured error', () => {
    vitestExpect(() => unwrapExpect(err({ code: 'E1' }), 'setup')).toThrow('{"code":"E1"}');
  });
});

describe('all', () => {
  it('collects every value when each step succeeded', () => {
    vitestExpect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
  });

  it('returns the first failure', () => {
    vitestExpect(all([ok(1), err('second'), err('third')])).toEqual(err('second'));
  });

  it('handles an empty list', () => {
    vitestExpect(all([])).toEqual(ok([]));
  });
});

describe('partition', () => {
  it('splits successes from failures and keeps both orders', () => {
    const split = partition([ok(1), err('a'), ok(2), err('b')]);
    vitestExpect(split.values).toEqual([1, 2]);
    vitestExpect(split.errors).toEqual(['a', 'b']);
  });

  it('returns two empty lists for no input', () => {
    vitestExpect(partition([])).toEqual({ values: [], errors: [] });
  });
});
