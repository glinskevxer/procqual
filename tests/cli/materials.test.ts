import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const certifyArgs = (heat: string, extra: string[] = []) => [
  'materials',
  'certify',
  heat,
  '--specification',
  'SA-516 Gr 70',
  '--supplier',
  'Dillinger',
  '--certificate',
  'C-90114',
  '--dated',
  '2024-02-01',
  '--thickness',
  '1/2',
  '--tensile',
  '76',
  '--yield',
  '44',
  '--elongation',
  '26',
  ...extra,
];

beforeEach(() => {
  context = memoryContext({ clock: new FixedClock('2024-11-12T09:00:00.000Z'), actor: 'kd' });
});

describe('arc materials specifications', () => {
  it('lists the base metals with the curve for as rolled material', async () => {
    const { out } = await invoke('materials', 'specifications');
    expect(out.text()).toMatch(/^SA-516 Gr 70\s+1\s+2\s+plate\s+70\s+B$/m);
  });

  it('reads the normalised curve when asked', async () => {
    const { out } = await invoke('materials', 'specifications', '--normalised');
    expect(out.text()).toMatch(/^SA-516 Gr 70\s+1\s+2\s+plate\s+70\s+D$/m);
  });
});

describe('arc materials consumables and filler', () => {
  it('lists the stock with the oven flag', async () => {
    const { out } = await invoke('materials', 'consumables');
    expect(out.text()).toMatch(/^E7018-1\/8\s+SFA-5.1 E7018\s+Atom Arc 7018\s+SMAW\s+yes$/m);
  });

  it('answers what goes in a dissimilar joint', async () => {
    const { out } = await invoke('materials', 'filler', 'SA-516 Gr 70', 'SA-240 304L');
    expect(out.text()).toContain('P-No 1 to P-No 8');
    expect(out.text()).toContain('E309L-16');
  });

  it('says so when there is no standing answer', async () => {
    const { out } = await invoke('materials', 'filler', '15E', '8');
    expect(out.text()).toContain('has to write it up');
  });
});

describe('arc materials certify', () => {
  it('files a certificate and reports the curve and the carbon equivalent', async () => {
    const { out, result } = await invoke(
      ...certifyArgs('A47213', ['--element', 'C=0.18', 'Mn=1.05']),
    );
    expect(result.code).toBe(0);
    expect(out.text()).toContain('A47213 filed on curve B, carbon equivalent 0.355');
    expect(out.text()).toContain('nothing to report');
  });

  it('reads the normalised flag into the curve', async () => {
    const { out } = await invoke(...certifyArgs('A47214', ['--normalised']));
    expect(out.text()).toContain('curve D');
  });

  it('reports a certificate that fails its own specification', async () => {
    const { out } = await invoke(...certifyArgs('A47215', ['--tensile', '64']));
    expect(out.text()).toContain('BLOCKING');
    expect(out.text()).toContain('against 70 required');
  });

  it('refuses a chemistry pair it cannot read', async () => {
    const { result, out } = await invoke(...certifyArgs('A47216', ['--element', 'C0.18']));
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('expected an element=percent pair');
  });

  it('refuses the same heat twice', async () => {
    await invoke(...certifyArgs('A47213'));
    const { result } = await invoke(...certifyArgs('A47213'));
    expect(result.code).toBe(2);
  });
});

describe('arc materials heats', () => {
  beforeEach(async () => {
    await invoke(...certifyArgs('A47213', ['--element', 'C=0.18']));
  });

  it('lists what is on file', async () => {
    const { out } = await invoke('materials', 'heats');
    expect(out.text()).toMatch(/^A47213\s+SA-516 Gr 70\s+Dillinger\s+1\/2\s+76\s+B\s+0.18$/m);
  });

  it('shows one in detail', async () => {
    const { out } = await invoke('materials', 'heat', 'A47213');
    expect(out.text()).toContain('Heat A47213 from Dillinger');
    expect(out.text()).toContain('carbon equivalent: 0.18');
  });

  it('refuses one nobody filed', async () => {
    const { result } = await invoke('materials', 'heat', 'B00001');
    expect(result.code).toBe(2);
  });

  it('says so when nothing is on file', async () => {
    context = memoryContext({ clock: new FixedClock('2024-11-12T09:00:00.000Z') });
    const { out } = await invoke('materials', 'heats');
    expect(out.text()).toContain('no certificates on file');
  });
});

describe('arc materials charts', () => {
  it('says so when there are none', async () => {
    const { out } = await invoke('materials', 'charts');
    expect(out.text()).toContain('no charts on file');
  });
});
