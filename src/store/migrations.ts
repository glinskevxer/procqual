import { StorageError } from '../core/errors.js';
import { GENESIS_HASH, hashEntry, type JournalEntry } from './journal.js';

/**
 * Moving a journal forward when the shape of an entry changes.
 *
 * The awkward part of an append only journal is that the oldest line in it was
 * written by a version of the program that no longer exists. There are two
 * honest ways to deal with that and this file picks the second.
 *
 * The first is to make every reader cope with every shape that has ever
 * existed. That works for a while and then the readers are unreadable.
 *
 * The second is to rewrite the journal forward, once, when the workspace is
 * opened by a newer build. The entries change and so do their hashes, so the
 * chain is rebuilt, which means the tamper check cannot tell a migration from
 * an edit. That is why the original file is kept beside the new one and why a
 * migration writes an entry of its own saying what it did. The chain proves
 * nobody edited the journal since the last migration, and the migration
 * entries are the record of every time it was legitimately rewritten.
 */

export interface Migration {
  readonly to: number;
  readonly description: string;
  /** Return the entry unchanged, a new payload, or null to drop it. */
  rewrite(entry: JournalEntry): JournalEntry | null;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    to: 2,
    description:
      'welder coupons gained the base metal P number of the coupon, which older entries did not carry',
    rewrite(entry: JournalEntry): JournalEntry | null {
      if (entry.type !== 'wpq.recorded') {
        return entry;
      }
      if (entry.payload.couponPNumber !== undefined) {
        return entry;
      }
      // Every coupon written before this field existed was carbon steel: the
      // shop had no other qualified procedures at the time.
      return { ...entry, payload: { ...entry.payload, couponPNumber: '1' } };
    },
  },
];

export const LATEST_SCHEMA = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.to),
  1,
);

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly entries: readonly JournalEntry[];
  readonly rewritten: number;
  readonly dropped: number;
  readonly applied: readonly Migration[];
}

export function migrationsFrom(version: number): readonly Migration[] {
  return MIGRATIONS.filter((migration) => migration.to > version).sort(
    (left, right) => left.to - right.to,
  );
}

export function migrate(entries: readonly JournalEntry[], fromVersion: number): MigrationResult {
  if (fromVersion > LATEST_SCHEMA) {
    throw new StorageError(
      `the journal is at schema ${fromVersion} and this build only knows ${LATEST_SCHEMA}`,
      { fromVersion, latest: LATEST_SCHEMA },
    );
  }
  const applied = migrationsFrom(fromVersion);
  if (applied.length === 0) {
    return {
      from: fromVersion,
      to: fromVersion,
      entries,
      rewritten: 0,
      dropped: 0,
      applied: [],
    };
  }

  let working = [...entries];
  let rewritten = 0;
  let dropped = 0;
  for (const migration of applied) {
    const next: JournalEntry[] = [];
    for (const entry of working) {
      const result = migration.rewrite(entry);
      if (result === null) {
        dropped += 1;
        continue;
      }
      if (result !== entry) {
        rewritten += 1;
      }
      next.push(result);
    }
    working = next;
  }

  return {
    from: fromVersion,
    to: LATEST_SCHEMA,
    entries: rechain(working),
    rewritten,
    dropped,
    applied,
  };
}

/** Renumber and rehash a rewritten list so the chain adds up again. */
export function rechain(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  const out: JournalEntry[] = [];
  let previous = GENESIS_HASH;
  entries.forEach((entry, index) => {
    const body = {
      sequence: index + 1,
      at: entry.at,
      type: entry.type,
      actor: entry.actor,
      payload: entry.payload,
    };
    const hash = hashEntry(previous, body);
    out.push({ ...body, hash });
    previous = hash;
  });
  return out;
}

export function describeMigration(result: MigrationResult): string {
  if (result.applied.length === 0) {
    return `already at schema ${result.to}`;
  }
  return `schema ${result.from} to ${result.to}: ${result.rewritten} entries rewritten, ${result.dropped} dropped`;
}
