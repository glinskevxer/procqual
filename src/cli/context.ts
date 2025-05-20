import { SystemClock, type Clock } from '../core/clock.js';
import type { ShopPolicy } from '../policy/shopPolicy.js';
import { defaultWorkspacePath, Workspace } from '../store/workspace.js';

/**
 * What every command that touches records needs, gathered in one place.
 *
 * The workspace is opened lazily. Half the commands never touch it, and a
 * lookup against the code tables should not fail because somebody has not set
 * up a directory yet.
 */
export interface Context {
  workspace(): Workspace;
  /** Give up the workspace lock, if one was ever taken. */
  release(): void;
  readonly clock: Clock;
  readonly actor: string;
}

export interface ContextOptions {
  readonly path?: string | undefined;
  /** Only for an in memory context, where there is no policy file to read. */
  readonly policy?: ShopPolicy | undefined;
  readonly create?: boolean | undefined;
  readonly clock?: Clock | undefined;
  readonly actor?: string | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
}

export function createContext(options: ContextOptions = {}): Context {
  const clock = options.clock ?? new SystemClock();
  const environment = options.environment ?? process.env;
  const actor = options.actor ?? environment.ARC_ACTOR ?? environment.USER ?? 'unknown';
  let opened: Workspace | undefined;
  return {
    clock,
    actor,
    workspace(): Workspace {
      if (opened === undefined) {
        opened = Workspace.open(options.path ?? defaultWorkspacePath(environment), {
          clock,
          create: options.create ?? false,
          actor,
        });
      }
      return opened;
    },
    release(): void {
      opened?.release();
    },
  };
}

/** A context over an in memory workspace, for tests and for a dry run. */
export function memoryContext(options: ContextOptions = {}): Context {
  const clock = options.clock ?? new SystemClock();
  const workspace = Workspace.inMemory({ clock, policy: options.policy });
  return {
    clock,
    actor: options.actor ?? 'test',
    workspace: () => workspace,
    release: () => {
      workspace.release();
    },
  };
}
