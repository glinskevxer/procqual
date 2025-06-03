import { ValidationError } from './errors.js';

/**
 * Limits on what will be accepted at all.
 *
 * Nothing here is a security boundary. Anybody who can run this program can
 * already write whatever they like into the journal, and pretending otherwise
 * would be worse than having no limits. What these are for is the accident: a
 * csv exported with the wrong delimiter so every row is one enormous field, a
 * paste that put a whole document into a description, a script in a loop that
 * would otherwise write until the share fills up.
 *
 * Every limit is generous enough that no real record comes near it, and the
 * message says which limit was hit and what the value was, because the first
 * thing anybody asks is whether it was nearly right or wildly wrong.
 */

export const LIMITS = {
  /** A single text field on a record. */
  fieldLength: 4_000,
  /** One journal entry, once encoded. */
  entryBytes: 256_000,
  /** A file handed to an importer. */
  fileBytes: 32_000_000,
  /** Rows in one import. */
  importRows: 50_000,
  /** Identifiers, which are printed into tables and forms. */
  identifierLength: 64,
} as const;

export type LimitName = keyof typeof LIMITS;

export function requireWithin(name: LimitName, field: string, value: number): void {
  const limit = LIMITS[name];
  if (value > limit) {
    throw new ValidationError(
      field,
      `${field} is ${format(value)} and the limit is ${format(limit)}`,
      { limit, value, name },
    );
  }
}

export function requireTextWithin(
  field: string,
  text: string,
  name: LimitName = 'fieldLength',
): string {
  requireWithin(name, field, text.length);
  return text;
}

export function requireIdentifier(field: string, text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') {
    throw new ValidationError(field, `${field} must not be blank`, {});
  }
  requireWithin('identifierLength', field, trimmed.length);
  // Anything that would break a printed table or a journal line. A tab or a
  // newline inside an identifier turns one row of a report into two.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new ValidationError(field, `${field} has a control character in it`, {});
  }
  return trimmed;
}

export function requireEntryWithin(type: string, payload: unknown): void {
  const size = Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8');
  requireWithin('entryBytes', `the payload of a ${type} entry`, size);
}

function format(value: number): string {
  if (value < 1000) {
    return String(value);
  }
  const thousands = value / 1000;
  const rounded = thousands.toFixed(1);
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded} thousand`;
}
