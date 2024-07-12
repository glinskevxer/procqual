import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { sampleQualification } from '../support/welders.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-06-01T09:00:00.000Z'), actor: 'kd' });
});

describe('arc welders add', () => {
  it('puts a welder on the register', async () => {
    const { out, result } = await invoke(
      'welders',
      'add',
      'w118',
      'R Ashworth',
      '--from',
      '2019-04-01',
    );
    expect(result.code).toBe(0);
    expect(out.text()).toBe('W-118 added');
    expect(context.workspace().personnel.welders()).toHaveLength(1);
  });

  it('refuses a stencil it cannot read', async () => {
    const { out, result } = await invoke(
      'welders',
      'add',
      '118',
      'R Ashworth',
      '--from',
      '2019-04-01',
    );
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a welder stencil');
  });

  it('refuses a date it cannot read', async () => {
    const { result } = await invoke('welders', 'add', 'W-118', 'R Ashworth', '--from', 'April');
    expect(result.code).toBe(2);
  });

  it('refuses the same welder twice', async () => {
    await invoke('welders', 'add', 'W-118', 'R Ashworth', '--from', '2019-04-01');
    const { out, result } = await invoke(
      'welders',
      'add',
      'W-118',
      'R Ashworth',
      '--from',
      '2019-04-01',
    );
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('already on the register');
  });
});

describe('arc welders list', () => {
  beforeEach(async () => {
    await invoke('welders', 'add', 'W-118', 'R Ashworth', '--from', '2019-04-01');
    await invoke('welders', 'add', 'W-205', 'T Naylor', '--from', '2021-09-06');
  });

  it('lists them in stencil order with their coupon counts', async () => {
    const { out } = await invoke('welders', 'list');
    expect(out.text()).toContain('Welder register at 2024-06-01');
    expect(out.text()).toMatch(/^W-118\s+R Ashworth\s+2019-04-01\s+0$/m);
    expect(out.text()).toMatch(/^W-205\s+T Naylor\s+2021-09-06\s+0$/m);
  });

  it('shows a leaving date once one is recorded', async () => {
    await invoke('welders', 'left', 'W-205', '--on', '2024-05-31');
    const { out } = await invoke('welders', 'list');
    expect(out.text()).toMatch(/^W-205\s+T Naylor\s+2021-09-06\s+2024-05-31\s+0$/m);
  });

  it('says so when the register is empty', async () => {
    context = memoryContext({ clock: new FixedClock('2024-06-01T09:00:00.000Z') });
    const { out } = await invoke('welders', 'list');
    expect(out.text()).toContain('nobody on the register');
  });
});

describe('arc welders continuity', () => {
  beforeEach(async () => {
    await invoke('welders', 'add', 'W-118', 'R Ashworth', '--from', '2019-04-01');
    context.workspace().personnel.recordQualification(sampleQualification(), '1', 'kd');
  });

  it('shows the clock for every coupon', async () => {
    const { out } = await invoke('welders', 'continuity');
    expect(out.text()).toContain('Continuity at 2024-06-01');
    expect(out.text()).toMatch(/W-118\s+WPQ-0231\s+SMAW\s+current\s+2024-01-16\s+2024-07-16\s+45/);
  });

  it('moves the clock when a use is recorded', async () => {
    await invoke('welders', 'used', 'W-118', 'smaw', '--on', '2024-05-20');
    const { out } = await invoke('welders', 'continuity');
    expect(out.text()).toContain('2024-11-20');
  });

  it('reads the register as it stood on another day', async () => {
    const { out } = await invoke('welders', 'continuity', '--on', '2024-09-01');
    expect(out.text()).toContain('lapsed');
    expect(out.text()).toContain('1 coupon lapsed');
  });

  it('narrows to the ones lapsing inside a window', async () => {
    const empty = await invoke('welders', 'continuity', '--due', '10');
    expect(empty.out.text()).toContain('no coupons on the register');
    const soon = await invoke('welders', 'continuity', '--due', '60');
    expect(soon.out.text()).toContain('WPQ-0231');
  });

  it('refuses a process the shop does not run when recording a use', async () => {
    const { result, out } = await invoke('welders', 'used', 'W-118', 'EBW', '--on', '2024-05-20');
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a process this shop runs');
  });

  it('refuses a use for a welder nobody holds', async () => {
    const { result } = await invoke('welders', 'used', 'W-999', 'SMAW', '--on', '2024-05-20');
    expect(result.code).toBe(2);
  });
});
