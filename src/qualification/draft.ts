import { Interval } from '../core/interval.js';
import { DocumentNumber } from '../core/identifier.js';
import type { PlainDate } from '../core/plainDate.js';
import { Length } from '../core/units.js';
import type { ProcedureQualificationRecord } from './pqr.js';
import { scopesFor, type QualifiedScope } from './qualifiedRanges.js';
import { supportFindings } from './support.js';
import type { ProcedureClaim, PwhtClaim, WeldingProcedureSpecification } from './wps.js';

/**
 * Writing the widest procedure a record will support.
 *
 * A welding engineer writing a procedure from a record by hand copies twenty
 * fields across and, sooner or later, claims a range the record does not
 * quite reach. The draft below cannot do that: every field comes out of the
 * record's own qualified scope, so the procedure it produces is supported by
 * construction and the support check on it is a tautology rather than a test.
 *
 * That is also its limit and it is worth being plain about. A procedure this
 * wide is legal and it is not always sensible. A shop usually wants a narrow
 * procedure that says what to do rather than the widest one the paperwork
 * permits, and narrowing is what the engineer does next.
 */

export interface DraftOptions {
  readonly number: DocumentNumber;
  readonly title: string;
  readonly issuedOn: PlainDate;
  /** Restrict the draft to these processes, in this order. */
  readonly processes?: readonly string[] | undefined;
}

export function draftFrom(
  record: ProcedureQualificationRecord,
  options: DraftOptions,
): WeldingProcedureSpecification {
  const scopes = scopesFor(record).filter(
    (scope) => options.processes === undefined || options.processes.includes(scope.process),
  );
  const layers = scopes.map((scope) => claimFrom(scope));
  const first = scopes[0];

  return {
    number: options.number,
    title: options.title,
    issuedOn: options.issuedOn,
    supportedBy: [record.number.key()],
    weldType: record.weldType,
    productForm: record.productForm,
    pNumbers: first === undefined ? [] : [...first.pNumbers],
    groupNumbers: first === undefined ? [] : [...first.groupNumbers],
    baseMetalThickness: narrowest(scopes),
    positions: first === undefined ? [] : [...first.positions],
    layers,
    pwht: (first?.heatTreatment ?? 'none') as PwhtClaim,
    toughnessQualified: record.toughnessRequired,
  };
}

function claimFrom(scope: QualifiedScope): ProcedureClaim {
  return {
    process: scope.process,
    fNumbers: [...scope.fNumbers],
    aNumber: scope.aNumber,
    depositThickness: scope.depositThickness,
    progression: scope.progression,
    preheatMinimum: scope.preheatMinimum,
    interpassMaximum: scope.interpassMaximum,
    heatInputCap: scope.heatInputCap,
  };
}

function narrowest(scopes: readonly QualifiedScope[]): Interval<Length> {
  const first = scopes[0];
  if (first === undefined) {
    return Interval.closed(Length.zero(), Length.zero());
  }
  return scopes
    .slice(1)
    .reduce(
      (running, scope) => running.intersect(scope.baseMetalThickness),
      first.baseMetalThickness,
    );
}

/**
 * A draft is only worth anything if it is supported, and that is checked here
 * rather than assumed. If this ever fails it means the scope derivation and
 * the support check disagree, which is a bug in one of them.
 */
export function draftIsSupported(
  record: ProcedureQualificationRecord,
  draft: WeldingProcedureSpecification,
): boolean {
  return supportFindings(draft, [record]).supported;
}

export function nextDraftNumber(existing: readonly DocumentNumber[]): DocumentNumber {
  const highest = existing
    .filter((number) => number.series === 'WPS')
    .reduce((best, number) => Math.max(best, number.sequence), 0);
  return DocumentNumber.of('WPS', highest + 1, 0);
}
