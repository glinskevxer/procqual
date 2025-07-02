import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INTERNAL_PREFIXES, PUBLIC_MODULES, isInternal, isPublic } from '../../src/publicApi.js';

function modulesUnder(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      found.push(...modulesUnder(path, `${prefix}${item.name}/`));
      continue;
    }
    if (!item.name.endsWith('.ts')) {
      continue;
    }
    const name = `${prefix}${item.name.replace(/\.ts$/, '')}`;
    if (name === 'index' || name === 'publicApi') {
      continue;
    }
    found.push(name);
  }
  return found.sort();
}

const modules = modulesUnder('src');
const barrel = readFileSync('src/index.ts', 'utf8');

describe('every module is either public or internal', () => {
  it('leaves none of them undecided', () => {
    const undecided = modules.filter((name) => !isPublic(name) && !isInternal(name));
    expect(undecided).toEqual([]);
  });

  it('calls none of them both', () => {
    const both = modules.filter((name) => isPublic(name) && isInternal(name));
    expect(both).toEqual([]);
  });

  it('names no module that does not exist', () => {
    const missing = PUBLIC_MODULES.filter((name) => !modules.includes(name));
    expect(missing).toEqual([]);
  });
});

describe('the barrel matches the promise', () => {
  it('exports every public module', () => {
    for (const name of PUBLIC_MODULES) {
      expect(barrel).toContain(`export * from './${name}.js';`);
    }
  });

  it('exports nothing internal', () => {
    for (const line of barrel.split('\n')) {
      const match = /export \* from '\.\/(.+)\.js';/.exec(line);
      if (match?.[1] !== undefined) {
        expect(isInternal(match[1])).toBe(false);
      }
    }
  });

  it('keeps the command line out of it', () => {
    expect(INTERNAL_PREFIXES).toContain('cli/');
    expect(barrel).not.toContain("from './cli/");
  });
});
