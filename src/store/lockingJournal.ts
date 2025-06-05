import type { Clock } from '../core/clock.js';
import { acquireLock, releaseLock, type LockHolder } from './lock.js';
import type { Journal, JournalEntry, NewEntry } from './journal.js';

/**
 * A journal that takes the workspace lock before it writes anything.
 *
 * Taking the lock when the workspace opens would be simpler and would be
 * wrong: most commands only read, and a shop where running a report stops
 * everybody else writing would very quickly be a shop where nobody runs
 * reports. The lock is taken on the first append and held until the command
 * finishes, which is the window that actually matters.
 */
export class LockingJournal implements Journal {
  private readonly inner: Journal;
  private readonly directory: string;
  private readonly clock: Clock;
  private readonly actor: string;
  private holder: LockHolder | undefined;

  constructor(inner: Journal, directory: string, clock: Clock, actor: string) {
    this.inner = inner;
    this.directory = directory;
    this.clock = clock;
    this.actor = actor;
  }

  append(entry: NewEntry): JournalEntry {
    if (this.holder === undefined) {
      this.holder = acquireLock(this.directory, { actor: this.actor, now: this.clock.now() });
    }
    return this.inner.append(entry);
  }

  read(fromSequence?: number): readonly JournalEntry[] {
    return this.inner.read(fromSequence);
  }

  length(): number {
    return this.inner.length();
  }

  headHash(): string {
    return this.inner.headHash();
  }

  flush(): void {
    this.inner.flush?.();
  }

  /** True while this journal is the one holding the workspace lock. */
  holdsLock(): boolean {
    return this.holder !== undefined;
  }

  release(): void {
    // Everything written under this lock reaches the disk before the lock
    // goes back, so the next writer never reads a journal this one has not
    // finished putting down.
    this.flush();
    if (this.holder !== undefined) {
      releaseLock(this.directory);
      this.holder = undefined;
    }
  }
}
