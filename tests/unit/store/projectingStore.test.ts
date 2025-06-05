import { describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { MemoryJournal, type JournalEntry } from '../../../src/store/journal.js';
import { ProjectingStore } from '../../../src/store/projectingStore.js';

interface Counter {
  seen: string[];
  rebuilds: number;
}

class CountingStore extends ProjectingStore<Counter> {
  rebuilds = 0;

  protected empty(): Counter {
    this.rebuilds += 1;
    return { seen: [], rebuilds: this.rebuilds };
  }

  protected apply(projection: Counter, entry: JournalEntry): void {
    if (entry.type === 'counted') {
      projection.seen.push(String(entry.payload.what));
    }
  }

  seen(): readonly string[] {
    return this.projection().seen;
  }

  count(what: string, actor: string): void {
    this.write('counted', actor, { what });
  }

  rebuildCount(): number {
    return this.projection().rebuilds;
  }
}

const build = () => {
  const journal = new MemoryJournal();
  return { journal, store: new CountingStore(journal, new FixedClock('2024-10-01T09:00:00.000Z')) };
};

describe('replaying', () => {
  it('folds every entry in, in order', () => {
    const { store } = build();
    store.count('a', 'kd');
    store.count('b', 'kd');
    expect(store.seen()).toEqual(['a', 'b']);
  });

  it('ignores entry types it does not know', () => {
    const { journal, store } = build();
    journal.append({
      type: 'something.else',
      actor: 'kd',
      payload: {},
      at: '2024-10-01T09:00:00.000Z',
    });
    store.count('a', 'kd');
    expect(store.seen()).toEqual(['a']);
  });
});

describe('the cache', () => {
  it('does not rebuild while the journal has not moved', () => {
    const { store } = build();
    store.count('a', 'kd');
    const first = store.rebuildCount();
    store.seen();
    store.seen();
    expect(store.rebuildCount()).toBe(first);
  });

  it('does not rebuild after a write either, it extends', () => {
    const { store } = build();
    store.count('a', 'kd');
    const first = store.rebuildCount();
    store.count('b', 'kd');
    expect(store.seen()).toEqual(['a', 'b']);
    expect(store.rebuildCount()).toBe(first);
  });

  it('rebuilds when the journal moves underneath it', () => {
    const { journal, store } = build();
    store.count('a', 'kd');
    journal.append({
      type: 'counted',
      actor: 'someone else',
      payload: { what: 'b' },
      at: '2024-10-01T09:05:00.000Z',
    });
    expect(store.seen()).toEqual(['a', 'b']);
  });
});

describe('the history', () => {
  it('hands back the entries themselves', () => {
    const { store } = build();
    store.count('a', 'kd');
    expect(store.history().map((entry) => entry.type)).toEqual(['counted']);
    expect(store.history()[0]?.actor).toBe('kd');
  });
});
