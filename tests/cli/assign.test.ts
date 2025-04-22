import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_NOT_FOUND } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { date } from '../../src/core/plainDate.js';
import { sampleJoint } from '../support/joints.js';
import { samplePqr } from '../support/pqr.js';
import { sampleQualification, sampleWelder } from '../support/welders.js';
import { sampleWps } from '../support/wps.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-07-02T09:00:00.000Z'), actor: 'kd' });
  const workspace = context.workspace();
  workspace.fabrication.mapJoint(sampleJoint(), 'kd');
  workspace.procedures.recordQualification(samplePqr(), 'kd');
  workspace.procedures.issue(sampleWps(), 'engineer');
  workspace.personnel.registerWelder(sampleWelder(), 'kd');
  workspace.personnel.recordQualification(sampleQualification({ backing: false }), '1', 'kd');
  workspace.personnel.recordUse('W-118', 'SMAW', date('2024-06-20'), 'foreman');
});

describe('arc assign check', () => {
  it('allows a welder everything agrees on', async () => {
    const { out, result } = await invoke(
      'assign',
      'check',
      'J-14',
      'W-118',
      '--process',
      'SMAW',
      '--consumable',
      'E7018-1/8',
    );
    expect(result.code).toBe(0);
    expect(out.text()).toContain('W-118 on J-14 with WPS-0110 Rev 0 on 2024-07-02');
    expect(out.text()).toContain('allowed');
  });

  it('refuses and counts the reasons', async () => {
    const { out } = await invoke(
      'assign',
      'check',
      'J-14',
      'W-118',
      '--process',
      'SMAW',
      '--consumable',
      'ER308L',
    );
    expect(out.text()).toContain('refused on 1 count');
    expect(out.text()).toContain('not on the standing list');
  });

  it('refuses a lapsed welder on a later date', async () => {
    const { out } = await invoke(
      'assign',
      'check',
      'J-14',
      'W-118',
      '--process',
      'SMAW',
      '--consumable',
      'E7018-1/8',
      '--on',
      '2025-06-01',
    );
    expect(out.text()).toContain('refused');
    expect(out.text()).toContain('more than 6 months ago');
  });

  it('refuses a joint or a welder nobody has recorded', async () => {
    const badJoint = await invoke(
      'assign',
      'check',
      'J-99',
      'W-118',
      '--process',
      'SMAW',
      '--consumable',
      'E7018-1/8',
    );
    expect(badJoint.result.code).toBe(EXIT_NOT_FOUND);
    const badWelder = await invoke(
      'assign',
      'check',
      'J-14',
      'W-999',
      '--process',
      'SMAW',
      '--consumable',
      'E7018-1/8',
    );
    expect(badWelder.result.code).toBe(EXIT_NOT_FOUND);
  });
});

describe('arc assign who', () => {
  it('lists everyone who could take the joint', async () => {
    const { out } = await invoke('assign', 'who', 'J-14', '--process', 'SMAW');
    expect(out.text()).toContain('Welders for J-14 on 2024-07-02');
    expect(out.text()).toMatch(/^W-118\s+R Ashworth$/m);
  });

  it('says so when nobody can', async () => {
    const { out } = await invoke(
      'assign',
      'who',
      'J-14',
      '--process',
      'SMAW',
      '--on',
      '2025-06-01',
    );
    expect(out.text()).toContain('nobody on the register can take this joint today');
  });

  it('says so when the procedure does not offer the process', async () => {
    const { out } = await invoke('assign', 'who', 'J-14', '--process', 'GTAW');
    expect(out.text()).toBe('WPS-0110 Rev 0 does not offer GTAW');
  });
});
