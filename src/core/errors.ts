/**
 * Errors and findings.
 *
 * Two different things live in here and it is worth keeping them apart. An
 * `ArcError` is something that went wrong: a missing record, a malformed
 * field, a broken journal. A `Finding` is a rule speaking: the coupon is out
 * of range, the welder is out of continuity, the joint has no radiography.
 * Findings are the product of the system, not a fault in it, and they carry
 * the clause they came from so a reviewer can check the call.
 */

export type ErrorCode =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'storage'
  | 'unsupported'
  | 'internal';

export class ArcError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ArcError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }

  toJSON(): { code: ErrorCode; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: { ...this.details } };
  }
}

export class ValidationError extends ArcError {
  readonly field: string;

  constructor(field: string, message: string, details: Record<string, unknown> = {}) {
    super('validation', message, { ...details, field });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class NotFoundError extends ArcError {
  constructor(kind: string, id: string) {
    super('not_found', `no ${kind} with id ${id}`, { kind, id });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ArcError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('conflict', message, details);
    this.name = 'ConflictError';
  }
}

export class StorageError extends ArcError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super('storage', message, details);
    this.name = 'StorageError';
  }
}

/**
 * How much a finding matters.
 *
 * `blocking` stops the work. `deficiency` records something the code requires
 * that has not been done yet but still can be. `advisory` is a note for the
 * reviewer and never fails anything on its own.
 */
export type Severity = 'blocking' | 'deficiency' | 'advisory';

const SEVERITY_ORDER: Record<Severity, number> = {
  blocking: 3,
  deficiency: 2,
  advisory: 1,
};

export interface Finding {
  readonly severity: Severity;
  /** A stable machine key, for example `wps.thickness_out_of_range`. */
  readonly code: string;
  readonly message: string;
  /** The code clause this call rests on, for example `QW-451.1`. */
  readonly clause?: string | undefined;
  readonly subject?: string | undefined;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

export function finding(
  severity: Severity,
  code: string,
  message: string,
  extra: Omit<Finding, 'severity' | 'code' | 'message'> = {},
): Finding {
  const built: Finding = { severity, code, message, ...extra };
  return Object.freeze(built);
}

export function blocking(
  code: string,
  message: string,
  extra: Omit<Finding, 'severity' | 'code' | 'message'> = {},
): Finding {
  return finding('blocking', code, message, extra);
}

export function deficiency(
  code: string,
  message: string,
  extra: Omit<Finding, 'severity' | 'code' | 'message'> = {},
): Finding {
  return finding('deficiency', code, message, extra);
}

export function advisory(
  code: string,
  message: string,
  extra: Omit<Finding, 'severity' | 'code' | 'message'> = {},
): Finding {
  return finding('advisory', code, message, extra);
}

/** True when nothing in the list stops the work. */
export function isAcceptable(findings: readonly Finding[]): boolean {
  return !findings.some((item) => item.severity === 'blocking');
}

/** True when the list is completely clean, deficiencies included. */
export function isClean(findings: readonly Finding[]): boolean {
  return findings.every((item) => item.severity === 'advisory');
}

export function worstSeverity(findings: readonly Finding[]): Severity | undefined {
  let worst: Severity | undefined;
  for (const item of findings) {
    if (worst === undefined || SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[worst]) {
      worst = item.severity;
    }
  }
  return worst;
}

/** Blocking first, then deficiencies, then advisories, stable within a rank. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (left, right) => SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity],
  );
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { blocking: 0, deficiency: 0, advisory: 0 };
  for (const item of findings) {
    counts[item.severity] += 1;
  }
  return counts;
}

/**
 * Group findings by what they are about, worst subject first.
 *
 * A list of forty findings sorted by severity reads as forty problems. The
 * same list grouped by subject usually reads as six, because one joint with a
 * bad radiograph, an open repair and no heat treatment chart is one
 * conversation rather than three.
 */
export function groupBySubject(
  findings: readonly Finding[],
): readonly { subject: string; findings: readonly Finding[] }[] {
  const groups = new Map<string, Finding[]>();
  for (const item of findings) {
    const key = item.subject ?? '';
    const held = groups.get(key) ?? [];
    held.push(item);
    groups.set(key, held);
  }
  return [...groups.entries()]
    .map(([subject, own]) => ({ subject, findings: sortFindings(own) }))
    .sort((left, right) => {
      const bySeverity =
        SEVERITY_ORDER[worstSeverity(right.findings) ?? 'advisory'] -
        SEVERITY_ORDER[worstSeverity(left.findings) ?? 'advisory'];
      if (bySeverity !== 0) {
        return bySeverity;
      }
      const byCount = right.findings.length - left.findings.length;
      if (byCount !== 0) {
        return byCount;
      }
      // Findings with nothing to hang them on go last. They are the ones a
      // reader can do least with, and putting them first buries the rest.
      if (left.subject === '' || right.subject === '') {
        return left.subject === '' ? 1 : -1;
      }
      return left.subject.localeCompare(right.subject);
    });
}

/** The clauses a list of findings rests on, for the covering note on a report. */
export function clausesCited(findings: readonly Finding[]): readonly string[] {
  return [
    ...new Set(
      findings
        .map((item) => item.clause)
        .filter((clause): clause is string => clause !== undefined),
    ),
  ].sort();
}

export function describeFinding(item: Finding): string {
  const clause = item.clause === undefined ? '' : ` [${item.clause}]`;
  const subject = item.subject === undefined ? '' : ` ${item.subject}:`;
  return `${item.severity.toUpperCase()}${subject} ${item.message}${clause}`;
}
