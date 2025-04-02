import { sortFindings, type Finding } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { continuityFindings, continuityStatusOn } from '../personnel/continuity.js';
import { reviewQualification } from '../personnel/welder.js';
import { verifyCertificate } from '../materials/heat.js';
import { reviewChart } from '../fabrication/heatTreatmentChart.js';
import { isComplete, reviewRepair } from '../nde/repair.js';
import { rateFindings } from '../nde/repairRate.js';
import { reviewExamination } from '../nde/examination.js';
import { reviewProcedure } from '../qualification/wps.js';
import { supportFindings } from '../qualification/support.js';
import { reviewJointAgainstVessel, reviewVessel } from '../fabrication/vessel.js';
import type { Workspace } from '../store/workspace.js';
import { repairRates } from './repairRateReport.js';

/**
 * Everything outstanding in the whole shop, in one list.
 *
 * Every other report here answers a question about one thing: this joint, that
 * procedure, this welder. This one answers the question nobody asks until it
 * is too late, which is what is wrong anywhere.
 *
 * It is deliberately grouped by area rather than by severity. A quality
 * manager reads it to decide who to go and talk to, and going to talk to the
 * store room about four things is one conversation while going to talk to
 * four people about one thing each is an afternoon.
 */

export interface ExceptionArea {
  readonly area: string;
  readonly findings: readonly Finding[];
}

export interface ExceptionReport {
  readonly areas: readonly ExceptionArea[];
  readonly total: number;
  readonly blocking: number;
}

export function shopExceptions(workspace: Workspace, on: PlainDate): ExceptionReport {
  const areas: ExceptionArea[] = [
    { area: 'welders', findings: welderFindings(workspace, on) },
    { area: 'procedures', findings: procedureFindings(workspace) },
    { area: 'vessels', findings: vesselFindings(workspace) },
    { area: 'materials', findings: materialFindings(workspace) },
    { area: 'examinations', findings: examinationFindings(workspace) },
    { area: 'repair rate', findings: rateFindingsFor(workspace, on) },
  ].filter((entry) => entry.findings.length > 0);

  const all = areas.flatMap((entry) => entry.findings);
  return {
    areas,
    total: all.length,
    blocking: all.filter((finding) => finding.severity === 'blocking').length,
  };
}

function welderFindings(workspace: Workspace, on: PlainDate): readonly Finding[] {
  const findings: Finding[] = [];
  for (const entry of workspace.registerEntries()) {
    const welder = workspace.personnel.welder(entry.qualification.stencil);
    findings.push(...reviewQualification(entry.qualification, welder));
    const status = continuityStatusOn(entry.qualification, entry.usageDates, on, workspace.policy);
    findings.push(...continuityFindings(entry.qualification, status, workspace.policy));
  }
  return sortFindings(findings);
}

function procedureFindings(workspace: Workspace): readonly Finding[] {
  const findings: Finding[] = [];
  for (const procedure of workspace.procedures.procedures()) {
    findings.push(...reviewProcedure(procedure));
    findings.push(
      ...supportFindings(procedure, workspace.procedures.recordsBehind(procedure)).findings,
    );
  }
  return sortFindings(findings);
}

function vesselFindings(workspace: Workspace): readonly Finding[] {
  const findings: Finding[] = [];
  for (const vessel of workspace.vessels.vessels()) {
    findings.push(...reviewVessel(vessel));
    for (const joint of workspace.fabrication.joints(vessel.tag)) {
      findings.push(...reviewJointAgainstVessel(vessel, joint));
    }
  }
  return sortFindings(findings);
}

function materialFindings(workspace: Workspace): readonly Finding[] {
  const findings: Finding[] = [];
  for (const heat of workspace.materials.heats()) {
    findings.push(...verifyCertificate(heat));
  }
  for (const chart of workspace.materials.charts()) {
    findings.push(...reviewChart(chart));
  }
  return sortFindings(findings);
}

function examinationFindings(workspace: Workspace): readonly Finding[] {
  const findings: Finding[] = [];
  for (const examination of workspace.examinations.examinations()) {
    findings.push(...reviewExamination(examination));
  }
  for (const repair of workspace.examinations.repairs()) {
    if (isComplete(repair)) {
      continue;
    }
    const reExamination =
      repair.reExaminedBy === undefined
        ? undefined
        : workspace.examinations.examination(repair.reExaminedBy);
    findings.push(...reviewRepair(repair, reExamination, workspace.policy));
  }
  return sortFindings(findings);
}

function rateFindingsFor(workspace: Workspace, on: PlainDate): readonly Finding[] {
  return sortFindings(repairRates(workspace, on).flatMap((reading) => rateFindings(reading)));
}

export function worstAreas(report: ExceptionReport): readonly ExceptionArea[] {
  return [...report.areas].sort((left, right) => right.findings.length - left.findings.length);
}
