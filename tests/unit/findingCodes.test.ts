import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The finding codes are an interface.
 *
 * A shop scripts against them. `arc report exceptions` piped into grep for
 * `continuity.lapsed` is a real thing somebody does, and it stops working the
 * day two modules both decide to emit `status.open`. Nothing in the type
 * system stops that, so the invariant is checked here instead:
 *
 *   every code is emitted from exactly one module
 *   every code is prefixed with something that says where it came from
 *   every code is lower case with dots and underscores and nothing else
 *
 * The prefix rule is the one that pays. A finding read off a terminal three
 * rooms away from the source is much easier to place when its code says which
 * part of the system had the opinion.
 */

interface Emitted {
  code: string;
  module: string;
}

function sourcesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      found.push(...sourcesUnder(path));
    } else if (item.name.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

function emittedCodes(): Emitted[] {
  const pattern = /\b(?:blocking|deficiency|advisory|finding)\(\s*(?:'([^']+)'|"([^"]+)")/g;
  const found: Emitted[] = [];
  for (const path of sourcesUnder('src')) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const code = match[1] ?? match[2];
      if (!code?.includes('.')) {
        continue;
      }
      found.push({ code, module: path });
    }
  }
  return found;
}

const emitted = emittedCodes();

describe('the finding codes', () => {
  it('exist at all, so this test is testing something', () => {
    expect(emitted.length).toBeGreaterThan(80);
  });

  it('are lower case with dots and underscores and nothing else', () => {
    const odd = [...new Set(emitted.map((item) => item.code))].filter(
      (code) => !/^[a-z][a-z0-9]*(?:\.[a-z0-9_]+)+$/.test(code),
    );
    expect(odd).toEqual([]);
  });

  it('carry a prefix that says which part of the system had the opinion', () => {
    const withoutPrefix = [...new Set(emitted.map((item) => item.code))].filter(
      (code) => code.split('.').length < 2,
    );
    expect(withoutPrefix).toEqual([]);
  });

  it('are each emitted from one module only', () => {
    const modulesByCode = new Map<string, Set<string>>();
    for (const item of emitted) {
      const held = modulesByCode.get(item.code) ?? new Set<string>();
      held.add(item.module);
      modulesByCode.set(item.code, held);
    }
    const shared = [...modulesByCode.entries()]
      .filter(([, modules]) => modules.size > 1)
      .map(([code, modules]) => `${code} from ${[...modules].join(' and ')}`);
    expect(shared).toEqual([]);
  });

  it('share a prefix only with codes from the same area', () => {
    const areasByPrefix = new Map<string, Set<string>>();
    for (const item of emitted) {
      const prefix = item.code.split('.')[0] ?? '';
      const area = item.module.split('/')[1] ?? '';
      const held = areasByPrefix.get(prefix) ?? new Set<string>();
      held.add(area);
      areasByPrefix.set(prefix, held);
    }
    const crossing = [...areasByPrefix.entries()]
      .filter(([, areas]) => areas.size > 1)
      .map(([prefix, areas]) => `${prefix} in ${[...areas].join(' and ')}`);
    expect(crossing).toEqual([]);
  });
});
