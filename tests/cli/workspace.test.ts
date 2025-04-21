import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContext, memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { sampleJoint } from '../support/joints.js';
import { sampleWelder } from '../support/welders.js';

let context: Context;
let directory: string;
const clock = new FixedClock('2024-11-22T09:00:00.000Z');

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-cli-workspace-'));
  context = memoryContext({ clock, actor: 'kd' });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc workspace init', () => {
  it('creates one on disk', async () => {
    const path = join(directory, 'shop');
    const { out, result } = await invoke('workspace', 'init', path, '--shop', 'bay four');
    expect(result.code).toBe(0);
    expect(out.text()).toContain('workspace created at');
    expect(readFileSync(join(path, 'arc.json'), 'utf8')).toContain('bay four');
  });
});

describe('arc workspace status', () => {
  it('counts what is in it', async () => {
    context.workspace().personnel.registerWelder(sampleWelder(), 'kd');
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    const { out } = await invoke('workspace', 'status');
    expect(out.text()).toContain('welders:          1');
    expect(out.text()).toContain('joints:           1');
    expect(out.text()).toContain('journal entries:  2');
  });
});

describe('arc workspace verify', () => {
  it('passes a journal nobody has touched', async () => {
    context.workspace().personnel.registerWelder(sampleWelder(), 'kd');
    const { out } = await invoke('workspace', 'verify');
    expect(out.text()).toBe('1 entry checked, the chain is intact');
  });

  it('names the entry that was altered', async () => {
    const path = join(directory, 'shop');
    const live = createContext({ path, create: true, clock, actor: 'kd' });
    live.workspace().personnel.registerWelder(sampleWelder(), 'kd');
    live.workspace().personnel.recordUse('W-118', 'SMAW', sampleWelder().employedFrom, 'foreman');

    const journalPath = join(path, 'journal.ndjson');
    const lines = readFileSync(journalPath, 'utf8').trim().split('\n');
    lines[0] = lines[0]!.replace('R Ashworth', 'R Ashworth Jr');
    writeFileSync(journalPath, `${lines.join('\n')}\n`, 'utf8');

    const out = new RecordingOutput();
    const result = await run(
      ['workspace', 'verify'],
      out,
      createContext({ path, clock, actor: 'kd' }),
    );
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('altered at entry 1');
  });
});

describe('arc workspace history', () => {
  beforeEach(() => {
    const workspace = context.workspace();
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.fabrication.mapJoint(sampleJoint(), 'engineer');
  });

  it('lists the journal with a subject against each entry', async () => {
    const { out } = await invoke('workspace', 'history');
    expect(out.text()).toMatch(/^\s*1\s+.*\s+kd\s+welder.registered\s+W-118$/m);
    expect(out.text()).toMatch(/^\s*2\s+.*\s+engineer\s+joint.mapped\s+J-14$/m);
  });

  it('narrows by type and by actor', async () => {
    const byType = await invoke('workspace', 'history', '--type', 'joint.mapped');
    expect(byType.out.text()).toContain('J-14');
    expect(byType.out.text()).not.toContain('W-118');

    const byActor = await invoke('workspace', 'history', '--actor', 'kd');
    expect(byActor.out.text()).toContain('W-118');
    expect(byActor.out.text()).not.toContain('J-14');
  });

  it('shows only the last so many', async () => {
    const { out } = await invoke('workspace', 'history', '--last', '1');
    expect(out.text()).toContain('J-14');
    expect(out.text()).not.toContain('W-118');
  });

  it('says so when nothing matches', async () => {
    const { out } = await invoke('workspace', 'history', '--type', 'nothing.at.all');
    expect(out.text()).toContain('nothing in the journal');
  });
});

describe('arc workspace audit', () => {
  beforeEach(() => {
    const workspace = context.workspace();
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.fabrication.mapJoint(sampleJoint(), 'engineer');
  });

  it('counts what each actor wrote', async () => {
    const { out } = await invoke('workspace', 'audit');
    expect(out.text()).toContain('Who wrote what');
    expect(out.text()).toMatch(/^engineer\s+1\s+/m);
    expect(out.text()).toMatch(/^kd\s+1\s+/m);
  });

  it('says so when the journal is empty', async () => {
    context = memoryContext({ clock, actor: 'kd' });
    const { out } = await invoke('workspace', 'audit');
    expect(out.text()).toContain('nothing in the journal');
  });
});
