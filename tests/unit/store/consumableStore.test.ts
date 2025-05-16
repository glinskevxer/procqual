import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { issueState, reviewIssue } from '../../../src/fabrication/consumables.js';
import { ConsumableStore } from '../../../src/store/consumableStore.js';
import { MemoryJournal } from '../../../src/store/journal.js';

let journal: MemoryJournal;
let store: ConsumableStore;

const issue = (id: string, at: string, lot = 'LOT-88214') =>
  store.issue(id, 'E7018-1/8', lot, 'OVEN-2', 'W-118', date('2025-05-16'), at, 'store');

beforeEach(() => {
  journal = new MemoryJournal();
  store = new ConsumableStore(journal, new FixedClock('2025-05-16T09:00:00.000Z'));
});

describe('issuing and returning', () => {
  it('records an issue with no prior exposure the first time', () => {
    const written = issue('I-1', '2025-05-16T07:00:00.000Z');
    expect(written.priorExposureHours.toString()).toBe('0');
    expect(store.requireIssue('I-1').issuedTo).toBe('W-118');
  });

  it('refuses the same issue number twice', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    expect(() => issue('I-1', '2025-05-16T08:00:00.000Z')).toThrow(ConflictError);
  });

  it('records the return against the issue', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    store.recordReturn('I-1', '2025-05-16T10:00:00.000Z', 'store');
    expect(store.requireIssue('I-1').returnedAt).toBe('2025-05-16T10:00:00.000Z');
  });

  it('refuses a return against an issue nobody made', () => {
    expect(() => store.recordReturn('I-9', '2025-05-16T10:00:00.000Z', 'store')).toThrow(
      NotFoundError,
    );
  });
});

describe('the exposure clock across a shift change', () => {
  it('carries forward what the lot has already been out for', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    store.recordReturn('I-1', '2025-05-16T10:00:00.000Z', 'store');
    const second = issue('I-2', '2025-05-16T13:00:00.000Z');
    expect(second.priorExposureHours.toString()).toBe('3');
  });

  it('keeps the lots apart', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    store.recordReturn('I-1', '2025-05-16T10:00:00.000Z', 'store');
    const other = issue('I-2', '2025-05-16T13:00:00.000Z', 'LOT-90001');
    expect(other.priorExposureHours.toString()).toBe('0');
  });

  it('does not count an issue that is still out', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    expect(store.exposureOf('E7018-1/8', 'LOT-88214').hours.toString()).toBe('0');
  });

  it('takes a tin past its allowance across two issues', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    store.recordReturn('I-1', '2025-05-16T10:00:00.000Z', 'store');
    const second = issue('I-2', '2025-05-16T13:00:00.000Z');
    expect(issueState(second, '2025-05-16T15:00:00.000Z')).toBe('over-limit');
    expect(reviewIssue(second, '2025-05-16T15:00:00.000Z')[0]?.code).toBe(
      'consumable.over_exposure',
    );
  });
});

describe('the oven log', () => {
  it('keeps every reading in the order it was written', () => {
    store.logOven(
      { oven: 'OVEN-2', at: '2025-05-16T06:00:00.000Z', temperature: fahrenheit('280') },
      'store',
    );
    store.logOven(
      { oven: 'OVEN-3', at: '2025-05-16T06:00:00.000Z', temperature: fahrenheit('180') },
      'store',
    );
    expect(store.readings()).toHaveLength(2);
    expect(store.readings('OVEN-3')[0]?.temperature.toFahrenheit().toString()).toBe('180');
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    issue('I-1', '2025-05-16T07:00:00.000Z');
    store.recordReturn('I-1', '2025-05-16T10:00:00.000Z', 'store');
    store.logOven(
      { oven: 'OVEN-2', at: '2025-05-16T06:00:00.000Z', temperature: fahrenheit('280') },
      'store',
    );
    const rebuilt = new ConsumableStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2025-06-01T09:00:00.000Z'),
    );
    expect(rebuilt.issues()).toHaveLength(1);
    expect(rebuilt.readings()).toHaveLength(1);
    expect(rebuilt.exposureOf('E7018-1/8', 'LOT-88214').hours.toString()).toBe('3');
  });
});
