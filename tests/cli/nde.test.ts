import { beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_INPUT, EXIT_NOT_FOUND } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { sampleJoint } from '../support/joints.js';
import { sampleEntry as sampleEntryForRates } from '../support/weldLog.js';

let context: Context;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

const fileArgs = (id: string, extra: string[] = []) => [
  'nde',
  'file',
  id,
  '--joint',
  'J-14',
  '--method',
  'RT',
  '--technician',
  'J Pilling',
  '--on',
  '2024-11-05',
  '--report',
  'RT-2024-0331',
  '--coverage',
  '96',
  ...extra,
];

beforeEach(async () => {
  context = memoryContext({ clock: new FixedClock('2024-11-06T09:00:00.000Z'), actor: 'kd' });
  context.workspace().fabrication.mapJoint(sampleJoint(), 'kd');
  await invoke(
    'nde',
    'technician',
    'J Pilling',
    '--level',
    'II',
    '--methods',
    'RT,UT,MT,PT,VT',
    '--until',
    '2026-03-31',
  );
});

describe('arc nde technician', () => {
  it('registers one', async () => {
    const { out } = await invoke(
      'nde',
      'technician',
      'A Hale',
      '--level',
      'iii',
      '--methods',
      'MT, PT',
      '--until',
      '2027-01-01',
    );
    expect(out.text()).toBe('A Hale registered');
    expect(context.workspace().examinations.technician('A Hale')?.methods).toEqual(['MT', 'PT']);
  });

  it('refuses a level or a method it does not know', async () => {
    const level = await invoke(
      'nde',
      'technician',
      'X',
      '--level',
      'IV',
      '--methods',
      'RT',
      '--until',
      '2027-01-01',
    );
    expect(level.out.errorText()).toContain('not a certification level');
    const method = await invoke(
      'nde',
      'technician',
      'X',
      '--level',
      'II',
      '--methods',
      'XX',
      '--until',
      '2027-01-01',
    );
    expect(method.out.errorText()).toContain('not an examination method');
  });
});

describe('arc nde file', () => {
  it('files a clean report and accepts it', async () => {
    const { out, result } = await invoke(...fileArgs('X-4410'));
    expect(result.code).toBe(0);
    expect(out.text()).toBe('X-4410 filed against J-14: accepted');
  });

  it('grades the indications as it goes in', async () => {
    const { out } = await invoke(...fileArgs('X-4411', ['--indication', 'crack:1/16:40']));
    expect(out.text()).toContain('rejected');
    expect(out.text()).toContain('a crack indication is rejected at any size');
  });

  it('accepts slag inside the limit for the thickness', async () => {
    const { out } = await invoke(...fileArgs('X-4412', ['--indication', 'slag:1/8:12']));
    expect(out.text()).toContain('accepted');
  });

  it('refuses an indication it cannot parse', async () => {
    const bad = await invoke(...fileArgs('X-4413', ['--indication', 'slag']));
    expect(bad.out.errorText()).toContain('expected type:size:position');
    const worse = await invoke(...fileArgs('X-4414', ['--indication', 'rust:1/8:12']));
    expect(worse.out.errorText()).toContain('not an indication type');
  });

  it('refuses a technician nobody registered', async () => {
    const { result, out } = await invoke(...fileArgs('X-4415', ['--technician', 'Nobody']));
    expect(result.code).toBe(EXIT_INPUT);
    expect(out.errorText()).toContain('not on the technician register');
  });

  it('refuses a joint that is not on the map', async () => {
    const { result } = await invoke(...fileArgs('X-4416', ['--joint', 'J-99']));
    expect(result.code).toBe(EXIT_NOT_FOUND);
  });
});

describe('arc nde list and required', () => {
  beforeEach(async () => {
    await invoke(...fileArgs('X-4410'));
    await invoke(...fileArgs('X-4411', ['--indication', 'crack:1/16:40']));
  });

  it('lists the reports with a verdict against each', async () => {
    const { out } = await invoke('nde', 'list');
    expect(out.text()).toMatch(
      /X-4410\s+J-14\s+RT\s+full\s+2024-11-05\s+J Pilling \(II\)\s+0\s+accept/,
    );
    expect(out.text()).toMatch(/X-4411.*reject/);
  });

  it('says what the code asks for on a joint', async () => {
    const { out } = await invoke('nde', 'required', 'J-14');
    expect(out.text()).toContain('VT full [UW-35]');
    expect(out.text()).toContain('RT full [UW-11]');
  });

  it('reads a lethal service vessel differently', async () => {
    const { out } = await invoke('nde', 'required', 'J-14', '--lethal');
    expect(out.text()).toContain('lethal service');
  });
});

describe('arc nde coverage', () => {
  it('asks for one spot per fifty feet and says none has been taken', async () => {
    const { out } = await invoke('nde', 'coverage', 'J-14');
    expect(out.text()).toContain('96 of weld needs 1 spot');
    expect(out.text()).toMatch(/^\s*1\s+not-started/m);
    expect(out.text()).toContain('DEFICIENCY');
  });

  it('is satisfied by a clean radiograph', async () => {
    await invoke(...fileArgs('X-4410'));
    const { out } = await invoke('nde', 'coverage', 'J-14');
    expect(out.text()).toMatch(/^\s*1\s+satisfied/m);
    expect(out.text()).toContain('nothing to report');
  });

  it('escalates when the spot was rejected', async () => {
    await invoke(...fileArgs('X-4411', ['--indication', 'crack:1/16:40']));
    const { out } = await invoke('nde', 'coverage', 'J-14');
    expect(out.text()).toContain('two-more-required');
  });

  it('notes a film shorter than the minimum', async () => {
    await invoke(...fileArgs('X-4412', ['--coverage', '4']));
    const { out } = await invoke('nde', 'coverage', 'J-14');
    expect(out.text()).toContain('covers only 4');
  });
});

describe('arc nde rates', () => {
  it('says so when nothing has been examined in the window', async () => {
    const { out } = await invoke('nde', 'rates', '--on', '2030-01-01');
    expect(out.text()).toContain('nothing examined in the window');
  });

  it('reports a rate once there is work behind it', async () => {
    context
      .workspace()
      .fabrication.logWeld({ ...sampleEntryForRates(), id: 'L-1', role: 'cap' }, 'foreman');
    await invoke(...fileArgs('X-4420', ['--indication', 'crack:1/16:40']));
    const { out } = await invoke('nde', 'rates');
    expect(out.text()).toMatch(/^W-118\s+SMAW\s+1\s+1\s+1\s+insufficient-sample$/m);
  });

  it('narrows to the suspended ones', async () => {
    const { out } = await invoke('nde', 'rates', '--suspended');
    expect(out.text()).toContain('nobody is over the suspend level');
  });
});

describe('arc nde repair', () => {
  beforeEach(async () => {
    await invoke(...fileArgs('X-4411', ['--indication', 'crack:1/16:40']));
  });

  const repairArgs = (id: string, extra: string[] = []) => [
    'nde',
    'repair',
    id,
    '--joint',
    'J-14',
    '--from',
    'X-4411',
    '--defect',
    'crack',
    '--length',
    '4',
    '--depth',
    '1/8',
    '--on',
    '2024-11-08',
    '--welder',
    'W-118',
    ...extra,
  ];

  it('raises one against a rejected report', async () => {
    const { out } = await invoke(...repairArgs('R-77'));
    expect(out.text()).toContain('R-77 raised against J-14');
    expect(out.text()).toContain('the excavation is open');
  });

  it('insists on approval for a second attempt', async () => {
    const { out } = await invoke(...repairArgs('R-78', ['--attempt', '2']));
    expect(out.text()).toContain('needs engineering approval');
  });

  it('accepts a second attempt that carries one', async () => {
    const { out } = await invoke(...repairArgs('R-79', ['--attempt', '2', '--approval', 'DE-118']));
    expect(out.text()).not.toContain('needs engineering approval');
  });

  it('lists them with the open ones counted', async () => {
    await invoke(...repairArgs('R-77'));
    const { out } = await invoke('nde', 'repairs');
    expect(out.text()).toMatch(/R-77\s+J-14\s+crack\s+1\s+2024-11-08\s+open/);
    expect(out.text()).toContain('1 repair still open');
  });

  it('refuses one against a report nobody filed', async () => {
    const { result } = await invoke(...repairArgs('R-80', ['--from', 'X-9999']));
    expect(result.code).toBe(EXIT_NOT_FOUND);
  });
});
