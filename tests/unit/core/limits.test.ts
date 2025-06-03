import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import {
  LIMITS,
  requireEntryWithin,
  requireIdentifier,
  requireTextWithin,
  requireWithin,
} from '../../../src/core/limits.js';

describe('the limits themselves', () => {
  it('are generous enough that no real record comes near them', () => {
    expect(LIMITS.fieldLength).toBeGreaterThan(1000);
    expect(LIMITS.identifierLength).toBeGreaterThan(20);
    expect(LIMITS.importRows).toBeGreaterThan(10000);
  });
});

describe('checking a number against one', () => {
  it('lets anything inside through', () => {
    expect(() => requireWithin('fieldLength', 'a description', 100)).not.toThrow();
    expect(() => requireWithin('fieldLength', 'a description', LIMITS.fieldLength)).not.toThrow();
  });

  it('says which limit was hit and what the value was', () => {
    expect(() => requireWithin('fieldLength', 'a description', 9999)).toThrow(ValidationError);
    expect(() => requireWithin('fieldLength', 'a description', 9999)).toThrow(
      /a description is 10 thousand and the limit is 4 thousand/,
    );
  });

  it('prints a small number plainly', () => {
    expect(() => requireWithin('identifierLength', 'the id', 100)).toThrow(
      /the id is 100 and the limit is 64/,
    );
  });
});

describe('text', () => {
  it('hands back what it was given', () => {
    expect(requireTextWithin('a note', 'short')).toBe('short');
  });

  it('refuses something far too long', () => {
    expect(() => requireTextWithin('a note', 'x'.repeat(LIMITS.fieldLength + 1))).toThrow(
      ValidationError,
    );
  });
});

describe('identifiers', () => {
  it('trims and hands back', () => {
    expect(requireIdentifier('the id', '  J-14 ')).toBe('J-14');
  });

  it('refuses a blank one', () => {
    expect(() => requireIdentifier('the id', '   ')).toThrow(/must not be blank/);
  });

  it('refuses one that is far too long', () => {
    expect(() => requireIdentifier('the id', 'J'.repeat(100))).toThrow(ValidationError);
  });

  it('refuses a control character, which would break every printed table', () => {
    expect(() => requireIdentifier('the id', 'J-14\nJ-15')).toThrow(/control character/);
    expect(() => requireIdentifier('the id', 'J-14\tJ-15')).toThrow(/control character/);
  });
});

describe('journal entries', () => {
  it('lets an ordinary payload through', () => {
    expect(() => requireEntryWithin('weld.logged', { id: 'L-1', joint: 'J-14' })).not.toThrow();
  });

  it('refuses one that would fill the share', () => {
    expect(() =>
      requireEntryWithin('weld.logged', { note: 'x'.repeat(LIMITS.entryBytes) }),
    ).toThrow(/the payload of a weld.logged entry/);
  });

  it('counts bytes rather than characters', () => {
    const wide = '\u00e9'.repeat(LIMITS.entryBytes / 2);
    expect(() => requireEntryWithin('weld.logged', { note: wide })).toThrow(ValidationError);
  });
});
