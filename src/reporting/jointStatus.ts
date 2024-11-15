import { advisory, blocking, deficiency, sortFindings, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Length } from '../core/units.js';
import { jointEfficiency, reviewJoint, type Joint } from '../fabrication/joint.js';
import { depositInJoint, weldersOnJoint, type WeldLogEntry } from '../fabrication/weldLog.js';
import { judgeExamination } from '../nde/acceptance.js';
import type { Examination } from '../nde/examination.js';
import { isComplete, type Repair } from '../nde/repair.js';
import { methodsRequired, volumetricExtent } from '../nde/requirement.js';

/**
 * The state of one joint, end to end.
 *
 * The question this answers is the one asked at a progress meeting: is that
 * joint finished. It is a harder question than it sounds because a joint can
 * be welded, radiographed and accepted and still not be finished, if the
 * radiograph that accepted it was taken before a heat treatment that the code
 * says has to come first.
 *
 * The stages are deliberately ordered and the report stops describing a joint
 * as further on than its earliest gap. A joint with no weld metal in it and a
 * clean radiograph on file is not nearly finished, it is a filing mistake.
 */

export type Stage = 'mapped' | 'welded' | 'examined' | 'repaired' | 'accepted';

export interface JointStatus {
  readonly joint: Joint;
  readonly stage: Stage;
  readonly depositLaid: Length | undefined;
  readonly welders: readonly string[];
  readonly examinations: readonly Examination[];
  readonly openRepairs: readonly Repair[];
  readonly methodsOutstanding: readonly string[];
  readonly findings: readonly Finding[];
  readonly complete: boolean;
}

export interface JointStatusInput {
  readonly joint: Joint;
  readonly entries: readonly WeldLogEntry[];
  readonly examinations: readonly Examination[];
  readonly repairs: readonly Repair[];
  readonly lethalService?: boolean | undefined;
  /** The joint has been through its post weld heat treatment. */
  readonly heatTreatedOn?: PlainDate | undefined;
}

export function statusOf(input: JointStatusInput): JointStatus {
  const joint = input.joint;
  const entries = input.entries.filter((entry) => entry.joint === joint.id);
  const examinations = input.examinations.filter((item) => item.joint === joint.id);
  const repairs = input.repairs.filter((item) => item.joint === joint.id);
  const openRepairs = repairs.filter((item) => !isComplete(item));
  const deposit = depositInJoint(entries, joint.id);

  const findings: Finding[] = [...reviewJoint(joint)];

  const required = methodsRequired({
    joint,
    lethalService: input.lethalService ?? false,
    repair: repairs.length > 0,
  });
  const done = new Set(examinations.map((item) => item.method));
  const outstanding = required.filter((method) => !done.has(method));

  for (const examination of examinations) {
    const result = judgeExamination(examination, joint.thickness);
    findings.push(...result.findings);
    if (
      input.heatTreatedOn !== undefined &&
      !examination.afterHeatTreatment &&
      examination.performedOn.isBefore(input.heatTreatedOn) &&
      examination.method !== 'VT'
    ) {
      findings.push(
        deficiency(
          'status.examined_before_heat_treatment',
          `${examination.id} was taken on ${examination.performedOn.toString()}, before the heat treatment on ${input.heatTreatedOn.toString()}`,
          { clause: 'UCS-56', subject: joint.id },
        ),
      );
    }
  }

  for (const method of outstanding) {
    findings.push(
      deficiency('status.examination_outstanding', `${method} has not been carried out`, {
        subject: joint.id,
      }),
    );
  }
  for (const repair of openRepairs) {
    findings.push(
      blocking('status.repair_open', `${repair.id} is still open`, { subject: joint.id }),
    );
  }
  if (deposit === undefined) {
    findings.push(
      deficiency('status.not_welded', 'nothing has been welded into this joint yet', {
        subject: joint.id,
      }),
    );
  } else if (deposit.lessThan(joint.thickness)) {
    findings.push(
      advisory(
        'status.part_welded',
        `${deposit.toFraction()} of deposit against a ${joint.thickness.toFraction()} joint`,
        { subject: joint.id },
      ),
    );
  }
  if (
    jointEfficiency(
      joint.type,
      volumetricExtent({
        joint,
        lethalService: input.lethalService ?? false,
        repair: false,
      }),
    ) === undefined
  ) {
    findings.push(
      blocking(
        'status.no_efficiency',
        'the construction and the examination level do not give this joint an efficiency at all',
        { subject: joint.id },
      ),
    );
  }

  const sorted = sortFindings(findings);
  const complete =
    deposit !== undefined &&
    outstanding.length === 0 &&
    openRepairs.length === 0 &&
    !sorted.some((item) => item.severity === 'blocking' || item.severity === 'deficiency');

  return {
    joint,
    stage: stageOf(deposit, examinations.length > 0, repairs.length > 0, complete),
    depositLaid: deposit,
    welders: weldersOnJoint(entries, joint.id),
    examinations,
    openRepairs,
    methodsOutstanding: outstanding,
    findings: sorted,
    complete,
  };
}

function stageOf(
  deposit: Length | undefined,
  examined: boolean,
  repaired: boolean,
  complete: boolean,
): Stage {
  if (deposit === undefined) {
    return 'mapped';
  }
  if (!examined) {
    return 'welded';
  }
  if (repaired && !complete) {
    return 'repaired';
  }
  return complete ? 'accepted' : 'examined';
}

export function statusesFor(
  joints: readonly Joint[],
  input: Omit<JointStatusInput, 'joint'>,
): readonly JointStatus[] {
  return joints.map((joint) => statusOf({ ...input, joint }));
}

export function outstandingJoints(statuses: readonly JointStatus[]): readonly JointStatus[] {
  return statuses.filter((status) => !status.complete);
}

export function describeStatus(status: JointStatus): string {
  return `${status.joint.id} ${status.stage}${status.complete ? '' : `, ${String(status.findings.length)} to clear`}`;
}
