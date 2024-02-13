import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { expect as unwrap } from '../../../src/core/result.js';
import {
  describeIssues,
  optional,
  parseWith,
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
  readString,
  refine,
  withDefault,
} from '../../../src/core/schema.js';

describe('scalar readers', () => {
  it('reads a string', () => {
    expect(parseWith(readString, 'hello')).toEqual({ ok: true, value: 'hello' });
    expect(parseWith(readString, 4).ok).toBe(false);
  });

  it('trims and refuses a blank string', () => {
    expect(unwrap(parseWith(readNonEmptyString, '  J-14 '), 'read')).toBe('J-14');
    expect(parseWith(readNonEmptyString, '   ').ok).toBe(false);
    expect(parseWith(readNonEmptyString, 7).ok).toBe(false);
  });

  it('reads an integer from a number or a string of digits', () => {
    expect(unwrap(parseWith(readInteger, 12), 'read')).toBe(12);
    expect(unwrap(parseWith(readInteger, ' -3 '), 'read')).toBe(-3);
    expect(parseWith(readInteger, 1.5).ok).toBe(false);
    expect(parseWith(readInteger, '1.5').ok).toBe(false);
  });

  it('reads a boolean written several ways', () => {
    expect(unwrap(parseWith(readBoolean, true), 'read')).toBe(true);
    expect(unwrap(parseWith(readBoolean, 'yes'), 'read')).toBe(true);
    expect(unwrap(parseWith(readBoolean, 'no'), 'read')).toBe(false);
    expect(parseWith(readBoolean, 'maybe').ok).toBe(false);
  });
});

describe('domain readers', () => {
  it('reads a decimal from text, a number or itself', () => {
    expect(unwrap(parseWith(readDecimal, '0.375'), 'read').toString()).toBe('0.375');
    expect(unwrap(parseWith(readDecimal, 0.5), 'read').toString()).toBe('0.5');
    expect(unwrap(parseWith(readDecimal, decimal('2')), 'read').toString()).toBe('2');
    expect(parseWith(readDecimal, 'thick').ok).toBe(false);
  });

  it('reads a length in any of the notations the shop uses', () => {
    expect(unwrap(parseWith(readLength, '3/8'), 'read').toFraction()).toBe('3/8');
    expect(unwrap(parseWith(readLength, '12.7 mm'), 'read').toFraction()).toBe('1/2');
    expect(unwrap(parseWith(readLength, 0.25), 'read').toFraction()).toBe('1/4');
  });

  it('reads a date and a document number', () => {
    expect(unwrap(parseWith(readDate, '2024-06-01'), 'read').toString()).toBe('2024-06-01');
    expect(unwrap(parseWith(readDocumentNumber, 'PQR-17'), 'read').key()).toBe('PQR-17');
  });

  it('names the field and quotes the underlying complaint', () => {
    const read = parseWith(readLength, 'thick');
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(describeIssues(read.error)).toMatch(/expected a length/);
    }
  });

  it('reads a value from a fixed set', () => {
    const reader = readOneOf(['SMAW', 'GTAW', 'GMAW'] as const);
    expect(unwrap(parseWith(reader, 'GTAW'), 'read')).toBe('GTAW');
    const bad = parseWith(reader, 'EBW');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error[0]?.message).toBe('expected one of SMAW, GTAW, GMAW');
    }
  });
});

describe('combinators', () => {
  it('reads a list and reports the index of a bad element', () => {
    const reader = readArray(readInteger);
    expect(unwrap(parseWith(reader, [1, 2, 3]), 'read')).toEqual([1, 2, 3]);
    const bad = parseWith(reader, [1, 'two', 3.5]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.map((item) => item.path)).toEqual(['[1]', '[2]']);
    }
    expect(parseWith(reader, 'not a list').ok).toBe(false);
  });

  it('lets a field be missing', () => {
    const reader = optional(readString);
    expect(unwrap(parseWith(reader, undefined), 'read')).toBeUndefined();
    expect(unwrap(parseWith(reader, null), 'read')).toBeUndefined();
    expect(unwrap(parseWith(reader, 'x'), 'read')).toBe('x');
  });

  it('supplies a default', () => {
    const reader = withDefault(readInteger, 3);
    expect(unwrap(parseWith(reader, undefined), 'read')).toBe(3);
    expect(unwrap(parseWith(reader, 9), 'read')).toBe(9);
  });

  it('refines a value that reads correctly but is still wrong', () => {
    const reader = refine(readInteger, 'must be positive', (value) => value > 0);
    expect(unwrap(parseWith(reader, 4), 'read')).toBe(4);
    const bad = parseWith(reader, -1);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error[0]?.message).toBe('must be positive');
    }
  });
});

describe('records', () => {
  const reader = readRecord({
    id: readDocumentNumber,
    process: readOneOf(['SMAW', 'GTAW'] as const),
    thickness: readLength,
    welded: readDate,
    passes: withDefault(readInteger, 1),
    note: optional(readNonEmptyString),
  });

  it('reads a whole record into domain types', () => {
    const value = unwrap(
      parseWith(reader, {
        id: 'PQR-0042',
        process: 'GTAW',
        thickness: '3/8',
        welded: '2024-03-01',
      }),
      'read',
    );
    expect(value.id.key()).toBe('PQR-0042');
    expect(value.process).toBe('GTAW');
    expect(value.thickness.toFraction()).toBe('3/8');
    expect(value.passes).toBe(1);
    expect(value.note).toBeUndefined();
  });

  it('collects every bad field instead of stopping at the first', () => {
    const read = parseWith(reader, {
      id: 'nope',
      process: 'EBW',
      thickness: '3/8',
      welded: 'yesterday',
    });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.map((item) => item.path)).toEqual(['id', 'process', 'welded']);
      expect(describeIssues(read.error)).toContain('process: expected one of');
    }
  });

  it('refuses something that is not an object', () => {
    expect(parseWith(reader, []).ok).toBe(false);
    expect(parseWith(reader, null).ok).toBe(false);
    expect(parseWith(reader, 'record').ok).toBe(false);
  });

  it('builds nested paths', () => {
    const nested = readRecord({ coupon: readRecord({ thickness: readLength }) });
    const read = parseWith(nested, { coupon: { thickness: 'thick' } });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error[0]?.path).toBe('coupon.thickness');
    }
  });

  it('renders the root path readably', () => {
    expect(describeIssues([{ path: '', message: 'expected an object' }])).toBe(
      '<root>: expected an object',
    );
  });
});
