import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContext } from '../../../src/cli/context.js';
import { EXIT_CONFLICT, EXIT_STORAGE } from '../../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../../src/cli/output.js';
import { run } from '../../../src/cli/program.js';
import { FixedClock } from '../../../src/core/clock.js';
import { StorageError } from '../../../src/core/errors.js';
import { acquireLock, lockPath, releaseLock } from '../../../src/store/lock.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleWelder } from '../../support/welders.js';

let directory: string;
const clock = new FixedClock('2025-03-06T09:00:00.000Z');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-locking-'));
  Workspace.open(directory, { clock, create: true, actor: 'kd' }).release();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('reading', () => {
  it('takes no lock at all', () => {
    const workspace = Workspace.open(directory, { clock, actor: 'kd' });
    expect(workspace.personnel.welders()).toEqual([]);
    expect(existsSync(lockPath(directory))).toBe(false);
  });
});

describe('writing', () => {
  it('takes the lock on the first write', () => {
    const workspace = Workspace.open(directory, { clock, actor: 'kd' });
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    expect(existsSync(lockPath(directory))).toBe(true);
    workspace.release();
    expect(existsSync(lockPath(directory))).toBe(false);
  });

  it('refuses to write while somebody else holds it', () => {
    acquireLock(directory, { actor: 'someone else', now: clock.now() });
    const workspace = Workspace.open(directory, { clock, actor: 'kd' });
    expect(() => workspace.personnel.registerWelder(sampleWelder(), 'kd')).toThrow(StorageError);
    releaseLock(directory);
  });

  it('is not upset by releasing a workspace that never wrote', () => {
    const workspace = Workspace.open(directory, { clock, actor: 'kd' });
    expect(() => {
      workspace.release();
    }).not.toThrow();
  });
});

describe('a command', () => {
  const invoke = async (...argv: string[]) => {
    const out = new RecordingOutput();
    const result = await run(argv, out, createContext({ path: directory, clock, actor: 'kd' }));
    return { out, result };
  };

  it('gives the lock back when it finishes', async () => {
    const { result } = await invoke(
      'welders',
      'add',
      'W-118',
      'R Ashworth',
      '--from',
      '2019-04-01',
    );
    expect(result.code).toBe(0);
    expect(existsSync(lockPath(directory))).toBe(false);
  });

  it('gives it back when it fails partway through', async () => {
    await invoke('welders', 'add', 'W-118', 'R Ashworth', '--from', '2019-04-01');
    const { result } = await invoke(
      'welders',
      'add',
      'W-118',
      'R Ashworth',
      '--from',
      '2019-04-01',
    );
    expect(result.code).toBe(EXIT_CONFLICT);
    expect(existsSync(lockPath(directory))).toBe(false);
  });

  it('reports who holds it rather than waiting', async () => {
    acquireLock(directory, { actor: 'T Naylor', now: clock.now() });
    const { out, result } = await invoke(
      'welders',
      'add',
      'W-205',
      'T Naylor',
      '--from',
      '2021-09-06',
    );
    expect(result.code).toBe(EXIT_STORAGE);
    expect(out.errorText()).toContain('locked by T Naylor');
    releaseLock(directory);
  });
});
