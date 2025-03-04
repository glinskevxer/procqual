import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { StorageError } from '../core/errors.js';

/**
 * One writer at a time.
 *
 * The workspace is a directory on a share and two people running a command at
 * once is not hypothetical, it is Tuesday. The journal appends a line at a
 * time so a collision usually only interleaves entries, but a migration
 * rewrites the whole file and a projection read halfway through that is
 * nonsense.
 *
 * This is an advisory lock and it is honest about being one. A file on a
 * network share is not a mutex: two machines can create one at the same
 * instant and both believe they have it. What it does buy is that the ordinary
 * case, two people in the same office, is caught and reported with the name of
 * whoever holds it, which is enough to walk down the corridor.
 *
 * A lock left behind by a killed process is taken over rather than respected
 * forever. The alternative is a shop that cannot write anything until somebody
 * who knows about lock files comes in.
 */

const LOCK_FILE = 'arc.lock';
const STALE_AFTER_MS = 15 * 60 * 1000;

export interface LockHolder {
  readonly host: string;
  readonly pid: number;
  readonly actor: string;
  readonly takenAt: string;
}

export interface AcquireOptions {
  readonly actor: string;
  readonly now: Date;
  readonly pid?: number;
  readonly host?: string;
  readonly staleAfterMs?: number;
}

export function lockPath(directory: string): string {
  return join(directory, LOCK_FILE);
}

export function readLock(directory: string): LockHolder | undefined {
  const path = lockPath(directory);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockHolder>;
    if (typeof parsed.takenAt !== 'string' || typeof parsed.pid !== 'number') {
      return undefined;
    }
    return {
      host: parsed.host ?? 'unknown',
      pid: parsed.pid,
      actor: parsed.actor ?? 'unknown',
      takenAt: parsed.takenAt,
    };
  } catch {
    // A lock file that will not parse is worse than none. Treat it as absent
    // and let the next writer replace it.
    return undefined;
  }
}

export function isStale(holder: LockHolder, now: Date, staleAfterMs = STALE_AFTER_MS): boolean {
  const taken = Date.parse(holder.takenAt);
  if (Number.isNaN(taken)) {
    return true;
  }
  return now.getTime() - taken > staleAfterMs;
}

export function acquireLock(directory: string, options: AcquireOptions): LockHolder {
  const held = readLock(directory);
  if (held !== undefined && !isStale(held, options.now, options.staleAfterMs)) {
    throw new StorageError(
      `${directory} is locked by ${held.actor} on ${held.host} since ${held.takenAt}`,
      { holder: held.actor, host: held.host, takenAt: held.takenAt },
    );
  }
  const holder: LockHolder = {
    host: options.host ?? hostname(),
    pid: options.pid ?? process.pid,
    actor: options.actor,
    takenAt: options.now.toISOString(),
  };
  writeFileSync(lockPath(directory), `${JSON.stringify(holder, null, 2)}\n`, 'utf8');
  return holder;
}

export function releaseLock(directory: string): void {
  rmSync(lockPath(directory), { force: true });
}

/** Runs a piece of work with the lock held, releasing it whatever happens. */
export function withLock<T>(directory: string, options: AcquireOptions, work: () => T): T {
  acquireLock(directory, options);
  try {
    return work();
  } finally {
    releaseLock(directory);
  }
}

export function describeHolder(holder: LockHolder): string {
  return `${holder.actor} on ${holder.host} (process ${String(holder.pid)}) since ${holder.takenAt}`;
}
