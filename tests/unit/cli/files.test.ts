import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext } from '../../../src/cli/context.js';
import { onDate, readJsonFile, readTextFile, writeNewFile } from '../../../src/cli/files.js';
import { FixedClock } from '../../../src/core/clock.js';
import { ValidationError } from '../../../src/core/errors.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-files-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('reading', () => {
  it('reads a file', () => {
    const path = join(directory, 'a.txt');
    writeFileSync(path, 'hello', 'utf8');
    expect(readTextFile(path)).toBe('hello');
  });

  it('names the file it could not read', () => {
    expect(() => readTextFile(join(directory, 'missing.txt'))).toThrow(/cannot read/);
    expect(() => readTextFile(join(directory, 'missing.txt'))).toThrow(ValidationError);
  });

  it('reads json', () => {
    const path = join(directory, 'a.json');
    writeFileSync(path, '{"a":1}', 'utf8');
    expect(readJsonFile(path)).toEqual({ a: 1 });
  });

  it('separates a file it cannot read from one that is not json', () => {
    const path = join(directory, 'bad.json');
    writeFileSync(path, 'not json', 'utf8');
    expect(() => readJsonFile(path)).toThrow(/not readable json/);
    expect(() => readJsonFile(join(directory, 'missing.json'))).toThrow(/cannot read/);
  });
});

describe('writing', () => {
  it('writes a file and returns where it went', () => {
    const path = join(directory, 'out.txt');
    expect(writeNewFile(path, 'body')).toBe(path);
    expect(readFileSync(path, 'utf8')).toBe('body\n');
  });

  it('does not double the trailing newline', () => {
    const path = join(directory, 'out.txt');
    writeNewFile(path, 'body\n');
    expect(readFileSync(path, 'utf8')).toBe('body\n');
  });

  it('refuses to replace a file that is already there', () => {
    const path = join(directory, 'out.txt');
    writeFileSync(path, 'the signed one', 'utf8');
    expect(() => writeNewFile(path, 'the draft')).toThrow(/cannot write/);
    expect(readFileSync(path, 'utf8')).toBe('the signed one');
  });
});

describe('the date option', () => {
  const context = memoryContext({ clock: new FixedClock('2025-01-15T09:00:00.000Z') });

  it('falls back to today', () => {
    expect(onDate(context, undefined).toString()).toBe('2025-01-15');
  });

  it('reads what it was given', () => {
    expect(onDate(context, '2024-06-01').toString()).toBe('2024-06-01');
  });

  it('refuses a date it cannot read', () => {
    expect(() => onDate(context, 'yesterday')).toThrow(ValidationError);
  });
});
