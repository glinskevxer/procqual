import { describe, expect, it } from 'vitest';

import {
  describeExit,
  exitCodeFor,
  EXIT_CONFLICT,
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_NOT_FOUND,
  EXIT_OK,
  EXIT_STORAGE,
  EXIT_USAGE,
} from '../../../src/cli/exitCodes.js';
import {
  ArcError,
  ConflictError,
  NotFoundError,
  StorageError,
  ValidationError,
} from '../../../src/core/errors.js';

describe('the codes', () => {
  it('are all different', () => {
    const codes = [
      EXIT_OK,
      EXIT_INTERNAL,
      EXIT_INPUT,
      EXIT_NOT_FOUND,
      EXIT_CONFLICT,
      EXIT_STORAGE,
      EXIT_USAGE,
    ];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reserve zero for success', () => {
    expect(EXIT_OK).toBe(0);
  });
});

describe('mapping an error to a code', () => {
  it('takes each error class to its own code', () => {
    expect(exitCodeFor(new ValidationError('a', 'bad'))).toBe(EXIT_INPUT);
    expect(exitCodeFor(new NotFoundError('joint', 'J-99'))).toBe(EXIT_NOT_FOUND);
    expect(exitCodeFor(new ConflictError('already there'))).toBe(EXIT_CONFLICT);
    expect(exitCodeFor(new StorageError('altered'))).toBe(EXIT_STORAGE);
  });

  it('treats an unsupported thing as bad input', () => {
    expect(exitCodeFor(new ArcError('unsupported', 'no such process'))).toBe(EXIT_INPUT);
  });

  it('treats anything else as internal', () => {
    expect(exitCodeFor(new Error('boom'))).toBe(EXIT_INTERNAL);
    expect(exitCodeFor('a string')).toBe(EXIT_INTERNAL);
    expect(exitCodeFor(new ArcError('internal', 'broke'))).toBe(EXIT_INTERNAL);
  });
});

describe('describing a code', () => {
  it('has a sentence for each of them', () => {
    expect(describeExit(EXIT_OK)).toBe('ok');
    expect(describeExit(EXIT_INPUT)).toContain('input was wrong');
    expect(describeExit(EXIT_NOT_FOUND)).toContain('not there');
    expect(describeExit(EXIT_CONFLICT)).toContain('already there');
    expect(describeExit(EXIT_STORAGE)).toContain('unreadable, locked or altered');
    expect(describeExit(EXIT_USAGE)).toContain('not one this build knows');
    expect(describeExit(99)).toContain('something unexpected');
  });
});
