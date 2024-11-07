import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { SystemClock, type Clock } from '../core/clock.js';
import { StorageError, ValidationError } from '../core/errors.js';
import { FileJournal } from './fileJournal.js';
import type { Journal } from './journal.js';
import { MemoryJournal } from './journal.js';
import { ExaminationStore } from './examinationStore.js';
import { FabricationStore } from './fabricationStore.js';
import { MaterialStore } from './materialStore.js';
import { PersonnelStore } from './personnelStore.js';
import { ProcedureStore } from './procedureStore.js';

/**
 * A workspace is one directory holding one shop's records.
 *
 * There is no server and no shared database. A works PC has the directory on
 * a network share, and the marker file in it says which schema version wrote
 * it. Opening a workspace written by a newer version of the program refuses
 * outright rather than reading it as best it can: half reading a quality
 * record is worse than not reading it.
 */

export const SCHEMA_VERSION = 1;

const MARKER = 'arc.json';
const JOURNAL = 'journal.ndjson';

export interface WorkspaceMarker {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly shop: string;
}

export interface OpenOptions {
  readonly clock?: Clock;
  readonly create?: boolean;
  readonly shop?: string;
  readonly tolerateTornTail?: boolean;
}

export class Workspace {
  readonly directory: string;
  readonly marker: WorkspaceMarker;
  readonly journal: Journal;
  readonly clock: Clock;
  readonly personnel: PersonnelStore;
  readonly fabrication: FabricationStore;
  readonly procedures: ProcedureStore;
  readonly examinations: ExaminationStore;
  readonly materials: MaterialStore;

  private constructor(directory: string, marker: WorkspaceMarker, journal: Journal, clock: Clock) {
    this.directory = directory;
    this.marker = marker;
    this.journal = journal;
    this.clock = clock;
    this.personnel = new PersonnelStore(journal, clock);
    this.fabrication = new FabricationStore(journal, clock);
    this.procedures = new ProcedureStore(journal, clock);
    this.examinations = new ExaminationStore(journal, clock);
    this.materials = new MaterialStore(journal, clock);
  }

  static open(directory: string, options: OpenOptions = {}): Workspace {
    const path = resolve(directory);
    const clock = options.clock ?? new SystemClock();
    const markerPath = join(path, MARKER);

    if (!existsSync(markerPath)) {
      if (options.create !== true) {
        throw new StorageError(`no workspace at ${path}`, { directory: path });
      }
      mkdirSync(path, { recursive: true });
      const marker: WorkspaceMarker = {
        schemaVersion: SCHEMA_VERSION,
        createdAt: clock.now().toISOString(),
        shop: options.shop ?? 'unnamed shop',
      };
      writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    }

    const marker = readMarker(markerPath);
    if (marker.schemaVersion > SCHEMA_VERSION) {
      throw new StorageError(
        `the workspace at ${path} was written by a newer version of arc (schema ${marker.schemaVersion}, this build reads ${SCHEMA_VERSION})`,
        { directory: path, schemaVersion: marker.schemaVersion },
      );
    }

    const journal = FileJournal.open(
      path,
      JOURNAL,
      options.tolerateTornTail === true ? { tolerateTornTail: true } : {},
    );
    return new Workspace(path, marker, journal, clock);
  }

  /** A workspace held entirely in memory, for tests and for a dry run. */
  static inMemory(options: OpenOptions = {}): Workspace {
    const clock = options.clock ?? new SystemClock();
    return new Workspace(
      ':memory:',
      {
        schemaVersion: SCHEMA_VERSION,
        createdAt: clock.now().toISOString(),
        shop: options.shop ?? 'in memory',
      },
      new MemoryJournal(),
      clock,
    );
  }

  isInMemory(): boolean {
    return this.directory === ':memory:';
  }

  entryCount(): number {
    return this.journal.length();
  }
}

/**
 * Where a workspace lives when the caller has not said.
 *
 * The environment variable wins so that a shop can put the directory on a
 * share without every command line carrying a path.
 */
export function defaultWorkspacePath(environment: NodeJS.ProcessEnv = process.env): string {
  const named = environment.ARC_HOME;
  if (named !== undefined && named.trim() !== '') {
    return resolve(named.trim());
  }
  return join(homedir(), '.arc');
}

function readMarker(path: string): WorkspaceMarker {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new StorageError(`cannot read the workspace marker at ${path}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StorageError(`the workspace marker at ${path} is not readable json`, { path });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new StorageError(`the workspace marker at ${path} is not an object`, { path });
  }
  const marker = parsed as Partial<WorkspaceMarker>;
  if (typeof marker.schemaVersion !== 'number' || !Number.isInteger(marker.schemaVersion)) {
    throw new ValidationError('schemaVersion', 'the workspace marker has no schema version', {
      path,
    });
  }
  return {
    schemaVersion: marker.schemaVersion,
    createdAt: marker.createdAt ?? 'unknown',
    shop: marker.shop ?? 'unnamed shop',
  };
}
