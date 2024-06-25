import { type Decimal } from '../core/decimal.js';
import { type DocumentNumber } from '../core/identifier.js';
import { Interval } from '../core/interval.js';
import { type PlainDate } from '../core/plainDate.js';
import { err, ok, type Result } from '../core/result.js';
import {
  describeIssues,
  optional,
  readArray,
  readBoolean,
  readDate,
  readDecimal,
  readDocumentNumber,
  readInteger,
  readLength,
  readNonEmptyString,
  readOneOf,
  readRecord,
  type Issue,
  type Reader,
} from '../core/schema.js';
import { Temperature } from '../core/temperature.js';
import { type Length } from '../core/units.js';

/**
 * Turning domain values into something a journal line can hold, and back.
 *
 * Everything goes out as a string. A thickness is `"0.375"`, a temperature is
 * `"250"`, a date is `"2024-06-01"`. That is more verbose than a number would
 * be and it is deliberate: the journal is meant to be readable by eye, and a
 * bare `0.375` in a file gives no clue whether the shop was working in inches
 * or in millimetres that day.
 *
 * Reading back is where the care goes. A journal is only as good as the oldest
 * line in it, so every reader has to cope with a line written by a version of
 * this code that no longer exists.
 */

export type Encoded = Record<string, unknown>;

export function encodeLength(value: Length): string {
  return value.toJSON();
}

export function encodeTemperature(value: Temperature): string {
  return value.toJSON();
}

export function encodeDecimal(value: Decimal): string {
  return value.toString();
}

export function encodeDate(value: PlainDate): string {
  return value.toString();
}

export function encodeDocumentNumber(value: DocumentNumber): string {
  return value.toString();
}

export function encodeInterval(value: Interval<Length>): Encoded {
  return {
    lower: value.lower === undefined ? null : encodeLength(value.lower),
    upper: value.upper === undefined ? null : encodeLength(value.upper),
    lowerInclusive: value.lowerInclusive,
    upperInclusive: value.upperInclusive,
  };
}

export const readLengthInterval: Reader<Interval<Length>> = (value, path) => {
  const shape = readRecord({
    lower: optional(readLength),
    upper: optional(readLength),
    lowerInclusive: readBoolean,
    upperInclusive: readBoolean,
  });
  const read = shape(value, path);
  if (!read.ok) {
    return read;
  }
  try {
    return ok(
      new Interval(read.value.lower, read.value.upper, {
        lowerInclusive: read.value.lowerInclusive,
        upperInclusive: read.value.upperInclusive,
      }),
    );
  } catch (error) {
    return err([{ path, message: error instanceof Error ? error.message : 'not an interval' }]);
  }
};

export const readTemperature: Reader<Temperature> = (value, path) => {
  if (value instanceof Temperature) {
    return ok(value);
  }
  try {
    return ok(Temperature.parse(String(value)));
  } catch (error) {
    return err([
      {
        path,
        message: `expected a temperature (${error instanceof Error ? error.message : 'unreadable'})`,
      },
    ]);
  }
};

/** Everything a codec needs, gathered so a record file imports one thing. */
export const readers = {
  boolean: readBoolean,
  date: readDate,
  decimal: readDecimal,
  documentNumber: readDocumentNumber,
  integer: readInteger,
  interval: readLengthInterval,
  length: readLength,
  oneOf: readOneOf,
  array: readArray,
  optional,
  record: readRecord,
  temperature: readTemperature,
  text: readNonEmptyString,
} as const;

export class DecodeError extends Error {
  readonly issues: readonly Issue[];

  constructor(what: string, issues: readonly Issue[]) {
    super(`cannot read ${what}: ${describeIssues(issues)}`);
    this.name = 'DecodeError';
    this.issues = issues;
  }
}

export function orThrow<T>(what: string, result: Result<T, Issue[]>): T {
  if (result.ok) {
    return result.value;
  }
  throw new DecodeError(what, result.error);
}
