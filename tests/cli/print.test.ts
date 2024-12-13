import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { samplePqr } from '../support/pqr.js';
import { passingBends, passingTensiles } from '../support/specimens.js';
import { sampleWps } from '../support/wps.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-print-'));
  context = memoryContext({ clock: new FixedClock('2024-12-16T09:00:00.000Z'), actor: 'kd' });
  const workspace = context.workspace();
  workspace.procedures.recordQualification(
    samplePqr({
      tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    }),
    'kd',
  );
  workspace.procedures.issue(sampleWps(), 'engineer');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc print procedure', () => {
  it('prints the form to the terminal', async () => {
    const { out, result } = await invoke('print', 'procedure', 'WPS-0110 Rev 0');
    expect(result.code).toBe(0);
    expect(out.text()).toContain('WELDING PROCEDURE SPECIFICATION  WPS-0110 Rev 0');
    expect(out.text()).toContain('printed 2024-12-16T09:00:00.000Z by arc');
  });

  it('writes to a file when asked', async () => {
    const path = join(directory, 'wps.txt');
    const { out } = await invoke('print', 'procedure', 'WPS-0110 Rev 0', '--out', path);
    expect(out.text()).toBe(`written to ${path}`);
    expect(readFileSync(path, 'utf8')).toContain('WELDING PROCEDURE SPECIFICATION');
  });

  it('will not overwrite a file that is already there', async () => {
    const path = join(directory, 'wps.txt');
    writeFileSync(path, 'the signed one', 'utf8');
    const { result, out } = await invoke('print', 'procedure', 'WPS-0110 Rev 0', '--out', path);
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('cannot write');
    expect(readFileSync(path, 'utf8')).toBe('the signed one');
  });

  it('refuses one nobody issued and writes nothing', async () => {
    const path = join(directory, 'missing.txt');
    const { result } = await invoke('print', 'procedure', 'WPS-9999', '--out', path);
    expect(result.code).toBe(2);
    expect(existsSync(path)).toBe(false);
  });
});

describe('arc print record', () => {
  it('prints the record form with its verdict', async () => {
    const { out } = await invoke('print', 'record', 'PQR-0042');
    expect(out.text()).toContain('PROCEDURE QUALIFICATION RECORD  PQR-0042');
    expect(out.text()).toContain('RESULT: ACCEPTED');
  });

  it('writes it to a file', async () => {
    const path = join(directory, 'pqr.txt');
    await invoke('print', 'record', 'PQR-0042', '--out', path);
    expect(readFileSync(path, 'utf8')).toContain('QUALIFIED RANGES');
  });

  it('refuses one nobody filed', async () => {
    const { result } = await invoke('print', 'record', 'PQR-9999');
    expect(result.code).toBe(2);
  });
});
