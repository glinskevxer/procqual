import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Decimal, decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import {
  optional,
  parseWith,
  readDecimal,
  readInteger,
  readRecord,
  refine,
  describeIssues,
} from '../core/schema.js';

/**
 * The numbers a shop is allowed to choose for itself.
 *
 * Most of the figures in this system come out of the construction code and
 * are not anybody's to change. A few are the shop's own: how long a welder
 * may go between runs before the quality department wants a coupon, what
 * repair rate puts somebody on the watch list, how much of a rolling window
 * counts. The code sets a floor on some of these and says nothing at all
 * about others.
 *
 * Keeping them here rather than scattered as constants matters because they
 * get argued about. When a quality manager asks why a welder was suspended,
 * the answer has to be a number in a file with a date on it, not a literal
 * three screens into a source file nobody outside the office can read.
 */

export interface ShopPolicy {
  /** Months a welder may go without running a process. The code caps this at six. */
  readonly continuityMonths: number;
  /** Days in the rolling repair rate window. */
  readonly repairWindowDays: number;
  /** Joints below which a repair rate is watched rather than acted on. */
  readonly repairMinimumSample: number;
  readonly repairWatchAt: Decimal;
  readonly repairSuspendAt: Decimal;
  /** Days before a qualification lapses that the register starts warning. */
  readonly continuityWarningDays: number;
  /** Attempts at the same place before engineering has to approve the next. */
  readonly repairApprovalFromAttempt: number;
}

export const CODE_CONTINUITY_LIMIT_MONTHS = 6;

export const DEFAULT_POLICY: ShopPolicy = {
  continuityMonths: 6,
  repairWindowDays: 90,
  repairMinimumSample: 10,
  repairWatchAt: decimal('0.05'),
  repairSuspendAt: decimal('0.10'),
  continuityWarningDays: 30,
  repairApprovalFromAttempt: 2,
};

const POLICY_FILE = 'policy.json';

const positiveInteger = (what: string) =>
  refine(readInteger, `${what} must be greater than zero`, (value) => value > 0);

const policyReader = readRecord({
  continuityMonths: optional(positiveInteger('the continuity window')),
  repairWindowDays: optional(positiveInteger('the repair rate window')),
  repairMinimumSample: optional(positiveInteger('the minimum sample')),
  repairWatchAt: optional(readDecimal),
  repairSuspendAt: optional(readDecimal),
  continuityWarningDays: optional(positiveInteger('the warning window')),
  repairApprovalFromAttempt: optional(positiveInteger('the approval threshold')),
});

/** Fields a caller may leave out, or hand over as undefined without meaning it. */
export type PolicyOverrides = {
  readonly [K in keyof ShopPolicy]?: ShopPolicy[K] | undefined;
};

export function policyFrom(overrides: PolicyOverrides): ShopPolicy {
  const policy: ShopPolicy = { ...DEFAULT_POLICY, ...stripUndefined(overrides) };
  assertUsable(policy);
  return policy;
}

/**
 * A shop may be stricter than the code and may not be looser. Six months is
 * the outside limit on continuity wherever it is written down, and a watch
 * level above the suspend level would mean nobody was ever watched.
 */
export function assertUsable(policy: ShopPolicy): void {
  if (policy.continuityMonths > CODE_CONTINUITY_LIMIT_MONTHS) {
    throw new ValidationError(
      'continuityMonths',
      `the code allows at most ${String(CODE_CONTINUITY_LIMIT_MONTHS)} months and the policy asks for ${String(policy.continuityMonths)}`,
      { continuityMonths: policy.continuityMonths },
    );
  }
  if (policy.repairWatchAt.greaterThan(policy.repairSuspendAt)) {
    throw new ValidationError(
      'repairWatchAt',
      'the watch level is above the suspend level, so nobody would ever be watched',
      {
        watch: policy.repairWatchAt.toString(),
        suspend: policy.repairSuspendAt.toString(),
      },
    );
  }
  if (policy.repairSuspendAt.greaterThan(decimal('1'))) {
    throw new ValidationError('repairSuspendAt', 'a repair rate is a fraction, not a percentage', {
      suspend: policy.repairSuspendAt.toString(),
    });
  }
}

export function loadPolicy(directory: string): ShopPolicy {
  const path = join(directory, POLICY_FILE);
  if (!existsSync(path)) {
    return DEFAULT_POLICY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ValidationError('policy', `${path} is not readable json`, { path });
  }
  const read = parseWith(policyReader, parsed);
  if (!read.ok) {
    throw new ValidationError('policy', `${path}: ${describeIssues(read.error)}`, { path });
  }
  return policyFrom(read.value);
}

export function describePolicy(policy: ShopPolicy): readonly (readonly [string, string])[] {
  return [
    ['continuity', `${String(policy.continuityMonths)} months`],
    ['continuity warning', `${String(policy.continuityWarningDays)} days`],
    ['repair window', `${String(policy.repairWindowDays)} days`],
    ['repair minimum sample', `${String(policy.repairMinimumSample)} joints`],
    ['repair watch level', percent(policy.repairWatchAt)],
    ['repair suspend level', percent(policy.repairSuspendAt)],
    ['repair approval from attempt', String(policy.repairApprovalFromAttempt)],
  ];
}

function percent(value: Decimal): string {
  return `${value.multiply(decimal('100')).round(1, 'half-up').normalized().toString()} percent`;
}

function stripUndefined(overrides: PolicyOverrides): Partial<ShopPolicy> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<ShopPolicy>;
}
