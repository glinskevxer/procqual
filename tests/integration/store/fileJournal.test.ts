import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../../../src/core/errors.js';
import { FileJournal } from '../../../src/store/fileJournal.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-journal-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const write = (journal: FileJournal, type: string, payload: Record<string, unknown> = {}) =>
  journal.append({ type, actor: 'kd', payload, at: '2024-04-20T08:00:00.000Z' });

describe('opening and appending', () => {
  it('creates the file and the directory under it', () => {
    const journal = new FileJournal(join(directory, 'nested', 'journal.ndjson'));
    write(journal, 'a');
    expect(readFileSync(join(directory, 'nested', 'journal.ndjson'), 'utf8')).toMatch(/"type":"a"/);
  });

  it('reads back everything a previous run wrote', () => {
    const first = FileJournal.open(directory);
    write(first, 'pqr.recorded', { id: 'PQR-1' });
    write(first, 'wps.issued', { id: 'WPS-1' });

    const second = FileJournal.open(directory);
    expect(second.length()).toBe(2);
    expect(second.read().map((entry) => entry.type)).toEqual(['pqr.recorded', 'wps.issued']);
    expect(second.headHash()).toBe(first.headHash());
  });

  it('carries on numbering where the previous run stopped', () => {
    const first = FileJournal.open(directory);
    write(first, 'a');
    const second = FileJournal.open(directory);
    expect(write(second, 'b').sequence).toBe(2);
    expect(FileJournal.open(directory).length()).toBe(2);
  });

  it('writes one line for each entry', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    write(journal, 'b');
    const lines = readFileSync(join(directory, 'journal.ndjson'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('a file that has been edited', () => {
  it('refuses to open when an entry has been rewritten', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a', { n: 1 });
    write(journal, 'b', { n: 2 });

    const path = join(directory, 'journal.ndjson');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    lines[0] = lines[0]!.replace('"n":1', '"n":7');
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');

    expect(() => FileJournal.open(directory)).toThrow(StorageError);
    expect(() => FileJournal.open(directory)).toThrow(/altered at entry 1/);
  });

  it('refuses to open when an entry has been deleted from the middle', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    write(journal, 'b');
    write(journal, 'c');

    const path = join(directory, 'journal.ndjson');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    writeFileSync(path, `${lines[0]}\n${lines[2]}\n`, 'utf8');

    expect(() => FileJournal.open(directory)).toThrow(StorageError);
  });
});

describe('a torn last line', () => {
  const tear = () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    write(journal, 'b');
    appendFileSync(join(directory, 'journal.ndjson'), '{"sequence":3,"at":"2024', 'utf8');
  };

  it('is refused by default, because silently losing an entry is worse', () => {
    tear();
    expect(() => FileJournal.open(directory)).toThrow(/journal line 3 is not readable/);
  });

  it('is forgiven when the caller asks for it', () => {
    tear();
    const journal = FileJournal.open(directory, 'journal.ndjson', { tolerateTornTail: true });
    expect(journal.length()).toBe(2);
    expect(journal.recoveredFromTornTail()).toBe(true);
  });

  it('is not reported on a clean file', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    expect(FileJournal.open(directory).recoveredFromTornTail()).toBe(false);
  });

  it('carries on writing after a recovery', () => {
    tear();
    const journal = FileJournal.open(directory, 'journal.ndjson', { tolerateTornTail: true });
    expect(write(journal, 'c').sequence).toBe(3);
    expect(FileJournal.open(directory).length()).toBe(3);
  });
});

describe('rewriting', () => {
  it('replaces the file with a chain it has checked first', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    write(journal, 'b');
    const entries = [...journal.read()];
    journal.rewrite(entries);
    expect(FileJournal.open(directory).length()).toBe(2);
  });

  it('refuses to write a chain that does not add up', () => {
    const journal = FileJournal.open(directory);
    write(journal, 'a');
    const entries = [...journal.read()];
    expect(() => journal.rewrite([{ ...entries[0]!, actor: 'someone else' }])).toThrow(StorageError);
  });
});
