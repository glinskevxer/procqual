import { ArcError, type ErrorCode } from '../core/errors.js';

/**
 * Exit codes, because these commands get run from scripts.
 *
 * A single non zero code is enough for a person at a terminal and useless in a
 * nightly job, which wants to tell "the record was not there" apart from "the
 * journal has been altered" without reading the message. The codes are stable
 * and are part of what this program promises.
 *
 *   0  it worked
 *   1  something unexpected went wrong
 *   2  the command line or the input was wrong
 *   3  the record asked for is not there
 *   4  the record is already there, or the change conflicts with one
 *   5  the workspace itself is unreadable, locked or altered
 *   6  the command is not one this build knows
 */
export const EXIT_OK = 0;
export const EXIT_INTERNAL = 1;
export const EXIT_INPUT = 2;
export const EXIT_NOT_FOUND = 3;
export const EXIT_CONFLICT = 4;
export const EXIT_STORAGE = 5;
export const EXIT_USAGE = 6;

const BY_CODE: Readonly<Record<ErrorCode, number>> = {
  validation: EXIT_INPUT,
  not_found: EXIT_NOT_FOUND,
  conflict: EXIT_CONFLICT,
  storage: EXIT_STORAGE,
  unsupported: EXIT_INPUT,
  internal: EXIT_INTERNAL,
};

export function exitCodeFor(error: unknown): number {
  if (error instanceof ArcError) {
    return BY_CODE[error.code];
  }
  return EXIT_INTERNAL;
}

export function describeExit(code: number): string {
  switch (code) {
    case EXIT_OK:
      return 'ok';
    case EXIT_INPUT:
      return 'the command line or the input was wrong';
    case EXIT_NOT_FOUND:
      return 'the record asked for is not there';
    case EXIT_CONFLICT:
      return 'the record is already there, or the change conflicts';
    case EXIT_STORAGE:
      return 'the workspace is unreadable, locked or altered';
    case EXIT_USAGE:
      return 'the command is not one this build knows';
    default:
      return 'something unexpected went wrong';
  }
}
