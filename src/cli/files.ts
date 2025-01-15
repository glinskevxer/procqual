import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ValidationError } from '../core/errors.js';
import { PlainDate } from '../core/plainDate.js';
import type { Context } from './context.js';

/**
 * The three things half the commands were doing by hand.
 *
 * Reading a file, writing one that must not already exist, and turning an
 * optional date option into a date. Each was two or three lines and each had
 * been written four times, which is how the print command ended up refusing to
 * overwrite and the export command ended up not caring.
 */

export function readTextFile(path: string): string {
  const resolved = resolve(path);
  try {
    return readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new ValidationError('file', `cannot read ${resolved}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Writes a file that must not already exist, so nothing signed is replaced. */
export function writeNewFile(path: string, text: string): string {
  const resolved = resolve(path);
  try {
    writeFileSync(resolved, text.endsWith('\n') ? text : `${text}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    throw new ValidationError('out', `cannot write ${resolved}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return resolved;
}

export function readJsonFile(path: string): unknown {
  const resolved = resolve(path);
  try {
    return JSON.parse(readTextFile(resolved));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('file', `${resolved} is not readable json`, { path: resolved });
  }
}

/** A `--on` option, falling back to whatever the clock says today is. */
export function onDate(context: Context, given: string | undefined): PlainDate {
  return given === undefined ? context.clock.today() : PlainDate.parse(given);
}
