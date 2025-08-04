import { advisory, blocking, deficiency, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { canInterpret, isCertifiedOn, type Technician } from '../nde/examination.js';
import type { ExaminationMethod } from '../nde/requirement.js';
import type { Workspace } from '../store/workspace.js';

/**
 * The examination technicians, and the two questions worth asking of them.
 *
 * The first is who is about to fall out of certification, which is the same
 * shape of problem as welder continuity and is missed for the same reason:
 * nothing goes wrong on the day it expires, it goes wrong three weeks later
 * when somebody signs a report they no longer may.
 *
 * The second is harder and it is why this exists at all. A shop can hold four
 * technicians and still have nobody who may interpret magnetic particle, and
 * discover it on the morning a nozzle needs one. The cover check reads the
 * methods the shop actually needs from the joints on the books rather than
 * from a list somebody typed.
 */

export interface TechnicianStanding {
  readonly technician: Technician;
  readonly daysRemaining: number;
  readonly current: boolean;
  readonly interprets: readonly ExaminationMethod[];
}

export function standingOn(technician: Technician, on: PlainDate): TechnicianStanding {
  const methods: ExaminationMethod[] = ['RT', 'UT', 'MT', 'PT', 'VT'];
  return {
    technician,
    daysRemaining: on.daysUntil(technician.certifiedUntil),
    current: isCertifiedOn(technician, on),
    interprets: methods.filter((method) => canInterpret(technician, method)),
  };
}

export function register(workspace: Workspace, on: PlainDate): readonly TechnicianStanding[] {
  return workspace.examinations
    .technicians()
    .map((technician) => standingOn(technician, on))
    .sort((left, right) => left.daysRemaining - right.daysRemaining);
}

/**
 * Methods the joints on the books will need, whether or not anyone holds them.
 *
 * A shop with nothing on the books needs nothing, which is worth saying: the
 * first version of this always asked for visual examination and reported an
 * empty workspace as having no cover for work it did not have.
 */
export function methodsNeeded(workspace: Workspace): readonly ExaminationMethod[] {
  const joints = workspace.fabrication.joints();
  if (joints.length === 0) {
    return [];
  }
  const needed = new Set<ExaminationMethod>(['VT']);
  for (const joint of joints) {
    if (joint.radiography !== 'none') {
      needed.add('RT');
    }
    if (joint.category === 'C' || joint.category === 'D') {
      needed.add('MT');
      needed.add('PT');
    }
  }
  return [...needed].sort();
}

export function coverFindings(
  workspace: Workspace,
  on: PlainDate,
  warnWithinDays = 60,
): readonly Finding[] {
  const findings: Finding[] = [];
  const standings = register(workspace, on);

  for (const method of methodsNeeded(workspace)) {
    const holders = standings.filter(
      (standing) => standing.current && standing.interprets.includes(method),
    );
    if (holders.length === 0) {
      findings.push(
        blocking(
          'technicians.no_cover',
          `nobody on the register may interpret ${method}, and the work on the books needs it`,
          { subject: method },
        ),
      );
    } else if (holders.length === 1) {
      findings.push(
        advisory(
          'technicians.single_cover',
          `${holders[0]?.technician.name ?? ''} is the only person who may interpret ${method}`,
          { subject: method },
        ),
      );
    }
  }

  for (const standing of standings) {
    if (!standing.current) {
      findings.push(
        blocking(
          'technicians.expired',
          `${standing.technician.name} went out of certification on ${standing.technician.certifiedUntil.toString()}`,
          { subject: standing.technician.name },
        ),
      );
      continue;
    }
    if (standing.daysRemaining <= warnWithinDays) {
      findings.push(
        deficiency(
          'technicians.expiring',
          `${standing.technician.name} runs out in ${String(standing.daysRemaining)} days`,
          { subject: standing.technician.name },
        ),
      );
    }
  }
  return findings;
}
