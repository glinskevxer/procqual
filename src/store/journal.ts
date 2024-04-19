import { createHash } from 'node:crypto';

import { StorageError, ValidationError } from '../core/errors.js';

/**
 * An append only journal of everything that happened.
 *
 * A quality record is not a current state, it is a history. When an inspector
 * asks why a joint was signed off on a Tuesday, the answer has to be the
 * record as it stood on the Tuesday, not the record as it stands now. So
 * nothing is ever updated in place. Every change is an entry, and the current
 * state is what you get by reading the entries in order.
 *
 * Each entry carries a hash of the entry before it. That does not stop anyone
 * with a text editor from rewriting the file, but it does mean they cannot
 * rewrite one line of it and leave the rest alone, which is the failure this
 * is actually guarding against.
 */

export interface JournalEntry {
  readonly sequence: number;
  /** ISO instant the entry was written. */
  readonly at: string;
  readonly type: string;
  readonly actor: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Hash of this entry chained onto the one before it. */
  readonly hash: string;
}

export interface NewEntry {
  readonly type: string;
  readonly actor: string;
  readonly payload: Record<string, unknown>;
  readonly at: string;
}

export const GENESIS_HASH = '0'.repeat(64);

export interface Journal {
  append(entry: NewEntry): JournalEntry;
  read(fromSequence?: number): readonly JournalEntry[];
  length(): number;
  headHash(): string;
}

export function hashEntry(previousHash: string, entry: Omit<JournalEntry, 'hash'>): string {
  const body = JSON.stringify({
    sequence: entry.sequence,
    at: entry.at,
    type: entry.type,
    actor: entry.actor,
    payload: entry.payload,
  });
  return createHash('sha256').update(`${previousHash}\n${body}`).digest('hex');
}

export class MemoryJournal implements Journal {
  private readonly entries: JournalEntry[] = [];

  constructor(existing: readonly JournalEntry[] = []) {
    for (const entry of existing) {
      this.entries.push(entry);
    }
  }

  append(entry: NewEntry): JournalEntry {
    if (entry.type.trim() === '') {
      throw new ValidationError('type', 'an entry needs a type', {});
    }
    if (entry.actor.trim() === '') {
      throw new ValidationError('actor', 'an entry needs an actor', { type: entry.type });
    }
    const sequence = this.entries.length + 1;
    const body = {
      sequence,
      at: entry.at,
      type: entry.type,
      actor: entry.actor,
      payload: Object.freeze({ ...entry.payload }),
    };
    const written: JournalEntry = { ...body, hash: hashEntry(this.headHash(), body) };
    this.entries.push(written);
    return written;
  }

  read(fromSequence = 1): readonly JournalEntry[] {
    if (fromSequence < 1) {
      throw new ValidationError('fromSequence', 'sequence numbers start at one', { fromSequence });
    }
    return this.entries.slice(fromSequence - 1);
  }

  length(): number {
    return this.entries.length;
  }

  headHash(): string {
    return this.entries[this.entries.length - 1]?.hash ?? GENESIS_HASH;
  }
}

export interface IntegrityProblem {
  readonly sequence: number;
  readonly problem: 'out-of-order' | 'broken-chain';
  readonly detail: string;
}

/**
 * Walk the chain and report every place it does not add up. Returns an empty
 * list for a journal that has not been touched.
 */
export function verifyChain(entries: readonly JournalEntry[]): readonly IntegrityProblem[] {
  const problems: IntegrityProblem[] = [];
  let previousHash = GENESIS_HASH;
  let expected = 1;
  for (const entry of entries) {
    if (entry.sequence !== expected) {
      problems.push({
        sequence: entry.sequence,
        problem: 'out-of-order',
        detail: `expected sequence ${expected}`,
      });
    }
    const recomputed = hashEntry(previousHash, {
      sequence: entry.sequence,
      at: entry.at,
      type: entry.type,
      actor: entry.actor,
      payload: entry.payload,
    });
    if (recomputed !== entry.hash) {
      problems.push({
        sequence: entry.sequence,
        problem: 'broken-chain',
        detail: 'the entry does not hash to its recorded value',
      });
    }
    previousHash = entry.hash;
    expected = entry.sequence + 1;
  }
  return problems;
}

export function requireIntact(entries: readonly JournalEntry[]): void {
  const problems = verifyChain(entries);
  if (problems.length > 0) {
    const first = problems[0];
    throw new StorageError(
      `the journal has been altered at entry ${first?.sequence ?? 0}: ${first?.detail ?? ''}`,
      { problems: problems.length },
    );
  }
}

export function entriesOfType(
  entries: readonly JournalEntry[],
  type: string,
): readonly JournalEntry[] {
  return entries.filter((entry) => entry.type === type);
}
