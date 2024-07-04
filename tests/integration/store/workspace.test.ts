import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { StorageError, ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { defaultWorkspacePath, SCHEMA_VERSION, Workspace } from '../../../src/store/workspace.js';
import { sampleWelder } from '../../support/welders.js';

let directory: string;
const clock = new FixedClock('2024-07-01T08:00:00.000Z');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-workspace-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('creating a workspace', () => {
  it('refuses to open one that is not there', () => {
    expect(() => Workspace.open(join(directory, 'missing'), { clock })).toThrow(StorageError);
    expect(() => Workspace.open(join(directory, 'missing'), { clock })).toThrow(/no workspace at/);
  });

  it('creates one when asked and writes the marker', () => {
    const workspace = Workspace.open(join(directory, 'shop'), {
      clock,
      create: true,
      shop: 'bay four',
    });
    expect(workspace.marker.schemaVersion).toBe(SCHEMA_VERSION);
    expect(workspace.marker.shop).toBe('bay four');
    const marker = JSON.parse(readFileSync(join(directory, 'shop', 'arc.json'), 'utf8')) as {
      shop: string;
    };
    expect(marker.shop).toBe('bay four');
  });

  it('opens an existing one without the create flag', () => {
    Workspace.open(directory, { clock, create: true });
    const reopened = Workspace.open(directory, { clock });
    expect(reopened.marker.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('the records survive a reopen', () => {
  it('reads back what a previous run wrote', () => {
    const first = Workspace.open(directory, { clock, create: true });
    first.personnel.registerWelder(sampleWelder(), 'kd');
    first.personnel.recordUse('W-118', 'SMAW', date('2024-06-30'), 'foreman');
    expect(first.entryCount()).toBe(2);

    const second = Workspace.open(directory, { clock });
    expect(second.personnel.welders().map((welder) => welder.stencil)).toEqual(['W-118']);
    expect(second.entryCount()).toBe(2);
  });
});

describe('a marker it will not read', () => {
  it('refuses a workspace written by a newer schema', () => {
    Workspace.open(directory, { clock, create: true });
    writeFileSync(
      join(directory, 'arc.json'),
      JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, shop: 'later' }),
      'utf8',
    );
    expect(() => Workspace.open(directory, { clock })).toThrow(/newer version of arc/);
  });

  it('refuses a marker that is not json', () => {
    Workspace.open(directory, { clock, create: true });
    writeFileSync(join(directory, 'arc.json'), 'not json at all', 'utf8');
    expect(() => Workspace.open(directory, { clock })).toThrow(/not readable json/);
  });

  it('refuses a marker with no schema version', () => {
    Workspace.open(directory, { clock, create: true });
    writeFileSync(join(directory, 'arc.json'), JSON.stringify({ shop: 'x' }), 'utf8');
    expect(() => Workspace.open(directory, { clock })).toThrow(ValidationError);
  });

  it('refuses a marker that is a list', () => {
    Workspace.open(directory, { clock, create: true });
    writeFileSync(join(directory, 'arc.json'), '[]', 'utf8');
    expect(() => Workspace.open(directory, { clock })).toThrow(/not an object/);
  });
});

describe('an in memory workspace', () => {
  it('works the same way and writes nothing', () => {
    const workspace = Workspace.inMemory({ clock });
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    expect(workspace.isInMemory()).toBe(true);
    expect(workspace.personnel.welders()).toHaveLength(1);
  });
});

describe('the default location', () => {
  it('takes the environment variable when it is set', () => {
    expect(defaultWorkspacePath({ ARC_HOME: '/shared/arc' })).toBe('/shared/arc');
    expect(defaultWorkspacePath({ ARC_HOME: '  ' })).toMatch(/\.arc$/);
  });

  it('falls back to a directory in the home folder', () => {
    expect(defaultWorkspacePath({})).toMatch(/\.arc$/);
  });
});
