import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_CONFLICT } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { inches } from '../../src/core/units.js';
import { sampleJoint } from '../support/joints.js';
import { sampleExamination } from '../support/nde.js';
import { samplePqr } from '../support/pqr.js';
import { sampleEntry } from '../support/weldLog.js';
import { sampleWps } from '../support/wps.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-export-'));
  context = memoryContext({ clock: new FixedClock('2025-01-14T09:00:00.000Z'), actor: 'kd' });
  const workspace = context.workspace();
  workspace.fabrication.mapJoint(sampleJoint(), 'kd');
  workspace.fabrication.logWeld(sampleEntry({ depositThickness: inches('1/2') }), 'foreman');
  workspace.examinations.file(sampleExamination(), 'qa');
  workspace.procedures.recordQualification(samplePqr(), 'kd');
  workspace.procedures.issue(sampleWps(), 'engineer');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc export package', () => {
  it('lists what would be written', async () => {
    const { out, result } = await invoke(
      'export',
      'package',
      'V-2201',
      join(directory, 'out'),
      '--list',
    );
    expect(result.code).toBe(0);
    expect(out.text()).toContain('Data package for V-2201');
    expect(out.text()).toMatch(/00-index.txt\s+index\s+\d+/);
    expect(readdirSync(directory)).toEqual([]);
  });

  it('writes the folder', async () => {
    const target = join(directory, 'out');
    const { out } = await invoke('export', 'package', 'V-2201', target);
    expect(out.text()).toMatch(/^\d+ documents written to /);
    const written = readdirSync(target);
    expect(written).toContain('00-index.txt');
    expect(written).toContain('01-weld-map.txt');
    expect(readFileSync(join(target, '01-weld-map.txt'), 'utf8')).toContain('J-14');
  });

  it('refuses a directory that already has something in it', async () => {
    const target = join(directory, 'out');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'old.txt'), 'last time', 'utf8');
    const { result, out } = await invoke('export', 'package', 'V-2201', target);
    expect(result.code).toBe(EXIT_CONFLICT);
    expect(out.errorText()).toContain('is not empty');
    expect(readdirSync(target)).toEqual(['old.txt']);
  });

  it('writes into a directory that exists but is empty', async () => {
    const target = join(directory, 'out');
    mkdirSync(target, { recursive: true });
    const { result } = await invoke('export', 'package', 'V-2201', target);
    expect(result.code).toBe(0);
    expect(readdirSync(target).length).toBeGreaterThan(3);
  });

  it('writes a package for a vessel with nothing on it', async () => {
    const target = join(directory, 'empty');
    await invoke('export', 'package', 'V-9999', target);
    expect(readFileSync(join(target, '01-weld-map.txt'), 'utf8')).toContain(
      'no joints on this vessel',
    );
  });
});
