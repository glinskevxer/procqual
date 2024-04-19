import { describe, expect, it } from 'vitest';

import { StorageError, ValidationError } from '../../../src/core/errors.js';
import {
  entriesOfType,
  GENESIS_HASH,
  hashEntry,
  MemoryJournal,
  requireIntact,
  verifyChain,
  type JournalEntry,
} from '../../../src/store/journal.js';

const write = (journal: MemoryJournal, type: string, payload: Record<string, unknown> = {}) =>
  journal.append({ type, actor: 'kd', payload, at: '2024-04-01T09:00:00.000Z' });

describe('appending', () => {
  it('numbers entries from one', () => {
    const journal = new MemoryJournal();
    expect(write(journal, 'pqr.recorded').sequence).toBe(1);
    expect(write(journal, 'wps.issued').sequence).toBe(2);
    expect(journal.length()).toBe(2);
  });

  it('freezes the payload it was handed', () => {
    const journal = new MemoryJournal();
    const payload = { id: 'PQR-1' };
    const entry = write(journal, 'pqr.recorded', payload);
    payload.id = 'PQR-2';
    expect(entry.payload['id']).toBe('PQR-1');
    expect(Object.isFrozen(entry.payload)).toBe(true);
  });

  it('needs a type and an actor', () => {
    const journal = new MemoryJournal();
    expect(() => journal.append({ type: ' ', actor: 'kd', payload: {}, at: 'now' })).toThrow(
      ValidationError,
    );
    expect(() => journal.append({ type: 'x', actor: '', payload: {}, at: 'now' })).toThrow(
      /needs an actor/,
    );
  });

  it('starts from the genesis hash and chains from there', () => {
    const journal = new MemoryJournal();
    expect(journal.headHash()).toBe(GENESIS_HASH);
    const first = write(journal, 'a');
    expect(journal.headHash()).toBe(first.hash);
    const second = write(journal, 'b');
    expect(second.hash).not.toBe(first.hash);
  });

  it('gives two identical entries different hashes because of their position', () => {
    const journal = new MemoryJournal();
    const first = write(journal, 'same', { value: 1 });
    const second = write(journal, 'same', { value: 1 });
    expect(first.hash).not.toBe(second.hash);
  });
});

describe('reading', () => {
  it('reads from a sequence number', () => {
    const journal = new MemoryJournal();
    write(journal, 'a');
    write(journal, 'b');
    write(journal, 'c');
    expect(journal.read().map((entry) => entry.type)).toEqual(['a', 'b', 'c']);
    expect(journal.read(2).map((entry) => entry.type)).toEqual(['b', 'c']);
    expect(journal.read(9)).toEqual([]);
  });

  it('refuses a sequence below one', () => {
    expect(() => new MemoryJournal().read(0)).toThrow(ValidationError);
  });

  it('picks out entries of one type', () => {
    const journal = new MemoryJournal();
    write(journal, 'weld.logged');
    write(journal, 'nde.filed');
    write(journal, 'weld.logged');
    expect(entriesOfType(journal.read(), 'weld.logged')).toHaveLength(2);
  });

  it('restores from entries it was given', () => {
    const source = new MemoryJournal();
    write(source, 'a');
    write(source, 'b');
    const restored = new MemoryJournal(source.read());
    expect(restored.length()).toBe(2);
    expect(restored.headHash()).toBe(source.headHash());
    expect(write(restored, 'c').sequence).toBe(3);
  });
});

describe('integrity', () => {
  const build = () => {
    const journal = new MemoryJournal();
    write(journal, 'a', { n: 1 });
    write(journal, 'b', { n: 2 });
    write(journal, 'c', { n: 3 });
    return [...journal.read()];
  };

  it('passes a journal nobody has touched', () => {
    expect(verifyChain(build())).toEqual([]);
    expect(() => requireIntact(build())).not.toThrow();
    expect(verifyChain([])).toEqual([]);
  });

  it('catches an edited payload', () => {
    const entries = build();
    const tampered: JournalEntry[] = [...entries];
    const second = entries[1];
    if (second !== undefined) {
      tampered[1] = { ...second, payload: { n: 99 } };
    }
    const problems = verifyChain(tampered);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toBe('broken-chain');
    expect(problems[0]?.sequence).toBe(2);
  });

  it('catches a removed entry', () => {
    const entries = build();
    const problems = verifyChain([entries[0]!, entries[2]!]);
    expect(problems.map((item) => item.problem)).toContain('out-of-order');
  });

  it('catches an entry rewritten to a different actor', () => {
    const entries = build();
    const rewritten = [...entries];
    rewritten[0] = { ...entries[0]!, actor: 'someone else' };
    expect(verifyChain(rewritten)[0]?.problem).toBe('broken-chain');
  });

  it('throws with the first problem when asked to insist', () => {
    const entries = build();
    const tampered = [...entries];
    tampered[1] = { ...entries[1]!, at: '2025-01-01T00:00:00.000Z' };
    expect(() => requireIntact(tampered)).toThrow(StorageError);
    expect(() => requireIntact(tampered)).toThrow(/altered at entry 2/);
  });

  it('hashes the same body to the same value every time', () => {
    const body = {
      sequence: 1,
      at: '2024-04-01T09:00:00.000Z',
      type: 'a',
      actor: 'kd',
      payload: { n: 1 },
    };
    expect(hashEntry(GENESIS_HASH, body)).toBe(hashEntry(GENESIS_HASH, body));
    expect(hashEntry('other', body)).not.toBe(hashEntry(GENESIS_HASH, body));
  });
});
