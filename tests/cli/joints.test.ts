import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_CONFLICT, EXIT_INPUT, EXIT_NOT_FOUND } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const mapArgs = (id: string, extra: string[] = []) => [
  'joints',
  'map',
  id,
  '--vessel',
  'V-2201',
  '--description',
  'shell course two, longitudinal seam',
  '--category',
  'A',
  '--type',
  '1',
  '--position',
  'vertical',
  '--thickness',
  '1/2',
  '--length',
  '96',
  '--left',
  'SA-516 Gr 70',
  '--right',
  'SA-516 Gr 70',
  '--heat-left',
  'A47213',
  '--heat-right',
  'A47213',
  '--procedure',
  'WPS-0110',
  ...extra,
];

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-09-20T09:00:00.000Z'), actor: 'kd' });
});

describe('arc joints map', () => {
  it('puts a joint on the map and prints its efficiency', async () => {
    const { out, result } = await invoke(...mapArgs('J-14'));
    expect(result.code).toBe(0);
    expect(out.text()).toBe('J-14 category A type 1, full radiography, efficiency 1.00');
  });

  it('prints the findings when the joint is questionable', async () => {
    const { out } = await invoke(...mapArgs('J-15', ['--right', 'SA-240 304L']));
    expect(out.text()).toContain('DEFICIENCY');
    expect(out.text()).toContain('two base metal families');
  });

  it('refuses a category or a construction type it cannot read', async () => {
    const bad = await invoke(...mapArgs('J-16', ['--category', 'E']));
    expect(bad.result.code).toBe(EXIT_INPUT);
    expect(bad.out.errorText()).toContain('not a joint category');
    const worse = await invoke(...mapArgs('J-17', ['--type', '9']));
    expect(worse.result.code).toBe(EXIT_INPUT);
  });

  it('refuses an examination level it cannot read', async () => {
    const { result, out } = await invoke(...mapArgs('J-18', ['--radiography', 'partial']));
    expect(result.code).toBe(EXIT_INPUT);
    expect(out.errorText()).toContain('not an examination level');
  });

  it('refuses the same joint twice', async () => {
    await invoke(...mapArgs('J-14'));
    const { result } = await invoke(...mapArgs('J-14'));
    expect(result.code).toBe(EXIT_CONFLICT);
  });
});

describe('arc joints list', () => {
  beforeEach(async () => {
    await invoke(...mapArgs('J-14'));
    await invoke(...mapArgs('J-20', ['--vessel', 'V-3300', '--radiography', 'spot']));
  });

  it('lists the map with the efficiency worked out', async () => {
    const { out } = await invoke('joints', 'list');
    expect(out.text()).toMatch(/^J-14\s+V-2201\s+A\s+1\s+1\/2\s+full\s+1\.00\s+WPS-0110$/m);
    expect(out.text()).toMatch(/^J-20\s+V-3300\s+A\s+1\s+1\/2\s+spot\s+0\.85\s+WPS-0110$/m);
  });

  it('narrows to one vessel', async () => {
    const { out } = await invoke('joints', 'list', '--vessel', 'V-3300');
    expect(out.text()).toContain('J-20');
    expect(out.text()).not.toContain('J-14');
  });

  it('says so when the map is empty', async () => {
    context = memoryContext({ clock: new FixedClock('2024-09-20T09:00:00.000Z') });
    const { out } = await invoke('joints', 'list');
    expect(out.text()).toContain('nothing on the weld map');
  });
});

describe('arc joints show', () => {
  beforeEach(async () => {
    await invoke(...mapArgs('J-14'));
  });

  it('puts everything about the joint on one page', async () => {
    const { out } = await invoke('joints', 'show', 'J-14');
    expect(out.text()).toContain('category:     A');
    expect(out.text()).toContain('type 1, butt joint welded from both sides');
    expect(out.text()).toContain('efficiency:   1.00');
    expect(out.text()).toContain('RT full [UW-11] full radiography was specified');
  });

  it('reads a lethal service vessel differently', async () => {
    await invoke(...mapArgs('J-30', ['--radiography', 'none', '--type', '3']));
    const plain = await invoke('joints', 'show', 'J-30');
    expect(plain.out.text()).not.toContain('RT');
    const lethal = await invoke('joints', 'show', 'J-30', '--lethal');
    expect(lethal.out.text()).toContain('lethal service');
  });

  it('refuses a joint nobody mapped', async () => {
    const { result, out } = await invoke('joints', 'show', 'J-99');
    expect(result.code).toBe(EXIT_NOT_FOUND);
    expect(out.errorText()).toContain('no joint with id J-99');
  });
});

describe('arc joints level', () => {
  beforeEach(async () => {
    await invoke(...mapArgs('J-14'));
  });

  it('changes the level and shows the new efficiency', async () => {
    const { out } = await invoke('joints', 'level', 'J-14', 'spot', '--reason', 'client agreed');
    expect(out.text()).toContain('spot radiography, efficiency 0.85');
  });

  it('insists on a reason', async () => {
    const { result } = await invoke('joints', 'level', 'J-14', 'spot');
    expect(result.code).toBeGreaterThan(0);
  });
});
