import { describe, expect, it } from 'vitest';

import { StorageError } from '../../../src/core/errors.js';
import { MemoryJournal, verifyChain, type JournalEntry } from '../../../src/store/journal.js';
import {
  describeMigration,
  LATEST_SCHEMA,
  migrate,
  migrationsFrom,
  rechain,
} from '../../../src/store/migrations.js';

const build = (): JournalEntry[] => {
  const journal = new MemoryJournal();
  journal.append({
    type: 'welder.registered',
    actor: 'kd',
    payload: { stencil: 'W-118', name: 'R Ashworth', employedFrom: '2019-04-01' },
    at: '2024-01-02T09:00:00.000Z',
  });
  journal.append({
    type: 'wpq.recorded',
    actor: 'kd',
    payload: { number: 'WPQ-0231', stencil: 'W-118' },
    at: '2024-01-16T09:00:00.000Z',
  });
  journal.append({
    type: 'process.used',
    actor: 'foreman',
    payload: { stencil: 'W-118', process: 'SMAW', on: '2024-05-02' },
    at: '2024-05-02T09:00:00.000Z',
  });
  return [...journal.read()];
};

describe('choosing what to run', () => {
  it('runs nothing when the journal is already current', () => {
    expect(migrationsFrom(LATEST_SCHEMA)).toEqual([]);
    const result = migrate(build(), LATEST_SCHEMA);
    expect(result.applied).toEqual([]);
    expect(result.entries).toHaveLength(3);
    expect(describeMigration(result)).toContain('already at schema');
  });

  it('runs everything above the version it is given', () => {
    expect(migrationsFrom(1).map((item) => item.to)).toEqual([2]);
  });

  it('refuses a journal from the future', () => {
    expect(() => migrate(build(), LATEST_SCHEMA + 1)).toThrow(StorageError);
    expect(() => migrate(build(), LATEST_SCHEMA + 1)).toThrow(/only knows/);
  });
});

describe('the first migration', () => {
  it('fills the missing field on the entries that need it', () => {
    const result = migrate(build(), 1);
    expect(result.rewritten).toBe(1);
    expect(result.dropped).toBe(0);
    const coupon = result.entries.find((entry) => entry.type === 'wpq.recorded');
    expect(coupon?.payload.couponPNumber).toBe('1');
  });

  it('leaves the other entries alone', () => {
    const result = migrate(build(), 1);
    expect(result.entries[0]?.payload.stencil).toBe('W-118');
    expect(result.entries[2]?.type).toBe('process.used');
  });

  it('does not touch an entry that already carries the field', () => {
    const entries = build().map((entry) =>
      entry.type === 'wpq.recorded'
        ? { ...entry, payload: { ...entry.payload, couponPNumber: '8' } }
        : entry,
    );
    const result = migrate(entries, 1);
    expect(result.rewritten).toBe(0);
    const coupon = result.entries.find((entry) => entry.type === 'wpq.recorded');
    expect(coupon?.payload.couponPNumber).toBe('8');
  });

  it('says what it did', () => {
    expect(describeMigration(migrate(build(), 1))).toBe(
      'schema 1 to 2: 1 entries rewritten, 0 dropped',
    );
  });
});

describe('the chain', () => {
  it('adds up again after a rewrite', () => {
    const result = migrate(build(), 1);
    expect(verifyChain(result.entries)).toEqual([]);
  });

  it('changes the hashes, which is why the original file is kept', () => {
    const original = build();
    const result = migrate(original, 1);
    expect(result.entries[1]?.hash).not.toBe(original[1]?.hash);
    expect(result.entries[2]?.hash).not.toBe(original[2]?.hash);
  });

  it('renumbers from one when entries are dropped', () => {
    const shortened = rechain(build().slice(1));
    expect(shortened.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(verifyChain(shortened)).toEqual([]);
  });

  it('handles an empty journal', () => {
    expect(rechain([])).toEqual([]);
    expect(migrate([], 1).entries).toEqual([]);
  });
});
