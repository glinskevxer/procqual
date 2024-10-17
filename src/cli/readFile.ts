import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ValidationError } from '../core/errors.js';
import { parseWith, type Reader } from '../core/schema.js';
import { orThrow } from '../store/codec.js';

/**
 * Reading a record out of a json file.
 *
 * The big records have thirty or forty fields and nobody is typing those as
 * command line options. They arrive as a file, usually written out of the old
 * system or by hand from the paper form, and the readers that already exist
 * for the journal are what read them. One definition of the shape, used for
 * both the file on the way in and the line in the journal.
 */
export function readRecordFile<T>(path: string, reader: Reader<T>, what: string): T {
  const resolved = resolve(path);
  let text: string;
  try {
    text = readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new ValidationError('file', `cannot read ${resolved}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError('file', `${resolved} is not readable json`, { path: resolved });
  }
  return orThrow(`${what} from ${resolved}`, parseWith(reader, parsed));
}
