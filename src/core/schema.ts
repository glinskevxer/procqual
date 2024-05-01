import { Decimal } from './decimal.js';
import { DocumentNumber } from './identifier.js';
import { PlainDate } from './plainDate.js';
import { err, ok, type Result } from './result.js';
import { Length } from './units.js';

/**
 * A very small reader combinator library.
 *
 * Records arrive from three places, all of them untrusted: a JSON journal on
 * disk, a CSV export from the old paper system, and whatever a coordinator
 * types into the command line. The reason for not reaching for a library is
 * that the interesting types here are the domain ones. A thickness has to come
 * back as a Length parsed from `3/8`, not as a number that some later layer
 * remembers to convert, and the error has to name the field path so a bad row
 * in a two thousand line import can be found.
 */

export interface Issue {
  readonly path: string;
  readonly message: string;
}

export type Reader<T> = (value: unknown, path: string) => Result<T, Issue[]>;

export function issue(path: string, message: string): Issue[] {
  return [{ path, message }];
}

export const readString: Reader<string> = (value, path) =>
  typeof value === 'string' ? ok(value) : err(issue(path, 'expected a string'));

export const readNonEmptyString: Reader<string> = (value, path) => {
  if (typeof value !== 'string') {
    return err(issue(path, 'expected a string'));
  }
  const trimmed = value.trim();
  return trimmed === '' ? err(issue(path, 'must not be blank')) : ok(trimmed);
};

export const readInteger: Reader<number> = (value, path) => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return ok(value);
  }
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
    return ok(Number(value.trim()));
  }
  return err(issue(path, 'expected a whole number'));
};

export const readBoolean: Reader<boolean> = (value, path) => {
  if (typeof value === 'boolean') {
    return ok(value);
  }
  if (value === 'true' || value === 'yes') {
    return ok(true);
  }
  if (value === 'false' || value === 'no') {
    return ok(false);
  }
  return err(issue(path, 'expected true or false'));
};

export const readDecimal: Reader<Decimal> = (value, path) =>
  wrap(path, 'a decimal number', () => {
    if (value instanceof Decimal) {
      return value;
    }
    if (typeof value === 'number') {
      return Decimal.fromNumber(value);
    }
    return Decimal.parse(String(value));
  });

export const readLength: Reader<Length> = (value, path) =>
  wrap(path, 'a length', () => {
    if (value instanceof Length) {
      return value;
    }
    if (typeof value === 'number') {
      return Length.ofInches(Decimal.fromNumber(value));
    }
    return Length.parse(String(value));
  });

export const readDate: Reader<PlainDate> = (value, path) =>
  wrap(path, 'a date', () => {
    if (value instanceof PlainDate) {
      return value;
    }
    return PlainDate.parse(String(value));
  });

export const readDocumentNumber: Reader<DocumentNumber> = (value, path) =>
  wrap(path, 'a document number', () => {
    if (value instanceof DocumentNumber) {
      return value;
    }
    return DocumentNumber.parse(String(value));
  });

export function readOneOf<T extends string>(allowed: readonly T[]): Reader<T> {
  return (value, path) => {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return ok(value as T);
    }
    return err(issue(path, `expected one of ${allowed.join(', ')}`));
  };
}

export function readArray<T>(item: Reader<T>): Reader<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) {
      return err(issue(path, 'expected a list'));
    }
    const values: T[] = [];
    const issues: Issue[] = [];
    value.forEach((element, index) => {
      const read = item(element, `${path}[${index}]`);
      if (read.ok) {
        values.push(read.value);
      } else {
        issues.push(...read.error);
      }
    });
    return issues.length === 0 ? ok(values) : err(issues);
  };
}

export function optional<T>(item: Reader<T>): Reader<T | undefined> {
  return (value, path) =>
    value === undefined || value === null ? ok(undefined) : item(value, path);
}

export function withDefault<T>(item: Reader<T>, fallback: T): Reader<T> {
  return (value, path) =>
    value === undefined || value === null ? ok(fallback) : item(value, path);
}

export function refine<T>(
  item: Reader<T>,
  message: string,
  predicate: (value: T) => boolean,
): Reader<T> {
  return (value, path) => {
    const read = item(value, path);
    if (!read.ok) {
      return read;
    }
    return predicate(read.value) ? read : err(issue(path, message));
  };
}

export type ShapeOf<S> = { [K in keyof S]: S[K] extends Reader<infer T> ? T : never };

/** Read a whole record, collecting every bad field rather than the first. */
export function readRecord<S extends Record<string, Reader<unknown>>>(
  shape: S,
): Reader<ShapeOf<S>> {
  return (value, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return err(issue(path, 'expected an object'));
    }
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const [key, reader] of Object.entries(shape)) {
      const child = path === '' ? key : `${path}.${key}`;
      const read = reader(source[key], child);
      if (read.ok) {
        out[key] = read.value;
      } else {
        issues.push(...read.error);
      }
    }
    return issues.length === 0 ? ok(out as ShapeOf<S>) : err(issues);
  };
}

export function parseWith<T>(reader: Reader<T>, value: unknown): Result<T, Issue[]> {
  return reader(value, '');
}

export function describeIssues(issues: readonly Issue[]): string {
  return issues
    .map((item) => `${item.path === '' ? '<root>' : item.path}: ${item.message}`)
    .join('; ');
}

function wrap<T>(path: string, what: string, read: () => T): Result<T, Issue[]> {
  try {
    return ok(read());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err(issue(path, `expected ${what} (${detail})`));
  }
}
