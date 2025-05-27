import { blocking, deficiency, isAcceptable, sortFindings, type Finding } from '../core/errors.js';
import type { Joint } from '../fabrication/joint.js';
import type { HeatTreatmentChart } from '../fabrication/heatTreatmentChart.js';
import { reviewChart } from '../fabrication/heatTreatmentChart.js';
import type { WeldLogEntry } from '../fabrication/weldLog.js';
import { pwhtRequired } from '../codes/heatTreatment.js';
import { baseMetal } from '../materials/baseMetal.js';
import { verifyCertificate, type MaterialHeat } from '../materials/heat.js';
import type { Examination } from '../nde/examination.js';
import { isComplete, type Repair } from '../nde/repair.js';
import { isCertified, type ProcedureQualificationRecord } from '../qualification/pqr.js';
import { supportFindings } from '../qualification/support.js';
import type { WeldingProcedureSpecification } from '../qualification/wps.js';
import type { Workspace } from '../store/workspace.js';
import { statusesFor, type JointStatus, type JointStatusInput } from './jointStatus.js';

/**
 * Whether a vessel's paperwork is complete enough to sign the data report.
 *
 * This is the last gate before a stamp goes on, and it is where every gap that
 * has been quietly tolerated for six months turns up at once. The point of
 * running it early and often is that most of these are cheap to fix on the day
 * they happen and expensive to fix on the day the inspector arrives: a heat
 * whose certificate was never filed can be chased while the plate is still in
 * the yard, and cannot be once it is a shell course.
 */

export interface PackageInput {
  readonly vessel: string;
  readonly joints: readonly Joint[];
  readonly entries: readonly WeldLogEntry[];
  readonly examinations: readonly Examination[];
  readonly repairs: readonly Repair[];
  readonly charts: readonly HeatTreatmentChart[];
  readonly heats: readonly MaterialHeat[];
  readonly procedures: readonly WeldingProcedureSpecification[];
  readonly records: readonly ProcedureQualificationRecord[];
  readonly lethalService?: boolean | undefined;
}

export interface PackageSection {
  readonly name: string;
  readonly findings: readonly Finding[];
  readonly complete: boolean;
}

export interface PackageReport {
  readonly vessel: string;
  readonly sections: readonly PackageSection[];
  readonly statuses: readonly JointStatus[];
  readonly complete: boolean;
  readonly outstanding: number;
}

/**
 * Gather everything a package report needs out of a workspace.
 *
 * Three callers were each building this by hand and they had already drifted:
 * one of them passed an empty list of furnace charts and reported every vessel
 * as missing its heat treatment. A report that is wrong in a way that looks
 * like a finding is worse than one that fails.
 */
export function packageInputFor(
  workspace: Workspace,
  vessel: string,
  lethalService = false,
): PackageInput {
  return {
    vessel,
    joints: workspace.fabrication.joints(),
    entries: workspace.fabrication.entries(),
    examinations: workspace.examinations.examinations(),
    repairs: workspace.examinations.repairs(),
    charts: workspace.materials.charts(vessel),
    heats: workspace.materials.heats(),
    procedures: workspace.procedures.procedures(),
    records: workspace.procedures.records(),
    lethalService,
  };
}

/** What the joint status report needs, which is the same list minus the paperwork. */
export function statusInputFor(
  workspace: Workspace,
  lethalService = false,
): Omit<JointStatusInput, 'joint'> {
  return {
    entries: workspace.fabrication.entries(),
    examinations: workspace.examinations.examinations(),
    repairs: workspace.examinations.repairs(),
    lethalService,
  };
}

export function assemblePackage(input: PackageInput): PackageReport {
  const joints = input.joints.filter((joint) => joint.vessel === input.vessel);
  const statuses = statusesFor(joints, {
    entries: input.entries,
    examinations: input.examinations,
    repairs: input.repairs,
    lethalService: input.lethalService ?? false,
  });

  const sections: PackageSection[] = [
    section(
      'weld map and examinations',
      statuses.flatMap((status) => status.findings),
    ),
    section('material certificates', materialFindings(joints, input.heats)),
    section('procedures', procedureFindings(joints, input.procedures, input.records)),
    section('heat treatment', heatTreatmentFindings(joints, input.charts)),
    section('repairs', repairFindings(input.repairs, joints)),
  ];

  const outstanding = sections.reduce(
    (running, item) =>
      running + item.findings.filter((finding) => finding.severity !== 'advisory').length,
    0,
  );

  return {
    vessel: input.vessel,
    sections,
    statuses,
    complete: sections.every((item) => item.complete),
    outstanding,
  };
}

function section(name: string, findings: readonly Finding[]): PackageSection {
  const sorted = sortFindings(findings);
  return {
    name,
    findings: sorted,
    complete: isAcceptable(sorted) && !sorted.some((item) => item.severity === 'deficiency'),
  };
}

function materialFindings(
  joints: readonly Joint[],
  heats: readonly MaterialHeat[],
): readonly Finding[] {
  const findings: Finding[] = [];
  const filed = new Map(heats.map((heat) => [heat.heatNumber, heat]));
  const used = new Set(joints.flatMap((joint) => [joint.heatLeft, joint.heatRight]));
  for (const heatNumber of [...used].sort()) {
    const heat = filed.get(heatNumber);
    if (heat === undefined) {
      findings.push(
        blocking('package.no_certificate', `no mill certificate on file for heat ${heatNumber}`, {
          subject: heatNumber,
        }),
      );
      continue;
    }
    findings.push(...verifyCertificate(heat));
  }
  return findings;
}

function procedureFindings(
  joints: readonly Joint[],
  procedures: readonly WeldingProcedureSpecification[],
  records: readonly ProcedureQualificationRecord[],
): readonly Finding[] {
  const findings: Finding[] = [];
  const byKey = new Map(procedures.map((item) => [item.number.key(), item]));
  const recordsByKey = new Map(records.map((item) => [item.number.key(), item]));
  const used = new Set(joints.map((joint) => joint.procedure.key()));

  for (const key of [...used].sort()) {
    const procedure = byKey.get(key);
    if (procedure === undefined) {
      findings.push(
        blocking('package.no_procedure', `no procedure on file for ${key}`, { subject: key }),
      );
      continue;
    }
    const behind = procedure.supportedBy
      .map((number) => recordsByKey.get(number))
      .filter((item): item is ProcedureQualificationRecord => item !== undefined);
    findings.push(...supportFindings(procedure, behind).findings);
    for (const record of behind) {
      if (!isCertified(record)) {
        findings.push(
          deficiency(
            'package.record_uncertified',
            `${record.number.key()} has not been witnessed and certified`,
            { subject: key },
          ),
        );
      }
    }
  }
  return findings;
}

function heatTreatmentFindings(
  joints: readonly Joint[],
  charts: readonly HeatTreatmentChart[],
): readonly Finding[] {
  const findings: Finding[] = [];
  const covered = new Set(charts.flatMap((chart) => chart.joints));
  for (const joint of joints) {
    const pNumber = baseMetal(joint.baseMetalLeft).pNumber;
    if (!pwhtRequired(pNumber, joint.thickness)) {
      continue;
    }
    if (!covered.has(joint.id)) {
      findings.push(
        blocking(
          'package.no_chart',
          `${joint.id} needs a post weld heat treatment and no chart covers it`,
          { subject: joint.id },
        ),
      );
    }
  }
  for (const chart of charts) {
    findings.push(...reviewChart(chart));
  }
  return findings;
}

function repairFindings(repairs: readonly Repair[], joints: readonly Joint[]): readonly Finding[] {
  const mine = new Set(joints.map((joint) => joint.id));
  return repairs
    .filter((repair) => mine.has(repair.joint) && !isComplete(repair))
    .map((repair) =>
      blocking('package.repair_open', `${repair.id} on ${repair.joint} is still open`, {
        subject: repair.joint,
      }),
    );
}

export function outstandingSections(report: PackageReport): readonly PackageSection[] {
  return report.sections.filter((item) => !item.complete);
}
