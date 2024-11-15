import type { ProcessCode } from '../codes/process.js';
import { blocking, isAcceptable, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { baseMetal } from '../materials/baseMetal.js';
import { isFillerAllowed } from '../materials/fillerMetal.js';
import { canWeld, type RegisterEntry } from '../personnel/register.js';
import type { JointRequirement } from '../personnel/scope.js';
import type { Welder } from '../personnel/welder.js';
import type { ProcedureQualificationRecord } from '../qualification/pqr.js';
import { supportFindings } from '../qualification/support.js';
import { claimFor, isInForce, type WeldingProcedureSpecification } from '../qualification/wps.js';
import type { Joint } from './joint.js';

/**
 * The question the shop floor actually asks: can this man weld that joint
 * tomorrow morning with the procedure on the drawing.
 *
 * Four separate systems have to agree and they can each say no on their own:
 *
 *   the procedure has to be in force, and supported by a record that reaches
 *   as far as it claims
 *
 *   the procedure has to reach the joint, which is a different question again,
 *   because a procedure can be perfectly well supported and still not offer
 *   the position the joint is in
 *
 *   the welder's own coupon has to reach the joint, and his continuity clock
 *   has to be running
 *
 *   the consumable has to be one the shop is willing to put in that pair of
 *   base metals
 *
 * Answering only three of the four is how a shop puts a lapsed man on a
 * perfectly good procedure, or a current man on a procedure whose only
 * supporting record was withdrawn last month.
 */

export interface AssignmentQuestion {
  readonly joint: Joint;
  readonly procedure: WeldingProcedureSpecification;
  readonly records: readonly ProcedureQualificationRecord[];
  readonly welder: Welder;
  readonly entries: readonly RegisterEntry[];
  readonly process: ProcessCode;
  readonly consumable: string;
  readonly on: PlainDate;
}

export interface AssignmentAnswer {
  readonly allowed: boolean;
  readonly findings: readonly Finding[];
}

export function jointRequirement(
  joint: Joint,
  process: ProcessCode,
  fNumber: number,
  progression: JointRequirement['progression'],
): JointRequirement {
  return {
    process,
    weldType: joint.weldType,
    productForm: joint.productForm,
    position: joint.position,
    progression,
    fNumber,
    pNumber: baseMetal(joint.baseMetalLeft).pNumber,
    depositThickness: joint.thickness,
    backing: joint.type === 2,
    outsideDiameter: joint.outsideDiameter,
  };
}

/** Whether the procedure, as written, offers what the joint needs. */
export function procedureReachesJoint(
  procedure: WeldingProcedureSpecification,
  joint: Joint,
  process: ProcessCode,
): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = `${joint.id} on ${procedure.number.toString()}`;
  const left = baseMetal(joint.baseMetalLeft).pNumber;
  const right = baseMetal(joint.baseMetalRight).pNumber;

  for (const pNumber of new Set([left, right])) {
    if (!procedure.pNumbers.includes(pNumber)) {
      findings.push(
        blocking('assign.base_metal', `the procedure does not offer P-No ${pNumber}`, { subject }),
      );
    }
  }
  if (!procedure.baseMetalThickness.contains(joint.thickness)) {
    findings.push(
      blocking(
        'assign.thickness',
        `${joint.thickness.toFraction()} is outside the procedure's ${procedure.baseMetalThickness.toString()}`,
        { subject },
      ),
    );
  }
  if (!procedure.positions.includes(joint.position)) {
    findings.push(
      blocking('assign.position', `the procedure does not offer the ${joint.position} position`, {
        subject,
      }),
    );
  }
  if (procedure.weldType !== joint.weldType) {
    findings.push(
      blocking(
        'assign.weld_type',
        `the procedure is written for ${procedure.weldType} welds and the joint is a ${joint.weldType}`,
        { subject },
      ),
    );
  }
  if (claimFor(procedure, process) === undefined) {
    findings.push(
      blocking('assign.process', `the procedure does not offer ${process}`, { subject }),
    );
  }
  return findings;
}

export function assess(question: AssignmentQuestion): AssignmentAnswer {
  const findings: Finding[] = [];
  const subject = `${question.joint.id} ${question.welder.stencil}`;

  if (!isInForce(question.procedure, question.on)) {
    findings.push(
      blocking(
        'assign.procedure_not_in_force',
        `${question.procedure.number.toString()} is not in force on ${question.on.toString()}`,
        { subject },
      ),
    );
  }

  findings.push(...supportFindings(question.procedure, question.records).findings);
  findings.push(...procedureReachesJoint(question.procedure, question.joint, question.process));

  const claim = claimFor(question.procedure, question.process);
  const fNumber = claim?.fNumbers[0];
  if (fNumber !== undefined) {
    const requirement = jointRequirement(
      question.joint,
      question.process,
      fNumber,
      claim?.progression ?? 'not-applicable',
    );
    const register = canWeld({
      welder: question.welder,
      entries: question.entries,
      joint: requirement,
      on: question.on,
    });
    findings.push(...register.findings);
    if (!register.allowed) {
      // A lapse is only a deficiency on the register, because one coupon
      // clears it. On an assignment it stops the work, so the register's own
      // verdict is carried across rather than its severities.
      findings.push(
        blocking(
          'assign.welder_not_qualified',
          `${question.welder.stencil} is not qualified for ${question.joint.id} on ${question.on.toString()}`,
          { subject },
        ),
      );
    }
  }

  const left = baseMetal(question.joint.baseMetalLeft).pNumber;
  const right = baseMetal(question.joint.baseMetalRight).pNumber;
  if (!isFillerAllowed(question.consumable, left, right)) {
    findings.push(
      blocking(
        'assign.consumable',
        `${question.consumable} is not on the standing list for a P-No ${left} to P-No ${right} joint`,
        { subject },
      ),
    );
  }

  return { allowed: isAcceptable(findings), findings };
}

export function reasonsRefused(answer: AssignmentAnswer): readonly string[] {
  return answer.findings.filter((item) => item.severity === 'blocking').map((item) => item.message);
}
