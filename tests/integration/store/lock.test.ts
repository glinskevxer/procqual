import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../../../src/core/errors.js';
import {
  acquireLock,
  describeHolder,
  isStale,
  lockPath,
  readLock,
  releaseLock,
  withLock,
} from '../../../src/store/lock.js';

let directory: string;
const now = new Date('2025-03-04T09:00:00.000Z');

const options = (overrides = {}) => ({
  actor: 'kd',
  now,
  pid: 4242,
  host: 'bench-2',
  ...overrides,
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-lock-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('taking the lock', () => {
  it('writes a file naming who has it', () => {
    const holder = acquireLock(directory, options());
    expect(holder.actor).toBe('kd');
    expect(readFileSync(lockPath(directory), 'utf8')).toContain('bench-2');
    expect(describeHolder(holder)).toBe(
      'kd on bench-2 (process 4242) since 2025-03-04T09:00:00.000Z',
    );
  });

  it('refuses a second writer and says who has it', () => {
    acquireLock(directory, options());
    expect(() => acquireLock(directory, options({ actor: 'someone else' }))).toThrow(StorageError);
    expect(() => acquireLock(directory, options({ actor: 'someone else' }))).toThrow(
      /locked by kd on bench-2/,
    );
  });

  it('lets the next writer in once it is released', () => {
    acquireLock(directory, options());
    releaseLock(directory);
    expect(() => acquireLock(directory, options({ actor: 'someone else' }))).not.toThrow();
  });

  it('is not upset by releasing a lock nobody holds', () => {
    expect(() => releaseLock(directory)).not.toThrow();
  });
});

describe('a lock left behind', () => {
  it('goes stale after a quarter of an hour', () => {
    const holder = acquireLock(directory, options());
    expect(isStale(holder, now)).toBe(false);
    expect(isStale(holder, new Date('2025-03-04T09:14:00.000Z'))).toBe(false);
    expect(isStale(holder, new Date('2025-03-04T09:16:00.000Z'))).toBe(true);
  });

  it('is taken over rather than respected forever', () => {
    acquireLock(directory, options());
    const later = new Date('2025-03-04T10:00:00.000Z');
    const holder = acquireLock(directory, options({ actor: 'someone else', now: later }));
    expect(holder.actor).toBe('someone else');
  });

  it('treats a lock with an unreadable date as stale', () => {
    writeFileSync(lockPath(directory), JSON.stringify({ pid: 1, takenAt: 'whenever' }), 'utf8');
    expect(() => acquireLock(directory, options())).not.toThrow();
  });

  it('treats a lock file that will not parse as absent', () => {
    writeFileSync(lockPath(directory), 'not json', 'utf8');
    expect(readLock(directory)).toBeUndefined();
    expect(() => acquireLock(directory, options())).not.toThrow();
  });

  it('treats a lock file missing its fields as absent', () => {
    writeFileSync(lockPath(directory), JSON.stringify({ actor: 'kd' }), 'utf8');
    expect(readLock(directory)).toBeUndefined();
  });
});

describe('holding it around a piece of work', () => {
  it('releases it afterwards', () => {
    const value = withLock(directory, options(), () => 'done');
    expect(value).toBe('done');
    expect(existsSync(lockPath(directory))).toBe(false);
  });

  it('releases it when the work throws', () => {
    expect(() =>
      withLock(directory, options(), () => {
        throw new Error('the work failed');
      }),
    ).toThrow('the work failed');
    expect(existsSync(lockPath(directory))).toBe(false);
  });
});
