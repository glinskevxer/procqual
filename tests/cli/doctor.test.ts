import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContext, memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_STORAGE } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { acquireLock, releaseLock } from '../../src/store/lock.js';
import { sampleJoint } from '../support/joints.js';
import { sampleTechnician } from '../support/nde.js';

let context: Context;
let directory: string;
const clock = new FixedClock('2025-08-04T09:00:00.000Z');

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-doctor-'));
  context = memoryContext({ clock, actor: 'kd' });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc doctor on a quiet workspace', () => {
  it('says everything is in order', async () => {
    const { out, result } = await invoke('doctor');
    expect(result.code).toBe(0);
    expect(out.text()).toContain('Doctor at 2025-08-04');
    expect(out.text()).toMatch(/^journal\s+ok\s+0 entries, chain intact$/m);
    expect(out.text()).toContain('everything the program can check is in order');
  });

  it('reports the policy it is running on', async () => {
    const { out } = await invoke('doctor');
    expect(out.text()).toContain('continuity 6 months, repair window 90 days');
  });
});

describe('arc doctor with something wrong', () => {
  it('stops on work needing a method nobody holds', async () => {
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    const { out } = await invoke('doctor');
    expect(out.text()).toMatch(/^examination cover\s+stop/m);
    expect(out.text()).toContain('needs somebody now');
  });

  it('is content once somebody holds it', async () => {
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    context.workspace().examinations.registerTechnician(sampleTechnician(), 'qa');
    const { out } = await invoke('doctor');
    expect(out.text()).toMatch(/^examination cover\s+ok/m);
  });

  it('counts what is outstanding without stopping on it', async () => {
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    context.workspace().examinations.registerTechnician(sampleTechnician(), 'qa');
    const { out } = await invoke('doctor');
    expect(out.text()).toMatch(/^outstanding\s+(ok|look)/m);
  });
});

describe('arc doctor on a workspace on disk', () => {
  const onDisk = () => createContext({ path: directory, clock, actor: 'kd' });

  beforeEach(() => {
    const created = createContext({ path: directory, create: true, clock, actor: 'kd' });
    created.workspace();
    created.release();
  });

  it('says nobody is writing when the lock is free', async () => {
    const out = new RecordingOutput();
    await run(['doctor'], out, onDisk());
    expect(out.text()).toMatch(/^lock\s+ok\s+nobody is writing$/m);
  });

  it('names whoever holds the lock', async () => {
    acquireLock(directory, { actor: 'T Naylor', now: clock.now() });
    const out = new RecordingOutput();
    await run(['doctor'], out, onDisk());
    expect(out.text()).toContain('held by T Naylor');
    expect(out.text()).toContain('worth a look');
    releaseLock(directory);
  });

  it('refuses to open a workspace whose journal has been altered', async () => {
    const live = createContext({ path: directory, clock, actor: 'kd' });
    live.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    live.release();

    const journalPath = join(directory, 'journal.ndjson');
    writeFileSync(journalPath, readFileSync(journalPath, 'utf8').replace('J-14', 'J-99'), 'utf8');

    const out = new RecordingOutput();
    const result = await run(['doctor'], out, onDisk());
    expect(result.code).toBe(EXIT_STORAGE);
    expect(out.errorText()).toContain('altered at entry');
  });
});
