import { describe, expect, it } from 'vitest';

import { date } from '../../../src/core/plainDate.js';
import {
  busyDays,
  entriesBetween,
  summariseActors,
  summariseDays,
  weekendDays,
} from '../../../src/reporting/auditTrail.js';
import { MemoryJournal, type JournalEntry } from '../../../src/store/journal.js';

const build = (rows: readonly (readonly [string, string, string])[]): JournalEntry[] => {
  const journal = new MemoryJournal();
  for (const [at, actor, type] of rows) {
    journal.append({ at, actor, type, payload: {} });
  }
  return [...journal.read()];
};

const entries = build([
  ['2025-03-10T08:00:00.000Z', 'kd', 'welder.registered'],
  ['2025-03-10T09:00:00.000Z', 'kd', 'joint.mapped'],
  ['2025-03-11T09:00:00.000Z', 'qa', 'examination.filed'],
  ['2025-03-15T09:00:00.000Z', 'kd', 'weld.logged'],
  ['2025-03-16T09:00:00.000Z', 'foreman', 'weld.logged'],
]);

describe('by actor', () => {
  const summary = summariseActors(entries);

  it('counts what each of them wrote, busiest first', () => {
    expect(summary.map((row) => row.actor)).toEqual(['kd', 'foreman', 'qa']);
    expect(summary[0]?.entries).toBe(3);
  });

  it('lists the kinds of entry each of them wrote', () => {
    expect(summary[0]?.types).toEqual(['joint.mapped', 'weld.logged', 'welder.registered']);
  });

  it('carries the first and last time each of them wrote', () => {
    expect(summary[0]?.firstAt).toBe('2025-03-10T08:00:00.000Z');
    expect(summary[0]?.lastAt).toBe('2025-03-15T09:00:00.000Z');
  });

  it('has nothing to say about an empty journal', () => {
    expect(summariseActors([])).toEqual([]);
  });
});

describe('by day', () => {
  const days = summariseDays(entries);

  it('counts the entries on each day, oldest first', () => {
    expect(days.map((row) => row.day)).toEqual([
      '2025-03-10',
      '2025-03-11',
      '2025-03-15',
      '2025-03-16',
    ]);
    expect(days[0]?.entries).toBe(2);
  });

  it('names who wrote on each day', () => {
    expect(days[0]?.actors).toEqual(['kd']);
  });

  it('picks out the weekends', () => {
    expect(weekendDays(days).map((row) => row.day)).toEqual(['2025-03-15', '2025-03-16']);
  });

  it('ignores a day it cannot read', () => {
    const broken = summariseDays(build([['whenever', 'kd', 'a']]));
    expect(weekendDays(broken)).toEqual([]);
  });
});

describe('the busy days', () => {
  it('finds a day far above the usual', () => {
    const lumpy = summariseDays(
      build([
        ['2025-03-10T08:00:00.000Z', 'kd', 'a'],
        ['2025-03-11T08:00:00.000Z', 'kd', 'a'],
        ...Array.from(
          { length: 20 },
          (_unused, index) =>
            [`2025-03-12T08:00:${String(index).padStart(2, '0')}.000Z`, 'kd', 'a'] as const,
        ),
      ]),
    );
    expect(busyDays(lumpy).map((row) => row.day)).toEqual(['2025-03-12']);
  });

  it('finds none on an even journal', () => {
    expect(busyDays(summariseDays(entries))).toEqual([]);
    expect(busyDays([])).toEqual([]);
  });
});

describe('a window', () => {
  it('includes both ends', () => {
    const found = entriesBetween(entries, date('2025-03-11'), date('2025-03-15'));
    expect(found).toHaveLength(2);
  });

  it('leaves out an entry whose timestamp will not read', () => {
    expect(
      entriesBetween(build([['whenever', 'kd', 'a']]), date('2000-01-01'), date('2030-01-01')),
    ).toEqual([]);
  });
});
