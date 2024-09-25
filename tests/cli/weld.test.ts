import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { sampleJoint } from '../support/joints.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const logArgs = (id: string, extra: string[] = []) => [
  'weld',
  'log',
  id,
  '--joint',
  'J-14',
  '--welder',
  'W-118',
  '--process',
  'SMAW',
  '--procedure',
  'WPS-0110',
  '--on',
  '2024-07-02',
  '--consumable',
  'E7018-1/8',
  '--lot',
  'LOT-88214',
  '--deposit',
  '1/4',
  '--foreman',
  'F-2',
  ...extra,
];

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-09-25T09:00:00.000Z'), actor: 'kd' });
  context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
  context.workspace().fabrication.mapJoint(sampleJoint({ id: 'J-15' }), 'kd');
});

describe('arc weld log', () => {
  it('records a run', async () => {
    const { out, result } = await invoke(...logArgs('L-1001'));
    expect(result.code).toBe(0);
    expect(out.text()).toBe('L-1001 logged against J-14');
  });

  it('prints the findings when something is missing', async () => {
    const { out } = await invoke(...logArgs('L-1002', ['--foreman', 'W-118']));
    expect(out.text()).toContain('DEFICIENCY');
    expect(out.text()).toContain('not signed by anyone but the welder');
  });

  it('refuses a joint that is not on the map', async () => {
    const { result, out } = await invoke(...logArgs('L-1003', ['--joint', 'J-99']));
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('no joint with id J-99');
  });

  it('refuses a role it does not know', async () => {
    const { result, out } = await invoke(...logArgs('L-1004', ['--role', 'middle']));
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a weld log role');
  });

  it('refuses a process the shop does not run', async () => {
    const { result } = await invoke(...logArgs('L-1005', ['--process', 'EBW']));
    expect(result.code).toBe(2);
  });
});

describe('arc weld list', () => {
  beforeEach(async () => {
    await invoke(...logArgs('L-1001', ['--role', 'root', '--deposit', '1/8']));
    await invoke(...logArgs('L-1002', ['--role', 'fill', '--deposit', '1/4']));
    await invoke(...logArgs('L-1003', ['--joint', 'J-15']));
  });

  it('lists everything logged', async () => {
    const { out } = await invoke('weld', 'list');
    expect(out.text()).toContain('Weld log');
    expect(out.text()).toMatch(/^L-1001\s+J-14\s+W-118\s+SMAW\s+root/m);
  });

  it('narrows to one joint and totals the deposit', async () => {
    const { out } = await invoke('weld', 'list', '--joint', 'J-14');
    expect(out.text()).toContain('Weld log for J-14');
    expect(out.text()).not.toContain('L-1003');
    expect(out.text()).toContain('3/8 of deposit by 1 welder using SMAW');
  });

  it('says so when nothing is logged', async () => {
    context = memoryContext({ clock: new FixedClock('2024-09-25T09:00:00.000Z') });
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
    const { out } = await invoke('weld', 'list');
    expect(out.text()).toContain('nothing logged');
  });
});

describe('arc weld void', () => {
  beforeEach(async () => {
    await invoke(...logArgs('L-1001'));
  });

  it('takes an entry out of the live list and keeps it on the record', async () => {
    const voided = await invoke('weld', 'void', 'L-1001', '--reason', 'wrong joint');
    expect(voided.out.text()).toBe('L-1001 voided');
    const live = await invoke('weld', 'list');
    expect(live.out.text()).toContain('nothing logged');
    const shown = await invoke('weld', 'list', '--voided');
    expect(shown.out.text()).toMatch(/^L-1001\s+J-14\s+wrong joint$/m);
  });

  it('refuses an entry nobody logged', async () => {
    const { result } = await invoke('weld', 'void', 'L-9999', '--reason', 'x');
    expect(result.code).toBe(2);
  });
});

describe('arc weld trace', () => {
  beforeEach(async () => {
    await invoke(...logArgs('L-1001'));
    await invoke(...logArgs('L-1002', ['--joint', 'J-15']));
    await invoke(...logArgs('L-1003', ['--lot', 'LOT-90001']));
  });

  it('finds every joint a lot went into', async () => {
    const { out } = await invoke('weld', 'trace', 'E7018-1/8', 'LOT-88214');
    expect(out.text()).toContain('is in 2 joints');
    expect(out.text()).toContain('  J-14');
    expect(out.text()).toContain('  J-15');
  });

  it('says so when a lot is not in anything', async () => {
    const { out } = await invoke('weld', 'trace', 'E7018-1/8', 'LOT-00000');
    expect(out.text()).toBe('no joint carries E7018-1/8 lot LOT-00000');
  });

  it('leaves a voided entry out of the trace', async () => {
    await invoke('weld', 'void', 'L-1002', '--reason', 'wrong joint');
    const { out } = await invoke('weld', 'trace', 'E7018-1/8', 'LOT-88214');
    expect(out.text()).toContain('is in 1 joint');
    expect(out.text()).not.toContain('J-15');
  });
});
