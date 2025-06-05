import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FixedClock } from '../../src/core/clock.js';
import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import { verifyChain } from '../../src/store/journal.js';
import { Workspace } from '../../src/store/workspace.js';
import { sampleJoint } from '../support/joints.js';
import { sampleEntry } from '../support/weldLog.js';
import { sampleQualification, sampleWelder } from '../support/welders.js';

/**
 * A shop's journal after a couple of years.
 *
 * These are not benchmarks and they do not assert a time. What they assert is
 * that the shape of the work does not change: the projection is rebuilt by
 * replaying every entry, so anything that turns a replay into a nested loop
 * over the entries would show up here as a suite that never finishes rather
 * than as a shop where the morning report takes four minutes.
 *
 * Ten thousand entries is roughly two years of a small shop: one vessel a
 * month, thirty joints on each, three or four log entries a joint, plus the
 * examinations and the register behind them.
 *
 * Writing this file is what turned up the reason it exists. Building it took
 * three and a half minutes, and none of that was the disk: every write threw
 * the projection cache away, so writing the n-th entry replayed all n-1 before
 * it. Ten thousand entries is fifty million apply calls, and the shop would
 * have found that out on the day its journal got big rather than today.
 */

const ENTRIES = 10_000;
const WELDERS = 40;
const JOINTS = 500;

let directory: string;
let workspace: Workspace;

const build = (): void => {
  workspace = Workspace.open(directory, {
    clock: new FixedClock('2025-06-05T09:00:00.000Z'),
    create: true,
    actor: 'load',
  });
  for (let index = 0; index < WELDERS; index += 1) {
    const stencil = `W-${String(100 + index)}`;
    workspace.personnel.registerWelder(sampleWelder({ stencil }), 'load');
    workspace.personnel.recordQualification(
      sampleQualification({ stencil, number: DocumentNumber.of('WPQ', index + 1) }),
      '1',
      'load',
    );
  }
  for (let index = 0; index < JOINTS; index += 1) {
    workspace.fabrication.mapJoint(sampleJoint({ id: `J-${String(index)}` }), 'load');
  }
  let written = workspace.entryCount();
  let entry = 0;
  while (written < ENTRIES) {
    workspace.fabrication.logWeld(
      sampleEntry({
        id: `L-${String(entry)}`,
        joint: `J-${String(entry % JOINTS)}`,
        stencil: `W-${String(100 + (entry % WELDERS))}`,
        weldedOn: date('2025-01-02').addDays(entry % 300),
        depositThickness: inches('1/8'),
      }),
      'load',
    );
    entry += 1;
    written += 1;
  }
  workspace.release();
};

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-load-'));
  build();
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('a journal of ten thousand entries', () => {
  it('is written and read back whole', () => {
    expect(workspace.entryCount()).toBeGreaterThanOrEqual(ENTRIES);
    const reopened = Workspace.open(directory, {
      clock: new FixedClock('2025-06-06T09:00:00.000Z'),
      actor: 'load',
    });
    expect(reopened.entryCount()).toBe(workspace.entryCount());
    expect(reopened.fabrication.joints()).toHaveLength(JOINTS);
    expect(reopened.personnel.welders()).toHaveLength(WELDERS);
  });

  it('stays a readable file rather than becoming an enormous one', () => {
    const size = statSync(join(directory, 'journal.ndjson')).size;
    expect(size).toBeGreaterThan(1_000_000);
    expect(size).toBeLessThan(40_000_000);
  });

  it('verifies its own chain', () => {
    expect(verifyChain(workspace.journal.read())).toEqual([]);
  });

  it('answers a register query without replaying the journal for every welder', () => {
    const entries = workspace.registerEntries();
    expect(entries).toHaveLength(WELDERS);
    expect(entries[0]?.usageDates.length).toBeGreaterThan(0);
  });

  it('answers a joint query on a journal this size', () => {
    expect(workspace.fabrication.entries('J-1').length).toBeGreaterThan(0);
    expect(workspace.fabrication.usageDates('W-100', 'SMAW').length).toBeGreaterThan(0);
  });
});
