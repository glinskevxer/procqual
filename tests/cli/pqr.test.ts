import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { DocumentNumber } from '../../src/core/identifier.js';
import { inches } from '../../src/core/units.js';
import type { ProcedureQualificationRecord } from '../../src/qualification/pqr.js';
import { encodeDate, encodeDocumentNumber, encodeLength } from '../../src/store/codec.js';
import { encodeVariables } from '../../src/store/procedureCodec.js';
import { encodeTests } from '../../src/store/testResultsCodec.js';
import { samplePqr } from '../support/pqr.js';
import { passingBends, passingTensiles } from '../support/specimens.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const encodeRecord = (record: ProcedureQualificationRecord) => ({
  number: encodeDocumentNumber(record.number),
  weldedOn: encodeDate(record.weldedOn),
  weldedBy: record.weldedBy,
  weldType: record.weldType,
  productForm: record.productForm,
  baseMetalLeft: record.baseMetalLeft,
  baseMetalRight: record.baseMetalRight,
  heatLeft: record.heatLeft,
  heatRight: record.heatRight,
  couponThickness: encodeLength(record.couponThickness),
  outsideDiameter:
    record.outsideDiameter === undefined ? null : encodeLength(record.outsideDiameter),
  layers: record.layers.map((layer) => encodeVariables(layer)),
  toughnessRequired: record.toughnessRequired,
  tests: encodeTests(record.tests),
  witnessedBy: record.witnessedBy ?? null,
  certifiedOn: record.certifiedOn === undefined ? null : encodeDate(record.certifiedOn),
});

const writeRecord = (name: string, overrides: Partial<ProcedureQualificationRecord> = {}) => {
  const path = join(directory, name);
  const record = samplePqr({
    tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    ...overrides,
  });
  writeFileSync(path, JSON.stringify(encodeRecord(record), null, 2), 'utf8');
  return path;
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-pqr-'));
  context = memoryContext({ clock: new FixedClock('2024-10-20T09:00:00.000Z'), actor: 'kd' });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc pqr record', () => {
  it('records a coupon and grades it', async () => {
    const { out, result } = await invoke('pqr', 'record', writeRecord('pqr.json'));
    expect(result.code).toBe(0);
    expect(out.text()).toContain('PQR-0042 accepted');
  });

  it('records one that failed and says why', async () => {
    const path = writeRecord('bad.json', {
      tests: { tensile: [], bends: [], impacts: [], hardness: [] },
    });
    const { out } = await invoke('pqr', 'record', path);
    expect(out.text()).toContain('rejected on');
    expect(out.text()).toContain('tensile.too_few_specimens'.split('.')[0]);
  });

  it('refuses the same number twice', async () => {
    await invoke('pqr', 'record', writeRecord('pqr.json'));
    const { result } = await invoke('pqr', 'record', writeRecord('pqr.json'));
    expect(result.code).toBe(2);
  });
});

describe('arc pqr plan', () => {
  it('says what has to be cut off a plain coupon', async () => {
    const { out } = await invoke('pqr', 'plan', writeRecord('pqr.json'));
    expect(out.text()).toContain('tensile:     2');
    expect(out.text()).toContain('6 specimens in all');
  });

  it('adds the impact sets when the job wants toughness', async () => {
    const path = writeRecord('tough.json', { toughnessRequired: true });
    const { out } = await invoke('pqr', 'plan', path);
    expect(out.text()).toContain('impact sets: weld, heat-affected-zone');
    expect(out.text()).toContain('12 specimens in all');
  });

  it('sends a thick coupon to side bends', async () => {
    const path = writeRecord('thick.json', {
      couponThickness: inches('1'),
      layers: samplePqr().layers.map((layer) => ({
        ...layer,
        baseMetal: { ...layer.baseMetal, thickness: inches('1') },
      })),
    });
    const { out } = await invoke('pqr', 'plan', path);
    expect(out.text()).toContain('bends:       4 (side)');
  });
});

describe('arc pqr list and show', () => {
  beforeEach(async () => {
    await invoke('pqr', 'record', writeRecord('pqr.json'));
  });

  it('lists what is on file', async () => {
    const { out } = await invoke('pqr', 'list');
    expect(out.text()).toMatch(
      /PQR-0042\s+2024-03-04\s+W-118\s+SMAW\s+SA-516 Gr 70\s+3\/8\s+no\s+yes/,
    );
  });

  it('shows what a record qualifies', async () => {
    const { out } = await invoke('pqr', 'show', 'PQR-0042');
    expect(out.text()).toContain('coupon:          3/8');
    expect(out.text()).toContain('SMAW; P-No 1 groups 1/2/3/4; F-No 1/2/3/4');
  });

  it('grades one already on file', async () => {
    const { out } = await invoke('pqr', 'evaluate', 'PQR-0042');
    expect(out.text()).toContain('PQR-0042 accepted');
  });

  it('adds the hardness traverse when the vessel is in sour service', async () => {
    const { out } = await invoke('pqr', 'evaluate', 'PQR-0042', '--sour');
    expect(out.text()).toContain('hardness survey is called for');
  });
});

describe('arc pqr certify and supersede', () => {
  beforeEach(async () => {
    const path = writeRecord('draft.json', { witnessedBy: undefined, certifiedOn: undefined });
    await invoke('pqr', 'record', path);
  });

  it('certifies a record after the fact', async () => {
    const { out } = await invoke(
      'pqr',
      'certify',
      'PQR-0042',
      '--by',
      'QA-3',
      '--on',
      '2024-04-01',
    );
    expect(out.text()).toContain('certified by QA-3');
    const listed = await invoke('pqr', 'list');
    expect(listed.out.text()).toMatch(/PQR-0042.*\syes\s*$/m);
  });

  it('supersedes one and keeps it on the list', async () => {
    await invoke(
      'pqr',
      'record',
      writeRecord('later.json', { number: DocumentNumber.parse('PQR-0055') }),
    );
    const { out } = await invoke(
      'pqr',
      'supersede',
      'PQR-0042',
      'PQR-0055',
      '--reason',
      'loads transcribed wrongly',
    );
    expect(out.text()).toBe('PQR-0042 superseded by PQR-0055');
    const listed = await invoke('pqr', 'list');
    expect(listed.out.text()).toContain('PQR-0055');
    expect(listed.out.text()).toMatch(/PQR-0042.*PQR-0055/);
  });
});
