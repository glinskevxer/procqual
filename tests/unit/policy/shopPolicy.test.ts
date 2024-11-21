import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import {
  assertUsable,
  CODE_CONTINUITY_LIMIT_MONTHS,
  DEFAULT_POLICY,
  describePolicy,
  loadPolicy,
  policyFrom,
} from '../../../src/policy/shopPolicy.js';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'arc-policy-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('the defaults', () => {
  it('sit at what the code allows', () => {
    expect(DEFAULT_POLICY.continuityMonths).toBe(CODE_CONTINUITY_LIMIT_MONTHS);
    expect(DEFAULT_POLICY.repairWindowDays).toBe(90);
  });

  it('are usable', () => {
    expect(() => assertUsable(DEFAULT_POLICY)).not.toThrow();
  });
});

describe('overriding', () => {
  it('takes only the fields that were given', () => {
    const policy = policyFrom({ continuityMonths: 3 });
    expect(policy.continuityMonths).toBe(3);
    expect(policy.repairWindowDays).toBe(DEFAULT_POLICY.repairWindowDays);
  });

  it('ignores a field given as undefined', () => {
    const policy = policyFrom({ continuityMonths: undefined });
    expect(policy.continuityMonths).toBe(6);
  });

  it('lets a shop be stricter than the code', () => {
    expect(policyFrom({ continuityMonths: 4 }).continuityMonths).toBe(4);
  });

  it('will not let a shop be looser', () => {
    expect(() => policyFrom({ continuityMonths: 12 })).toThrow(ValidationError);
    expect(() => policyFrom({ continuityMonths: 12 })).toThrow(/the code allows at most 6 months/);
  });

  it('refuses a watch level above the suspend level', () => {
    expect(() =>
      policyFrom({ repairWatchAt: decimal('0.2'), repairSuspendAt: decimal('0.1') }),
    ).toThrow(/nobody would ever be watched/);
  });

  it('refuses a rate written as a percentage', () => {
    expect(() => policyFrom({ repairSuspendAt: decimal('10') })).toThrow(
      /a fraction, not a percentage/,
    );
  });
});

describe('loading from the workspace', () => {
  it('uses the defaults when there is no file', () => {
    expect(loadPolicy(directory)).toEqual(DEFAULT_POLICY);
  });

  it('reads what the file sets and leaves the rest alone', () => {
    writeFileSync(
      join(directory, 'policy.json'),
      JSON.stringify({ continuityMonths: 4, repairMinimumSample: 20 }),
      'utf8',
    );
    const policy = loadPolicy(directory);
    expect(policy.continuityMonths).toBe(4);
    expect(policy.repairMinimumSample).toBe(20);
    expect(policy.repairWatchAt.toString()).toBe('0.05');
  });

  it('reads a rate written as a decimal string', () => {
    writeFileSync(
      join(directory, 'policy.json'),
      JSON.stringify({ repairWatchAt: '0.03' }),
      'utf8',
    );
    expect(loadPolicy(directory).repairWatchAt.toString()).toBe('0.03');
  });

  it('refuses a file it cannot read', () => {
    writeFileSync(join(directory, 'policy.json'), 'not json', 'utf8');
    expect(() => loadPolicy(directory)).toThrow(/not readable json/);
  });

  it('names the field it could not accept', () => {
    writeFileSync(join(directory, 'policy.json'), JSON.stringify({ repairWindowDays: 0 }), 'utf8');
    expect(() => loadPolicy(directory)).toThrow(/repair rate window must be greater than zero/);
  });

  it('applies the code limit to a file as well as to an override', () => {
    writeFileSync(join(directory, 'policy.json'), JSON.stringify({ continuityMonths: 9 }), 'utf8');
    expect(() => loadPolicy(directory)).toThrow(/the code allows at most/);
  });
});

describe('describing a policy', () => {
  it('reads back as plain figures with units', () => {
    const described = Object.fromEntries(describePolicy(DEFAULT_POLICY));
    expect(described.continuity).toBe('6 months');
    expect(described['repair watch level']).toBe('5 percent');
    expect(described['repair suspend level']).toBe('10 percent');
  });
});
