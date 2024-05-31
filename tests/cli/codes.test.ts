import { describe, expect, it } from 'vitest';

import { RecordingOutput } from '../../src/cli/output.js';
import { run } from '../../src/cli/program.js';

const invoke = async (...argv: string[]) => {
  const out = new RecordingOutput();
  const result = await run(argv, out);
  return { out, result };
};

describe('arc codes p-numbers', () => {
  it('prints the table with the downward reach', async () => {
    const { out, result } = await invoke('codes', 'p-numbers');
    expect(result.code).toBe(0);
    expect(out.text()).toContain('Base metal P numbers');
    expect(out.text()).toMatch(/^4\s+one and a quarter.*4, 3, 1$/m);
  });
});

describe('arc codes f-numbers', () => {
  it('defaults to shielded metal arc and shows the ladder', async () => {
    const { out } = await invoke('codes', 'f-numbers');
    expect(out.text()).toContain('as run with SMAW');
    expect(out.text()).toMatch(/^\s*4\s+low hydrogen electrodes\s+yes\s+1, 2, 3, 4$/m);
  });

  it('says which groups are not used with the process asked for', async () => {
    const { out } = await invoke('codes', 'f-numbers', '--process', 'GTAW');
    expect(out.text()).toMatch(/^\s*4\s+low hydrogen electrodes\s+yes\s+not used$/m);
    expect(out.text()).toMatch(/^\s*6\s.*\s6$/m);
  });

  it('refuses a process the shop does not run', async () => {
    const { out, result } = await invoke('codes', 'f-numbers', '--process', 'EBW');
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a process this shop runs');
  });
});

describe('arc codes positions', () => {
  it('shows the groove column by default', async () => {
    const { out } = await invoke('codes', 'positions');
    expect(out.text()).toContain('Positions qualified for groove welds');
    expect(out.text()).toMatch(/^3F\s+nothing$/m);
  });

  it('shows the fillet column when asked', async () => {
    const { out } = await invoke('codes', 'positions', '--fillet');
    expect(out.text()).toMatch(/^3F\s+flat, horizontal, vertical$/m);
  });
});

describe('arc codes combine', () => {
  it('adds two coupons together', async () => {
    const { out } = await invoke('codes', 'combine', '2G', '5G');
    expect(out.text()).toBe(
      '2G + 5G qualifies flat, horizontal, vertical, overhead for groove welds',
    );
  });

  it('says nothing when the coupons buy nothing', async () => {
    const { out } = await invoke('codes', 'combine', '3F');
    expect(out.text()).toBe('3F qualifies nothing for groove welds');
  });

  it('refuses a position that does not exist', async () => {
    const { out, result } = await invoke('codes', 'combine', '7G');
    expect(result.code).toBe(2);
    expect(out.errorText()).toContain('not a test position');
  });
});

describe('arc codes filler', () => {
  it('reads the groups out of a classification', async () => {
    const { out } = await invoke('codes', 'filler', 'SFA-5.1', 'E7018');
    expect(out.text()).toBe('SFA-5.1 E7018, F-No 4, A-No 1');
  });

  it('refuses one it cannot read', async () => {
    const { result } = await invoke('codes', 'filler', 'SFA-5.1', 'XYZ');
    expect(result.code).toBe(2);
  });
});

describe('the program itself', () => {
  it('reports its version', async () => {
    const { result } = await invoke('--version');
    expect(result.code).toBe(0);
  });

  it('does not throw on an unknown command', async () => {
    const { result } = await invoke('nonsense');
    expect(result.code).toBeGreaterThan(0);
  });
});
