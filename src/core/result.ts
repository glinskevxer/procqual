/**
 * A two-branch result used everywhere a rule can legitimately say "no".
 *
 * Almost nothing in this system is exceptional. A procedure that fails to
 * support a range, a welder whose continuity has lapsed, a coupon that fails a
 * bend test: all of those are ordinary answers that a caller has to report,
 * not faults. Exceptions are reserved for programmer error and broken storage.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Apply a function to the success branch, leaving a failure untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Apply a function to the failure branch, leaving a success untouched. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chain a second fallible step onto a successful one. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Unwrap a success or fall back to a supplied value. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Unwrap a success or throw. Only for call sites that have already proved the
 * result is a success, and for test setup.
 */
export function expect<T, E>(result: Result<T, E>, message: string): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`${message}: ${describeError(result.error)}`);
}

/**
 * Collect a list of results into a result of a list. The first failure wins,
 * which is what a caller wants when the items are steps of one operation.
 */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Collect a list of results keeping every failure. Validation wants this one:
 * reporting the first bad field of a form and hiding the other three wastes a
 * round trip.
 */
export function partition<T, E>(
  results: readonly Result<T, E>[],
): {
  values: T[];
  errors: E[];
} {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }
  return { values, errors };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}
