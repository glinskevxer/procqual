import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { inches } from '../../src/core/units.js';
import { sampleJoint } from '../support/joints.js';
import { sampleExamination } from '../support/nde.js';
import { samplePqr } from '../support/pqr.js';
import { sampleEntry } from '../support/weldLog.js';
import { sampleWps } from '../support/wps.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-11-05T09:00:00.000Z'), actor: 'kd' });
  const workspace = context.workspace();
  workspace.fabrication.mapJoint(sampleJoint(), 'kd');
  workspace.fabrication.mapJoint(sampleJoint({ id: 'J-15' }), 'kd');
  workspace.fabrication.logWeld(sampleEntry({ depositThickness: inches('1/2') }), 'foreman');
  workspace.examinations.file(sampleExamination(), 'qa');
  workspace.examinations.file(sampleExamination({ id: 'X-2', method: 'VT' }), 'qa');
  workspace.procedures.recordQualification(samplePqr(), 'kd');
  workspace.procedures.issue(sampleWps(), 'engineer');
});

describe('arc report joints', () => {
  it('shows where every joint has got to', async () => {
    const { out } = await invoke('report', 'joints', 'V-2201');
    expect(out.text()).toContain('Joint status for V-2201');
    expect(out.text()).toMatch(/^J-14\s+accepted\s+1\/2\s+W-118\s+2\s+0$/m);
    expect(out.text()).toMatch(/^J-15\s+mapped/m);
  });

  it('narrows to the unfinished ones', async () => {
    const { out } = await invoke('report', 'joints', 'V-2201', '--outstanding');
    expect(out.text()).toContain('J-15');
    expect(out.text()).not.toMatch(/^J-14\s/m);
  });

  it('says so when there is nothing on the map for that vessel', async () => {
    const { out } = await invoke('report', 'joints', 'V-9999');
    expect(out.text()).toContain('nothing on the weld map');
  });
});

describe('arc report joint', () => {
  it('lists what is left to clear on one joint', async () => {
    const { out } = await invoke('report', 'joint', 'J-15');
    expect(out.text()).toContain('J-15 mapped');
    expect(out.text()).toContain('nothing has been welded into this joint yet');
  });

  it('says so when a joint is finished', async () => {
    const { out } = await invoke('report', 'joint', 'J-14');
    expect(out.text()).toContain('J-14 accepted');
    expect(out.text()).toContain('nothing to report');
  });

  it('refuses a joint nobody mapped', async () => {
    const { result } = await invoke('report', 'joint', 'J-99');
    expect(result.code).toBe(2);
  });
});

describe('arc report package', () => {
  it('breaks the package into sections', async () => {
    const { out } = await invoke('report', 'package', 'V-2201');
    expect(out.text()).toContain('Data package for V-2201');
    expect(out.text()).toContain('weld map and examinations - outstanding');
    expect(out.text()).toContain('material certificates - outstanding');
    expect(out.text()).toContain('outstanding across');
  });

  it('counts what is left', async () => {
    const { out } = await invoke('report', 'package', 'V-2201');
    expect(out.text()).toMatch(/\d+ items outstanding across \d+ sections/);
  });
});

describe('arc report exceptions', () => {
  it('says so when there is nothing outstanding', async () => {
    context = memoryContext({ clock: new FixedClock('2024-11-05T09:00:00.000Z') });
    const { out } = await invoke('report', 'exceptions');
    expect(out.text()).toContain('nothing outstanding');
  });

  it('groups what is wrong by area, worst first', async () => {
    context.workspace().procedures.issue(
      sampleWps({
        number: DocumentNumber.parse('WPS-0900 Rev 0'),
        supportedBy: [],
        pNumbers: [],
      }),
      'engineer',
    );
    const { out } = await invoke('report', 'exceptions');
    expect(out.text()).toContain('Outstanding at 2024-11-05');
    expect(out.text()).toContain('procedures (');
    expect(out.text()).toMatch(/items? outstanding, \d+ of them blocking/);
  });

  it('narrows to one area', async () => {
    context
      .workspace()
      .personnel.registerWelder(
        { stencil: 'W-118', name: 'R Ashworth', employedFrom: date('2019-04-01') },
        'kd',
      );
    const { out } = await invoke('report', 'exceptions', '--area', 'procedures');
    expect(out.text()).not.toContain('welders (');
  });
});
