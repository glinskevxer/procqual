import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { SystemClock, type Clock } from '../core/clock.js';
import { PlainDate } from '../core/plainDate.js';
import type { RegisterEntry } from '../personnel/register.js';
import { StorageError, ValidationError } from '../core/errors.js';
import { FileJournal } from './fileJournal.js';
import type { Journal } from './journal.js';
import { MemoryJournal } from './journal.js';
import { LockingJournal } from './lockingJournal.js';
import { describeMigration, LATEST_SCHEMA, migrate, migrationsFrom } from './migrations.js';
import { ConsumableStore } from './consumableStore.js';
import { ExaminationStore } from './examinationStore.js';
import { FabricationStore } from './fabricationStore.js';
import { MaterialStore } from './materialStore.js';
import { PersonnelStore } from './personnelStore.js';
import { ProcedureStore } from './procedureStore.js';
import { VesselStore } from './vesselStore.js';
import { DEFAULT_POLICY, loadPolicy, type ShopPolicy } from '../policy/shopPolicy.js';

/**
 * A workspace is one directory holding one shop's records.
 *
 * There is no server and no shared database. A works PC has the directory on
 * a network share, and the marker file in it says which schema version wrote
 * it. Opening a workspace written by a newer version of the program refuses
 * outright rather than reading it as best it can: half reading a quality
 * record is worse than not reading it.
 */

export const SCHEMA_VERSION = LATEST_SCHEMA;

const MARKER = 'arc.json';
const JOURNAL = 'journal.ndjson';

export interface WorkspaceMarker {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly shop: string;
}

export interface OpenOptions {
  readonly clock?: Clock | undefined;
  readonly create?: boolean | undefined;
  readonly shop?: string | undefined;
  readonly tolerateTornTail?: boolean | undefined;
  /** Open a workspace written by an older build without rewriting it. */
  readonly readOnly?: boolean | undefined;
  /** Only for an in memory workspace, where there is no file to read one from. */
  readonly policy?: ShopPolicy | undefined;
  /** Who to name in the lock file when this workspace writes. */
  readonly actor?: string | undefined;
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
  readonly policy: ShopPolicy;
  readonly vessels: VesselStore;
  readonly consumables: ConsumableStore;

  private constructor(
    directory: string,
    marker: WorkspaceMarker,
    journal: Journal,
    clock: Clock,
    policy: ShopPolicy,
  ) {
    this.policy = policy;
    this.directory = directory;
    this.marker = marker;
    this.journal = journal;
    this.clock = clock;
    this.personnel = new PersonnelStore(journal, clock);
    this.fabrication = new FabricationStore(journal, clock);
    this.procedures = new ProcedureStore(journal, clock);
    this.examinations = new ExaminationStore(journal, clock);
    this.materials = new MaterialStore(journal, clock);
    this.vessels = new VesselStore(journal, clock);
    this.consumables = new ConsumableStore(journal, clock);
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
    const migrated = migrateIfNeeded(path, marker, journal, clock, options.readOnly === true);
    const guarded = new LockingJournal(journal, path, clock, options.actor ?? 'unknown');
    return new Workspace(path, migrated, guarded, clock, loadPolicy(path));
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
      options.policy ?? DEFAULT_POLICY,
    );
  }

  isInMemory(): boolean {
    return this.directory === ':memory:';
  }

  /**
   * The register entries with the weld log folded in.
   *
   * The continuity clock restarts on any day a welder deposits metal, and
   * production work is where nearly all of that happens. Reading only the
   * personnel events meant the clock ran off coupons and hand entered uses,
   * so a welder running a seam every day of the week could still lapse on
   * paper.
   */
  registerEntries(): readonly RegisterEntry[] {
    return this.personnel.entries().map((entry) => ({
      ...entry,
      usageDates: mergeDates(
        entry.usageDates,
        this.fabrication.usageDates(entry.qualification.stencil, entry.qualification.process),
      ),
    }));
  }

  entryCount(): number {
    return this.journal.length();
  }

  /**
   * Push everything written to the disk and give the workspace lock up. Every
   * command calls this when it finishes, and so should anything else that
   * writes and then stops.
   */
  release(): void {
    if (this.journal instanceof LockingJournal) {
      this.journal.release();
      return;
    }
    this.journal.flush?.();
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

/**
 * Bring an older workspace forward, keeping the file it started from.
 *
 * The backup is not tidied up afterwards on purpose. It is the only copy of
 * the journal with its original hashes, and the disk it costs is nothing
 * against being able to show an inspector what the record said before the
 * program touched it.
 */
function migrateIfNeeded(
  path: string,
  marker: WorkspaceMarker,
  journal: FileJournal,
  clock: Clock,
  readOnly: boolean,
): WorkspaceMarker {
  if (migrationsFrom(marker.schemaVersion).length === 0) {
    return marker;
  }
  if (readOnly) {
    throw new StorageError(
      `the workspace at ${path} is at schema ${marker.schemaVersion} and has been opened read only, so it cannot be brought forward`,
      { directory: path, schemaVersion: marker.schemaVersion },
    );
  }
  const journalPath = join(path, JOURNAL);
  copyFileSync(journalPath, `${journalPath}.schema${String(marker.schemaVersion)}`);

  const result = migrate(journal.read(), marker.schemaVersion);
  journal.rewrite(result.entries);
  journal.append({
    type: 'workspace.migrated',
    actor: 'arc',
    at: clock.now().toISOString(),
    payload: {
      from: result.from,
      to: result.to,
      rewritten: result.rewritten,
      dropped: result.dropped,
      description: describeMigration(result),
    },
  });

  const updated: WorkspaceMarker = { ...marker, schemaVersion: result.to };
  writeFileSync(join(path, MARKER), `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

function mergeDates(left: readonly PlainDate[], right: readonly PlainDate[]): readonly PlainDate[] {
  const days = new Set([...left, ...right].map((day) => day.toString()));
  return [...days].sort().map((day) => PlainDate.parse(day));
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
