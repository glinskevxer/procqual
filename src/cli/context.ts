import { SystemClock, type Clock } from '../core/clock.js';
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
  readonly clock: Clock;
  readonly actor: string;
}

export interface ContextOptions {
  readonly path?: string | undefined;
  readonly create?: boolean;
  readonly clock?: Clock;
  readonly actor?: string;
  readonly environment?: NodeJS.ProcessEnv;
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
        });
      }
      return opened;
    },
  };
}

/** A context over an in memory workspace, for tests and for a dry run. */
export function memoryContext(options: ContextOptions = {}): Context {
  const clock = options.clock ?? new SystemClock();
  const workspace = Workspace.inMemory({ clock });
  return {
    clock,
    actor: options.actor ?? 'test',
    workspace: () => workspace,
  };
}
