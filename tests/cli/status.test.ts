import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { inches } from '../../src/core/units.js';
import { sampleJoint } from '../support/joints.js';
import { sampleExamination } from '../support/nde.js';
import { sampleVessel } from '../support/vessels.js';
import { sampleQualification, sampleWelder } from '../support/welders.js';
import { sampleEntry } from '../support/weldLog.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-07-01T09:00:00.000Z'), actor: 'kd' });
});

describe('arc status on an empty shop', () => {
  it('says so on every line', async () => {
    const { out, result } = await invoke('status');
    expect(result.code).toBe(0);
    expect(out.text()).toContain('welders:         0');
    expect(out.text()).toContain('nobody lapses inside the window');
    expect(out.text()).toContain('no vessels on the books');
    expect(out.text()).toContain('nothing outstanding anywhere');
  });
});

describe('arc status with work on', () => {
  beforeEach(() => {
    const workspace = context.workspace();
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.personnel.recordQualification(sampleQualification(), '1', 'kd');
    workspace.vessels.record(sampleVessel(), 'engineer');
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    workspace.fabrication.mapJoint(sampleJoint({ id: 'J-15' }), 'kd');
    workspace.fabrication.logWeld(sampleEntry({ depositThickness: inches('1/2') }), 'foreman');
    workspace.examinations.file(sampleExamination(), 'qa');
    workspace.examinations.file(sampleExamination({ id: 'X-2', method: 'VT' }), 'qa');
  });

  it('counts what is in the workspace', async () => {
    const { out } = await invoke('status');
    expect(out.text()).toContain('welders:         1');
    expect(out.text()).toContain('joints:          2');
    expect(out.text()).toContain('vessels:         1');
  });

  it('shows the welders about to lapse', async () => {
    const { out } = await invoke('status');
    expect(out.text()).toMatch(/^W-118\s+SMAW\s+current\s+2024-07-16\s+15$/m);
  });

  it('counts the finished joints on each vessel', async () => {
    const { out } = await invoke('status');
    expect(out.text()).toMatch(/^V-2201\s+Humber Refinery\s+2\s+1$/m);
  });

  it('reads a later day and shows the lapse', async () => {
    const { out } = await invoke('status', '--on', '2025-03-01');
    expect(out.text()).toContain('lapsed');
  });

  it('narrows the warning window', async () => {
    const { out } = await invoke('status', '--due', '1');
    expect(out.text()).toContain('nobody lapses inside the window');
  });

  it('counts what is outstanding across the shop', async () => {
    const { out } = await invoke('status');
    expect(out.text()).toMatch(/items? outstanding across \d+ areas?, \d+ blocking/);
  });
});
