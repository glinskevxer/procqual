import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { DocumentNumber } from '../../src/core/identifier.js';
import { date } from '../../src/core/plainDate.js';
import { encodeProcedure } from '../../src/store/procedureCodec.js';
import { samplePqr } from '../support/pqr.js';
import { sampleWps } from '../support/wps.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const writeProcedure = (name: string, overrides = {}) => {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(encodeProcedure(sampleWps(overrides)), null, 2), 'utf8');
  return path;
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-procedures-'));
  context = memoryContext({ clock: new FixedClock('2024-10-15T09:00:00.000Z'), actor: 'kd' });
  context.workspace().procedures.recordQualification(samplePqr(), 'kd');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc procedures issue', () => {
  it('reads a procedure out of a file', async () => {
    const { out, result } = await invoke('procedures', 'issue', writeProcedure('wps.json'));
    expect(result.code).toBe(0);
    expect(out.text()).toBe('WPS-0110 Rev 0 issued');
  });

  it('refuses one that contradicts itself and does not issue it', async () => {
    const path = writeProcedure('bad.json', { pNumbers: [] });
    const { out } = await invoke('procedures', 'issue', path);
    expect(out.text()).toContain('BLOCKING');
    expect(out.text()).toContain('not issued');
    expect(context.workspace().procedures.procedures()).toHaveLength(0);
  });

  it('issues one with a deficiency on it and says so', async () => {
    const path = writeProcedure('draft.json', { supportedBy: [] });
    const { out } = await invoke('procedures', 'issue', path);
    expect(out.text()).toContain('issued');
    expect(out.text()).toContain('DEFICIENCY');
  });

  it('refuses a file it cannot find or cannot read', async () => {
    const missing = await invoke('procedures', 'issue', join(directory, 'nothing.json'));
    expect(missing.result.code).toBe(2);
    expect(missing.out.errorText()).toContain('cannot read');

    const path = join(directory, 'broken.json');
    writeFileSync(path, 'not json', 'utf8');
    const broken = await invoke('procedures', 'issue', path);
    expect(broken.out.errorText()).toContain('not readable json');
  });

  it('names the bad field in a file it can read but not accept', async () => {
    const path = join(directory, 'wrong.json');
    writeFileSync(
      path,
      JSON.stringify({ ...encodeProcedure(sampleWps()), positions: ['sideways'] }),
      'utf8',
    );
    const { out } = await invoke('procedures', 'issue', path);
    expect(out.errorText()).toContain('positions[0]');
  });
});

describe('arc procedures list and show', () => {
  beforeEach(async () => {
    await invoke('procedures', 'issue', writeProcedure('wps.json'));
  });

  it('lists them with whether they are in force', async () => {
    const { out } = await invoke('procedures', 'list');
    expect(out.text()).toMatch(
      /WPS-0110 Rev 0\s+carbon steel shell seams.*SMAW\s+2024-03-18\s+yes/,
    );
  });

  it('reads the register as it stood on an earlier day', async () => {
    const { out } = await invoke('procedures', 'list', '--on', '2024-01-01');
    expect(out.text()).toMatch(/WPS-0110 Rev 0.*\sno\s/);
  });

  it('shows one in full', async () => {
    const { out } = await invoke('procedures', 'show', 'WPS-0110 Rev 0');
    expect(out.text()).toContain('base metals:     P-No 1 groups 1/2');
    expect(out.text()).toContain('SMAW: F-No 4, deposit [0 in, 0.75 in], uphill');
  });

  it('refuses one nobody issued', async () => {
    const { result } = await invoke('procedures', 'show', 'WPS-9999');
    expect(result.code).toBe(2);
  });
});

describe('arc procedures support', () => {
  it('says so when the records reach', async () => {
    await invoke('procedures', 'issue', writeProcedure('wps.json'));
    const { out } = await invoke('procedures', 'support', 'WPS-0110 Rev 0');
    expect(out.text()).toContain('nothing to report');
    expect(out.text()).toContain('supported');
  });

  it('names the clauses when they do not', async () => {
    await invoke('procedures', 'issue', writeProcedure('wide.json', { pNumbers: ['1', '8'] }));
    const { out } = await invoke('procedures', 'support', 'WPS-0110 Rev 0');
    expect(out.text()).toContain('not supported: QW-403.11');
  });
});

describe('arc procedures compare', () => {
  it('shows what a revision moved and what it costs', async () => {
    await invoke('procedures', 'issue', writeProcedure('rev0.json'));
    await invoke(
      'procedures',
      'issue',
      writeProcedure('rev1.json', {
        number: DocumentNumber.parse('WPS-0110 Rev 1'),
        issuedOn: date('2024-09-01'),
        positions: ['flat', 'horizontal'],
      }),
    );
    const { out } = await invoke('procedures', 'compare', 'WPS-0110 Rev 0', 'WPS-0110 Rev 1');
    expect(out.text()).toContain('positions');
    expect(out.text()).toContain('narrowed');
    expect(out.text()).toContain('the records still cover it');
  });
});

describe('arc procedures gap', () => {
  it('says so when the procedure is already supported', async () => {
    await invoke('procedures', 'issue', writeProcedure('wps.json'));
    const { out } = await invoke('procedures', 'gap', 'WPS-0110 Rev 0');
    expect(out.text()).toBe('WPS-0110 Rev 0 is already supported');
  });

  it('names the coupon that would close it', async () => {
    await invoke('procedures', 'issue', writeProcedure('wide.json', { pNumbers: ['1', '3'] }));
    const { out } = await invoke('procedures', 'gap', 'WPS-0110 Rev 0');
    expect(out.text()).toContain('SMAW coupon');
    expect(out.text()).toContain('P-No 3');
    expect(out.text()).toContain('reaches the others downward');
  });
});

describe('arc procedures draft', () => {
  it('prints a draft without issuing it', async () => {
    const { out } = await invoke('procedures', 'draft', 'PQR-0042', '--title', 'drafted');
    expect(out.text()).toContain('WPS-0001 Rev 0');
    expect(out.text()).toContain('supported:       yes');
    expect(context.workspace().procedures.procedures()).toHaveLength(0);
  });

  it('issues it when asked', async () => {
    const { out } = await invoke(
      'procedures',
      'draft',
      'PQR-0042',
      '--title',
      'drafted',
      '--issue',
    );
    expect(out.text()).toContain('issued');
    expect(context.workspace().procedures.procedures()).toHaveLength(1);
  });

  it('takes the next number past what is already issued', async () => {
    await invoke('procedures', 'issue', writeProcedure('wps.json'));
    const { out } = await invoke('procedures', 'draft', 'PQR-0042', '--title', 'drafted');
    expect(out.text()).toContain('WPS-0111 Rev 0');
  });

  it('narrows to the processes asked for', async () => {
    const { out } = await invoke(
      'procedures',
      'draft',
      'PQR-0042',
      '--title',
      'drafted',
      '--process',
      'GTAW',
    );
    expect(out.text()).toContain('base metals:     P-No  groups');
  });

  it('refuses a record nobody has filed', async () => {
    const { result } = await invoke('procedures', 'draft', 'PQR-9999', '--title', 'x');
    expect(result.code).toBe(2);
  });
});

describe('arc procedures withdraw', () => {
  it('withdraws a revision', async () => {
    await invoke('procedures', 'issue', writeProcedure('wps.json'));
    const { out } = await invoke(
      'procedures',
      'withdraw',
      'WPS-0110 Rev 0',
      '--on',
      '2025-01-01',
      '--reason',
      'replaced',
    );
    expect(out.text()).toContain('withdrawn on 2025-01-01');
    const listed = await invoke('procedures', 'list', '--on', '2025-02-01');
    expect(listed.out.text()).toMatch(/WPS-0110 Rev 0.*\sno\s/);
  });
});
