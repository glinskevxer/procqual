import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { StorageError } from '../core/errors.js';
import {
  GENESIS_HASH,
  hashEntry,
  requireIntact,
  type Journal,
  type JournalEntry,
  type NewEntry,
} from './journal.js';

/**
 * The journal on disk, one JSON object to a line.
 *
 * Line delimited JSON is chosen over anything cleverer for one reason: a
 * half written line at the end of the file is recoverable by throwing that
 * line away, and everything before it is still readable by eye with the tools
 * that are already on a works PC. A binary format that corrupts on a power cut
 * during a shift is worth nothing at all in a shop.
 *
 * Reading verifies the hash chain and refuses to open a file that has been
 * edited. Recovering from a torn tail is a different thing from accepting an
 * edited middle, and only the first is forgiven.
 *
 * The lines go out as they are written and the fsync is left until the caller
 * says it is finished. Syncing every line was the first thing here and it cost
 * a fifth of a second an entry on a network share, which turned an import of a
 * year's weld log into an afternoon. The unit that matters is the command, not
 * the line: a machine that dies halfway through one loses the whole command
 * rather than half of it, which is the better of the two ways to lose it.
 */

export interface FileJournalOptions {
  /** Discard a trailing line that does not parse rather than refusing to open. */
  readonly tolerateTornTail?: boolean | undefined;
}

export class FileJournal implements Journal {
  private readonly path: string;
  private readonly entries: JournalEntry[];
  private discardedTail = false;
  private unsynced = false;

  constructor(path: string, options: FileJournalOptions = {}) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    const loaded = existsSync(path) ? readEntries(path, options) : { entries: [], torn: false };
    this.entries = loaded.entries;
    this.discardedTail = loaded.torn;
    requireIntact(this.entries);
    if (this.discardedTail) {
      // Leaving the torn text in place would put it in the middle of the file
      // as soon as the next entry is appended, and a middle is never forgiven.
      truncateTo(path, this.entries);
    }
  }

  static open(
    directory: string,
    name = 'journal.ndjson',
    options: FileJournalOptions = {},
  ): FileJournal {
    return new FileJournal(join(directory, name), options);
  }

  append(entry: NewEntry): JournalEntry {
    const sequence = this.entries.length + 1;
    const body = {
      sequence,
      at: entry.at,
      type: entry.type,
      actor: entry.actor,
      payload: Object.freeze({ ...entry.payload }),
    };
    const written: JournalEntry = { ...body, hash: hashEntry(this.headHash(), body) };
    appendFileSync(this.path, `${JSON.stringify(written)}\n`, 'utf8');
    this.unsynced = true;
    this.entries.push(written);
    return written;
  }

  read(fromSequence = 1): readonly JournalEntry[] {
    return this.entries.slice(Math.max(0, fromSequence - 1));
  }

  length(): number {
    return this.entries.length;
  }

  headHash(): string {
    return this.entries[this.entries.length - 1]?.hash ?? GENESIS_HASH;
  }

  /** Push everything written so far as far as the disk will take it. */
  flush(): void {
    if (!this.unsynced) {
      return;
    }
    const handle = openSync(this.path, 'r+');
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    this.unsynced = false;
  }

  /** True when a partly written last line was thrown away on opening. */
  recoveredFromTornTail(): boolean {
    return this.discardedTail;
  }

  /** Rewrite the file from the entries held, used after a compaction. */
  rewrite(entries: readonly JournalEntry[]): void {
    requireIntact(entries);
    const temporary = `${this.path}.rewrite`;
    writeFileSync(
      temporary,
      `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      'utf8',
    );
    renameSync(temporary, this.path);
    this.entries.length = 0;
    this.entries.push(...entries);
    this.unsynced = true;
    this.flush();
  }
}

interface LoadedJournal {
  entries: JournalEntry[];
  torn: boolean;
}

function readEntries(path: string, options: FileJournalOptions): LoadedJournal {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const entries: JournalEntry[] = [];
  let torn = false;
  lines.forEach((line, index) => {
    try {
      entries.push(JSON.parse(line) as JournalEntry);
    } catch (error) {
      const isLast = index === lines.length - 1;
      if (isLast && options.tolerateTornTail === true) {
        torn = true;
        return;
      }
      throw new StorageError(`journal line ${index + 1} is not readable`, {
        path,
        line: index + 1,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { entries, torn };
}

function truncateTo(path: string, entries: readonly JournalEntry[]): void {
  const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
  writeFileSync(path, entries.length === 0 ? '' : `${body}\n`, 'utf8');
}
