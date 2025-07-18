import type { Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import {
  continuityFindings,
  continuityStatusOn,
  dueWithinDays,
  type ContinuityStatus,
} from '../personnel/continuity.js';
import type { PerformanceQualification } from '../personnel/welder.js';
import type { Workspace } from '../store/workspace.js';

/**
 * The continuity clock read for the whole register at once.
 *
 * Three callers were each folding the weld log into the register, reading the
 * clock against the shop policy and sorting the result, and every one of them
 * had to remember to pass the policy. One of them did not, which is a quiet
 * way to report a three month shop on the six month rule.
 */

export interface ContinuityRow {
  readonly qualification: PerformanceQualification;
  readonly status: ContinuityStatus;
}

export function continuityRows(workspace: Workspace, on: PlainDate): readonly ContinuityRow[] {
  return workspace
    .registerEntries()
    .map((entry) => ({
      qualification: entry.qualification,
      status: continuityStatusOn(entry.qualification, entry.usageDates, on, workspace.policy),
    }))
    .sort((left, right) => left.status.daysRemaining - right.status.daysRemaining);
}

export function dueRows(rows: readonly ContinuityRow[], days: number): readonly ContinuityRow[] {
  return dueWithinDays(rows, days);
}

export function lapsedRows(rows: readonly ContinuityRow[]): readonly ContinuityRow[] {
  return rows.filter((row) => row.status.state === 'lapsed');
}

export function continuityReportFindings(
  workspace: Workspace,
  rows: readonly ContinuityRow[],
): readonly Finding[] {
  return rows.flatMap((row) => continuityFindings(row.qualification, row.status, workspace.policy));
}
