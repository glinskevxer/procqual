import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { inches } from '../../src/core/units.js';
import { sampleJoint } from '../support/joints.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const recordArgs = (tag: string, extra: string[] = []) => [
  'vessels',
  'record',
  tag,
  '--description',
  'crude overhead accumulator',
  '--customer',
  'Humber Refinery',
  '--pressure',
  '285',
  '--temperature',
  '650',
  '--mdmt',
  '40',
  '--ordered',
  '2024-01-08',
  ...extra,
];

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2025-01-30T09:00:00.000Z'), actor: 'kd' });
  context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
  context
    .workspace()
    .fabrication.mapJoint(sampleJoint({ id: 'J-15', thickness: inches('2') }), 'kd');
});

describe('arc vessels record', () => {
  it('puts one on the books', async () => {
    const { out, result } = await invoke(...recordArgs('V-2201'));
    expect(result.code).toBe(0);
    expect(out.text()).toContain('V-2201 for Humber Refinery, general service, 285 psi at 650 F');
  });

  it('notes lethal service on the way in', async () => {
    const { out } = await invoke(...recordArgs('V-3300', ['--service', 'lethal']));
    expect(out.text()).toContain('every butt joint is fully radiographed');
  });

  it('refuses a service it does not know', async () => {
    const { result, out } = await invoke(...recordArgs('V-4400', ['--service', 'cryogenic']));
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a service');
  });

  it('refuses the same tag twice', async () => {
    await invoke(...recordArgs('V-2201'));
    const { result } = await invoke(...recordArgs('V-2201'));
    expect(result.code).toBe(2);
  });
});

describe('arc vessels list and review', () => {
  beforeEach(async () => {
    await invoke(...recordArgs('V-2201'));
  });

  it('lists them with their joint counts', async () => {
    const { out } = await invoke('vessels', 'list');
    expect(out.text()).toMatch(/^V-2201\s+Humber Refinery\s+general\s+285\s+650 F\s+40 F\s+2$/m);
  });

  it('reads every joint against the conditions', async () => {
    const { out } = await invoke('vessels', 'review', 'V-2201');
    expect(out.text()).toMatch(/^J-14\s+1\/2\s+B\s+no\s+full$/m);
    expect(out.text()).toMatch(/^J-15\s+2\s+B\s+yes\s+full$/m);
    expect(out.text()).toContain('needs notch toughness');
  });

  it('refuses a vessel nobody recorded', async () => {
    const { result } = await invoke('vessels', 'review', 'V-9999');
    expect(result.code).toBe(2);
  });
});

describe('arc vessels change', () => {
  beforeEach(async () => {
    await invoke(...recordArgs('V-2201'));
  });

  it('records the change and shows what it was before', async () => {
    const { out } = await invoke(
      'vessels',
      'change',
      'V-2201',
      '--pressure',
      '285',
      '--temperature',
      '650',
      '--mdmt',
      '-20',
      '--reason',
      'customer moved it down',
    );
    expect(out.text()).toContain('MDMT -20 F');
    expect(out.text()).toContain('was:    V-2201 for Humber Refinery');
    expect(out.text()).toContain('reason: customer moved it down');
  });

  it('changes what the joints then need', async () => {
    await invoke(
      'vessels',
      'change',
      'V-2201',
      '--pressure',
      '285',
      '--temperature',
      '650',
      '--mdmt',
      '-20',
      '--reason',
      'colder',
    );
    const { out } = await invoke('vessels', 'review', 'V-2201');
    expect(out.text()).toMatch(/^J-14\s+1\/2\s+B\s+yes\s+full$/m);
    expect(out.text()).toContain('1 design change: colder');
  });
});
