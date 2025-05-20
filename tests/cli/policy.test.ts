import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { memoryContext, type Context } from '../../src/cli/context.js';
import { EXIT_INPUT } from '../../src/cli/exitCodes.js';
import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';
import { FixedClock } from '../../src/core/clock.js';
import { policyFrom } from '../../src/policy/shopPolicy.js';

let context: Context;
let directory: string;

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out, context);
  return { out, result };
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-policy-cli-'));
  context = memoryContext({ clock: new FixedClock('2025-05-20T09:00:00.000Z'), actor: 'kd' });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('arc policy show and defaults', () => {
  it('shows what the workspace is running on', async () => {
    const { out } = await invoke('policy', 'show');
    expect(out.text()).toContain('continuity:                   6 months');
    expect(out.text()).toContain('repair suspend level:         10 percent');
  });

  it('shows the defaults and the cap the code puts on them', async () => {
    const { out } = await invoke('policy', 'defaults');
    expect(out.text()).toContain('Default policy');
    expect(out.text()).toContain('caps continuity at 6 months');
  });

  it('shows a policy the workspace actually holds', async () => {
    context = memoryContext({
      clock: new FixedClock('2025-05-20T09:00:00.000Z'),
      policy: policyFrom({ continuityMonths: 3 }),
    });
    const { out } = await invoke('policy', 'show');
    expect(out.text()).toContain('continuity:                   3 months');
  });
});

describe('arc policy check', () => {
  const write = (body: unknown) => {
    const path = join(directory, 'policy.json');
    writeFileSync(path, JSON.stringify(body), 'utf8');
    return path;
  };

  it('reads a file without adopting it', async () => {
    const { out } = await invoke('policy', 'check', write({ continuityMonths: 4 }));
    expect(out.text()).toContain('continuity:                   4 months');
    expect(context.workspace().policy.continuityMonths).toBe(6);
  });

  it('marks the fields that differ from the defaults', async () => {
    const { out } = await invoke('policy', 'check', write({ continuityMonths: 4 }));
    expect(out.text()).toMatch(/^continuity\s+4 months\s+6 months\s+yes$/m);
    expect(out.text()).toMatch(/^repair window\s+90 days\s+90 days\s*$/m);
  });

  it('refuses a file that asks to be looser than the code', async () => {
    const { result, out } = await invoke('policy', 'check', write({ continuityMonths: 12 }));
    expect(result.code).toBe(EXIT_INPUT);
    expect(out.errorText()).toContain('the code allows at most');
  });

  it('refuses a file that is not an object', async () => {
    const { result, out } = await invoke('policy', 'check', write([1, 2]));
    expect(result.code).toBe(EXIT_INPUT);
    expect(out.errorText()).toContain('is not an object');
  });

  it('refuses a file it cannot find', async () => {
    const { result } = await invoke('policy', 'check', join(directory, 'missing.json'));
    expect(result.code).toBe(EXIT_INPUT);
  });
});

describe('arc policy workspace', () => {
  it('reads the defaults from a directory with no policy file', async () => {
    const { out } = await invoke('policy', 'workspace', directory);
    expect(out.text()).toContain('continuity:                   6 months');
  });

  it('reads one that is there', async () => {
    writeFileSync(join(directory, 'policy.json'), JSON.stringify({ continuityMonths: 5 }), 'utf8');
    const { out } = await invoke('policy', 'workspace', directory);
    expect(out.text()).toContain('continuity:                   5 months');
  });
});
