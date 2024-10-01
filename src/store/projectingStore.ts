import type { Clock } from '../core/clock.js';
import type { Journal, JournalEntry } from './journal.js';

/**
 * The half of a store that is the same in every store.
 *
 * Both stores were carrying their own copy of this and the copies had already
 * started to drift: one of them invalidated its cache on write and the other
 * would have, next time somebody added a write method and forgot. The rule
 * being kept is that a projection is derived and never authored, so there is
 * one place that rebuilds it and one place that throws it away.
 */
export abstract class ProjectingStore<TProjection> {
  protected readonly journal: Journal;
  protected readonly clock: Clock;
  private cache: { at: number; projection: TProjection } | undefined;

  constructor(journal: Journal, clock: Clock) {
    this.journal = journal;
    this.clock = clock;
  }

  /** A projection with nothing in it, ready to be replayed onto. */
  protected abstract empty(): TProjection;

  /** Fold one entry in. Unknown types are ignored, not refused. */
  protected abstract apply(projection: TProjection, entry: JournalEntry): void;

  protected projection(): TProjection {
    const length = this.journal.length();
    if (this.cache !== undefined && this.cache.at === length) {
      return this.cache.projection;
    }
    const projection = this.empty();
    for (const entry of this.journal.read()) {
      this.apply(projection, entry);
    }
    this.cache = { at: length, projection };
    return projection;
  }

  protected write(type: string, actor: string, payload: Record<string, unknown>): void {
    this.journal.append({ type, actor, payload, at: this.clock.now().toISOString() });
    this.cache = undefined;
  }

  /** Entries the journal holds, for a report that wants the history itself. */
  history(): readonly JournalEntry[] {
    return this.journal.read();
  }
}
