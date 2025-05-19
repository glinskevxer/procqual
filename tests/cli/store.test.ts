import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_CONFLICT, EXIT_NOT_FOUND } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2025-05-19T07:00:00.000Z'), actor: 'store' });
});

describe('arc store out and back', () => {
  it('issues a tin and says how much of the allowance is gone', async () => {
    const { out, result } = await invoke(
      'store',
      'out',
      'I-1',
      'E7018-1/8',
      'LOT-88214',
      '--to',
      'W-118',
      '--oven',
      'OVEN-2',
    );
    expect(result.code).toBe(0);
    expect(out.text()).toContain('I-1 issued with 0 of 4 hours already used');
  });

  it('says so for a consumable with no clock on it', async () => {
    const { out } = await invoke(
      'store',
      'out',
      'I-2',
      'ER70S-6',
      'REEL-1',
      '--to',
      'W-118',
      '--oven',
      'none',
    );
    expect(out.text()).toContain('no exposure clock');
  });

  it('records a return with the hours used', async () => {
    await invoke(
      'store',
      'out',
      'I-1',
      'E7018-1/8',
      'LOT-88214',
      '--to',
      'W-118',
      '--oven',
      'OVEN-2',
      '--at',
      '2025-05-19T07:00:00.000Z',
    );
    const { out } = await invoke('store', 'back', 'I-1', '--at', '2025-05-19T10:00:00.000Z');
    expect(out.text()).toContain('3 hours out, state in-oven');
  });

  it('warns as the allowance runs out', async () => {
    await invoke(
      'store',
      'out',
      'I-1',
      'E7018-1/8',
      'LOT-88214',
      '--to',
      'W-118',
      '--oven',
      'OVEN-2',
      '--at',
      '2025-05-19T00:00:00.000Z',
    );
    const { out } = await invoke('store', 'back', 'I-1', '--at', '2025-05-19T05:00:00.000Z');
    expect(out.text()).toContain('state over-limit');
    expect(out.text()).toContain('goes back for a rebake');
  });

  it('refuses the same issue twice and a return nobody issued', async () => {
    const args = [
      'store',
      'out',
      'I-1',
      'E7018-1/8',
      'LOT-88214',
      '--to',
      'W-118',
      '--oven',
      'OVEN-2',
    ];
    await invoke(...args);
    expect((await invoke(...args)).result.code).toBe(EXIT_CONFLICT);
    expect((await invoke('store', 'back', 'I-9')).result.code).toBe(EXIT_NOT_FOUND);
  });
});

describe('arc store issues', () => {
  it('says so when nothing is out', async () => {
    const { out } = await invoke('store', 'issues');
    expect(out.text()).toContain('nothing is out of the oven');
  });

  it('lists what is out and leaves what went back off', async () => {
    await invoke(
      'store',
      'out',
      'I-1',
      'E7018-1/8',
      'LOT-88214',
      '--to',
      'W-118',
      '--oven',
      'OVEN-2',
    );
    await invoke(
      'store',
      'out',
      'I-2',
      'E7018-1/8',
      'LOT-90001',
      '--to',
      'W-205',
      '--oven',
      'OVEN-2',
    );
    await invoke('store', 'back', 'I-2');
    const listed = await invoke('store', 'issues');
    expect(listed.out.text()).toContain('I-1');
    expect(listed.out.text()).not.toContain('I-2');
    const all = await invoke('store', 'issues', '--all');
    expect(all.out.text()).toContain('I-2');
  });
});

describe('arc store oven', () => {
  it('accepts a reading inside the holding band', async () => {
    const { out } = await invoke('store', 'oven', 'OVEN-2', '280');
    expect(out.text()).toContain('holding band [250 F, 350 F]');
    expect(out.text()).toContain('nothing to report');
  });

  it('reports one outside it', async () => {
    const { out } = await invoke('store', 'oven', 'OVEN-2', '180');
    expect(out.text()).toContain('BLOCKING');
  });

  it('reads a rebake against its own much hotter band', async () => {
    const hot = await invoke('store', 'oven', 'OVEN-4', '750', '--rebake');
    expect(hot.out.text()).toContain('inside the rebake band');
    const cool = await invoke('store', 'oven', 'OVEN-4', '300', '--rebake');
    expect(cool.out.text()).toContain('not a rebake temperature');
  });

  it('lists the log', async () => {
    await invoke('store', 'oven', 'OVEN-2', '280');
    const { out } = await invoke('store', 'ovens');
    expect(out.text()).toMatch(/^OVEN-2\s+\S+\s+280 F\s+yes$/m);
    expect(out.text()).toContain('1 reading logged');
  });
});

describe('arc store controlled', () => {
  it('says which consumables are on the clock and for how long', async () => {
    const { out } = await invoke('store', 'controlled');
    expect(out.text()).toMatch(/^E7018-1\/8\s+yes\s+4$/m);
    expect(out.text()).toMatch(/^ER70S-6\s+no$/m);
  });
});
