import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_INPUT } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { sampleJoint } from '../support/joints.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const write = (name: string, text: string) => {
  const path = join(directory, name);
  writeFileSync(path, text, 'utf8');
  return path;
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-import-'));
  context = memoryContext({ clock: new FixedClock('2025-01-06T09:00:00.000Z'), actor: 'kd' });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const welders = 'stencil,name,from\nW-118,R Ashworth,2019-04-01\nW-205,T Naylor,2021-09-06\n';

describe('arc import welders', () => {
  it('is a dry run unless told otherwise', async () => {
    const { out, result } = await invoke('import', 'welders', write('w.csv', welders));
    expect(result.code).toBe(0);
    expect(out.text()).toContain('2 rows read');
    expect(out.text()).toContain('dry run, nothing written');
    expect(context.workspace().personnel.welders()).toEqual([]);
  });

  it('writes when asked', async () => {
    const { out } = await invoke('import', 'welders', write('w.csv', welders), '--write');
    expect(out.text()).toContain('2 rows written');
    expect(context.workspace().personnel.welders()).toHaveLength(2);
  });

  it('reports the bad rows and writes none of them', async () => {
    const bad = 'stencil,name,from\nW-118,R Ashworth,2019-04-01\n118,T Naylor,yesterday\n';
    const { out } = await invoke('import', 'welders', write('bad.csv', bad), '--write');
    expect(out.text()).toContain('BLOCKING');
    expect(out.text()).toContain('nothing was written');
    expect(context.workspace().personnel.welders()).toEqual([]);
  });

  it('refuses a file it cannot read', async () => {
    const { result, out } = await invoke('import', 'welders', join(directory, 'nothing.csv'));
    expect(result.code).toBe(EXIT_INPUT);
    expect(out.errorText()).toContain('cannot read');
  });

  it('refuses a file with a column missing', async () => {
    const { result } = await invoke('import', 'welders', write('short.csv', 'stencil\nW-118\n'));
    expect(result.code).toBe(EXIT_INPUT);
  });
});

describe('arc import heats', () => {
  const heats =
    'heat,specification,supplier,certificate,dated,thickness,tensile,yield,elongation\n' +
    'A47213,SA-516 Gr 70,Dillinger,C-90114,2024-02-01,1/2,76,44,26\n';

  it('reads and writes them', async () => {
    const { out } = await invoke('import', 'heats', write('h.csv', heats), '--write');
    expect(out.text()).toContain('1 row written');
    expect(context.workspace().materials.heats()).toHaveLength(1);
  });
});

describe('arc import weld-log', () => {
  const log =
    'entry,joint,welder,process,procedure,welded,consumable,lot,deposit,foreman\n' +
    'L-1001,J-14,W-118,SMAW,WPS-0110,2024-07-02,E7018-1/8,LOT-88214,1/8,F-2\n';

  beforeEach(() => {
    context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
  });

  it('reads and writes entries', async () => {
    const { out } = await invoke('import', 'weld-log', write('l.csv', log), '--write');
    expect(out.text()).toContain('1 row written');
    expect(context.workspace().fabrication.entries()).toHaveLength(1);
  });
});
