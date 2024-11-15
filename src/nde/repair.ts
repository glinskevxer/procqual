import { advisory, blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Length } from '../core/units.js';
import type { Examination, IndicationType } from './examination.js';
import type { ExaminationMethod } from './requirement.js';

/**
 * Weld repairs.
 *
 * A repair is not a correction, it is a second weld in the same place, and it
 * carries everything a first weld carries: a procedure, a qualified welder, a
 * consumable lot, and an examination afterwards by the method that found the
 * fault in the first place. Examining a repair by an easier method than the
 * one that rejected it is the oldest shortcut there is.
 *
 * The attempt number is the field the quality department reads. A first repair
 * is ordinary. A second on the same spot means the excavation missed, or the
 * welder is struggling, or the joint fit up is wrong, and none of those are
 * fixed by welding it a third time without somebody looking.
 */

export interface Repair {
  readonly id: string;
  readonly joint: string;
  /** The examination that rejected the weld. */
  readonly raisedBy: string;
  readonly method: ExaminationMethod;
  readonly defect: IndicationType;
  /** Which go this is at the same place, starting at one. */
  readonly attempt: number;
  readonly excavationLength: Length;
  readonly excavationDepth: Length;
  readonly jointThickness: Length;
  readonly excavatedOn: PlainDate;
  readonly rewelderStencil: string;
  readonly reweldedOn?: PlainDate | undefined;
  readonly reExaminedBy?: string | undefined;
  readonly engineeringApproval?: string | undefined;
}

export const APPROVAL_NEEDED_FROM_ATTEMPT = 2;

/** A repair deeper than this fraction of the wall is a design question. */
const DEEP_EXCAVATION_FRACTION = '0.5';

export function isDeepExcavation(repair: Repair): boolean {
  if (!repair.jointThickness.toInches().isPositive()) {
    throw new ValidationError('jointThickness', 'the joint records no thickness', {
      id: repair.id,
    });
  }
  return repair.excavationDepth.greaterThan(
    repair.jointThickness.scaleBy(DEEP_EXCAVATION_FRACTION),
  );
}

export function needsEngineeringApproval(repair: Repair): boolean {
  return repair.attempt >= APPROVAL_NEEDED_FROM_ATTEMPT || isDeepExcavation(repair);
}

export function isComplete(repair: Repair): boolean {
  return repair.reweldedOn !== undefined && repair.reExaminedBy !== undefined;
}

export function reviewRepair(
  repair: Repair,
  reExamination: Examination | undefined,
): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = repair.id;

  if (!Number.isInteger(repair.attempt) || repair.attempt < 1) {
    findings.push(blocking('repair.bad_attempt', 'the attempt number starts at one', { subject }));
  }
  if (!repair.excavationLength.toInches().isPositive()) {
    findings.push(
      blocking('repair.no_excavation', 'the repair records no excavation', { subject }),
    );
  }
  if (repair.excavationDepth.greaterThan(repair.jointThickness)) {
    findings.push(
      blocking(
        'repair.through_wall',
        'the excavation is recorded as deeper than the joint is thick',
        { subject },
      ),
    );
  }
  if (needsEngineeringApproval(repair) && repair.engineeringApproval === undefined) {
    findings.push(
      blocking(
        'repair.needs_approval',
        repair.attempt >= APPROVAL_NEEDED_FROM_ATTEMPT
          ? `attempt ${repair.attempt} at the same place needs engineering approval before it is welded`
          : 'an excavation past half the wall needs engineering approval before it is welded',
        { clause: 'UW-38', subject },
      ),
    );
  }
  if (repair.reweldedOn === undefined) {
    findings.push(
      deficiency('repair.not_rewelded', 'the excavation is open and has not been rewelded', {
        subject,
      }),
    );
    return findings;
  }
  if (repair.reweldedOn.isBefore(repair.excavatedOn)) {
    findings.push(
      blocking('repair.rewelded_before_excavated', 'the reweld is dated before the excavation', {
        subject,
      }),
    );
  }
  if (repair.rewelderStencil.trim() === '') {
    findings.push(blocking('repair.no_welder', 'the reweld names no welder', { subject }));
  }
  if (reExamination === undefined) {
    findings.push(
      deficiency('repair.not_re_examined', 'the repair has not been examined again', { subject }),
    );
    return findings;
  }
  if (reExamination.joint !== repair.joint) {
    findings.push(
      blocking(
        'repair.wrong_joint',
        `the re-examination is against ${reExamination.joint} and the repair is on ${repair.joint}`,
        { subject },
      ),
    );
  }
  if (reExamination.method !== repair.method) {
    findings.push(
      blocking(
        'repair.weaker_method',
        `the fault was found by ${repair.method} and the repair was examined by ${reExamination.method}`,
        { clause: 'UW-38', subject },
      ),
    );
  }
  if (reExamination.performedOn.isBefore(repair.reweldedOn)) {
    findings.push(
      blocking('repair.examined_before_rewelded', 'the re-examination is dated before the reweld', {
        subject,
      }),
    );
  }
  if (repair.attempt >= APPROVAL_NEEDED_FROM_ATTEMPT) {
    findings.push(
      advisory(
        'repair.repeat',
        `this is attempt ${repair.attempt} at the same place, so the fit up and the welder are both worth looking at`,
        { subject },
      ),
    );
  }
  return findings;
}

export function repairsOnJoint(repairs: readonly Repair[], joint: string): readonly Repair[] {
  return repairs
    .filter((repair) => repair.joint === joint)
    .sort((left, right) => left.attempt - right.attempt);
}

export function openRepairs(repairs: readonly Repair[]): readonly Repair[] {
  return repairs.filter((repair) => !isComplete(repair));
}

/** Total length of weld cut out of a joint, across every attempt. */
export function excavatedLength(repairs: readonly Repair[], joint: string): Length | undefined {
  const relevant = repairsOnJoint(repairs, joint);
  const first = relevant[0];
  if (first === undefined) {
    return undefined;
  }
  return relevant
    .slice(1)
    .reduce((running, repair) => running.add(repair.excavationLength), first.excavationLength);
}
