import { advisory, blocking, deficiency, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import type { ProcedureQualificationRecord } from './pqr.js';
import { supportFindings } from './support.js';
import type { ProcedureClaim, WeldingProcedureSpecification } from './wps.js';

/**
 * Revising a procedure.
 *
 * Narrowing a claim is free and always has been. Nobody has to reweld a coupon
 * because a procedure stopped offering the overhead position. Widening one is
 * only free while a record already reaches that far, which is why a revision
 * is checked against the records rather than against the previous revision on
 * its own.
 *
 * The part that catches people is the toughness flag. Turning it on does not
 * widen a single range on the paper and it can still invalidate the whole
 * procedure, because it moves five supplementary variables into the essential
 * column and the supporting record may never have been graded on them.
 */

export type ClaimDirection = 'widened' | 'narrowed' | 'moved' | 'unchanged';

export interface ClaimMovement {
  readonly field: string;
  readonly direction: ClaimDirection;
  readonly detail: string;
}

export interface RevisionImpact {
  readonly movements: readonly ClaimMovement[];
  readonly widened: readonly ClaimMovement[];
  readonly findings: readonly Finding[];
  readonly needsNewRecord: boolean;
}

export function nextRevision(
  wps: WeldingProcedureSpecification,
  changes: Partial<WeldingProcedureSpecification>,
  issuedOn: PlainDate,
): WeldingProcedureSpecification {
  return {
    ...wps,
    ...changes,
    number: wps.number.nextRevision(),
    issuedOn,
  };
}

export function compareClaims(
  previous: WeldingProcedureSpecification,
  next: WeldingProcedureSpecification,
): readonly ClaimMovement[] {
  const movements: ClaimMovement[] = [];
  movements.push(setMovement('base metal P numbers', previous.pNumbers, next.pNumbers));
  movements.push(setMovement('group numbers', previous.groupNumbers, next.groupNumbers));
  movements.push(setMovement('positions', previous.positions, next.positions));
  movements.push(
    rangeMovement(
      'base metal thickness',
      previous.baseMetalThickness.covers(next.baseMetalThickness),
      next.baseMetalThickness.covers(previous.baseMetalThickness),
      `${previous.baseMetalThickness.toString()} to ${next.baseMetalThickness.toString()}`,
    ),
  );
  for (const claim of next.layers) {
    const before = previous.layers.find((layer) => layer.process === claim.process);
    if (before === undefined) {
      movements.push({
        field: `${claim.process}`,
        direction: 'widened',
        detail: `${claim.process} added to the procedure`,
      });
      continue;
    }
    movements.push(...layerMovements(before, claim));
  }
  for (const before of previous.layers) {
    if (!next.layers.some((layer) => layer.process === before.process)) {
      movements.push({
        field: `${before.process}`,
        direction: 'narrowed',
        detail: `${before.process} removed from the procedure`,
      });
    }
  }
  if (previous.toughnessQualified !== next.toughnessQualified) {
    movements.push({
      field: 'notch toughness',
      direction: next.toughnessQualified ? 'widened' : 'narrowed',
      detail: next.toughnessQualified
        ? 'the procedure is now offered for toughness work'
        : 'the procedure is no longer offered for toughness work',
    });
  }
  if (previous.pwht !== next.pwht) {
    movements.push({
      field: 'heat treatment',
      direction: 'moved',
      detail: `heat treatment condition moved from ${previous.pwht} to ${next.pwht}`,
    });
  }
  return movements.filter((movement) => movement.direction !== 'unchanged');
}

export function assessRevision(
  previous: WeldingProcedureSpecification,
  next: WeldingProcedureSpecification,
  records: readonly ProcedureQualificationRecord[],
): RevisionImpact {
  const movements = compareClaims(previous, next);
  const widened = movements.filter((movement) => movement.direction !== 'narrowed');
  const support = supportFindings(next, records);
  const findings: Finding[] = [];

  if (
    next.number.isSameDocument(previous.number) &&
    next.number.revision === previous.number.revision
  ) {
    findings.push(
      blocking(
        'revision.same_number',
        'the revision carries the same number as the one before it',
        {
          subject: next.number.toString(),
        },
      ),
    );
  }
  if (next.issuedOn.isBefore(previous.issuedOn)) {
    findings.push(
      blocking('revision.issued_backwards', 'the revision is issued before the one it replaces', {
        subject: next.number.toString(),
      }),
    );
  }
  if (movements.length === 0) {
    findings.push(
      advisory('revision.no_change', 'nothing on the procedure actually moved', {
        subject: next.number.toString(),
      }),
    );
  }
  for (const movement of widened) {
    findings.push(deficiency('revision.widened', movement.detail, { subject: movement.field }));
  }
  findings.push(...support.findings);

  return {
    movements,
    widened,
    findings,
    needsNewRecord: !support.supported,
  };
}

function layerMovements(before: ProcedureClaim, after: ProcedureClaim): readonly ClaimMovement[] {
  const movements: ClaimMovement[] = [];
  movements.push(setMovement(`${after.process} filler groups`, before.fNumbers, after.fNumbers));
  movements.push(
    rangeMovement(
      `${after.process} deposit thickness`,
      before.depositThickness.covers(after.depositThickness),
      after.depositThickness.covers(before.depositThickness),
      `${before.depositThickness.toString()} to ${after.depositThickness.toString()}`,
    ),
  );
  if (!before.preheatMinimum.equals(after.preheatMinimum)) {
    movements.push({
      field: `${after.process} preheat`,
      direction: after.preheatMinimum.isBelow(before.preheatMinimum) ? 'widened' : 'narrowed',
      detail: `preheat minimum moved from ${before.preheatMinimum.toString()} to ${after.preheatMinimum.toString()}`,
    });
  }
  if (!before.interpassMaximum.equals(after.interpassMaximum)) {
    movements.push({
      field: `${after.process} interpass`,
      direction: after.interpassMaximum.isAbove(before.interpassMaximum) ? 'widened' : 'narrowed',
      detail: `interpass maximum moved from ${before.interpassMaximum.toString()} to ${after.interpassMaximum.toString()}`,
    });
  }
  if (before.progression !== after.progression) {
    movements.push({
      field: `${after.process} progression`,
      direction: 'moved',
      detail: `vertical progression moved from ${before.progression} to ${after.progression}`,
    });
  }
  return movements;
}

function setMovement<T>(field: string, before: readonly T[], after: readonly T[]): ClaimMovement {
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  if (added.length === 0 && removed.length === 0) {
    return { field, direction: 'unchanged', detail: 'no change' };
  }
  if (added.length > 0 && removed.length === 0) {
    return { field, direction: 'widened', detail: `${field} gained ${added.join(', ')}` };
  }
  if (removed.length > 0 && added.length === 0) {
    return { field, direction: 'narrowed', detail: `${field} lost ${removed.join(', ')}` };
  }
  return {
    field,
    direction: 'moved',
    detail: `${field} gained ${added.join(', ')} and lost ${removed.join(', ')}`,
  };
}

function rangeMovement(
  field: string,
  previousCoversNext: boolean,
  nextCoversPrevious: boolean,
  detail: string,
): ClaimMovement {
  if (previousCoversNext && nextCoversPrevious) {
    return { field, direction: 'unchanged', detail: 'no change' };
  }
  if (previousCoversNext) {
    return { field, direction: 'narrowed', detail };
  }
  if (nextCoversPrevious) {
    return { field, direction: 'widened', detail };
  }
  return { field, direction: 'moved', detail };
}
