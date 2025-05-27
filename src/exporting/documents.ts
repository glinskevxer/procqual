import { heading, renderTable } from '../core/text.js';
import { describeFinding } from '../core/errors.js';
import { assemblePackage, packageInputFor } from '../reporting/dataPackage.js';
import { procedureForm, recordForm, type FormHeader } from '../reporting/forms.js';
import type { Workspace } from '../store/workspace.js';

/**
 * The documents that make up a vessel's file, as text.
 *
 * A data package is not one document, it is a folder, and what an inspector
 * asks for is the folder. Building it as a list of named documents rather than
 * one long report means the same code serves a printout, a directory of files
 * and an attachment to an email, and it means the index at the front is
 * generated from the same list that produced the documents rather than typed
 * out beside it and left behind.
 */

export interface Document {
  readonly name: string;
  readonly title: string;
  readonly text: string;
}

export interface ExportOptions {
  readonly vessel: string;
  readonly lethalService?: boolean;
  readonly printedAt: string;
  readonly buildVersion: string;
}

export function exportPackage(workspace: Workspace, options: ExportOptions): readonly Document[] {
  const header: FormHeader = {
    shop: workspace.marker.shop,
    printedAt: options.printedAt,
    buildVersion: options.buildVersion,
  };
  const report = assemblePackage(
    packageInputFor(workspace, options.vessel, options.lethalService ?? false),
  );
  const joints = workspace.fabrication.joints(options.vessel);

  const documents: Document[] = [];
  documents.push({
    name: '01-weld-map.txt',
    title: 'weld map',
    text: weldMapDocument(options.vessel, joints),
  });
  documents.push({
    name: '02-weld-log.txt',
    title: 'weld log',
    text: weldLogDocument(options.vessel, workspace),
  });
  documents.push({
    name: '03-examinations.txt',
    title: 'examination reports',
    text: examinationDocument(options.vessel, workspace),
  });

  const usedProcedures = new Set(joints.map((joint) => joint.procedure.key()));
  let index = 4;
  for (const procedure of workspace.procedures.procedures()) {
    if (!usedProcedures.has(procedure.number.key())) {
      continue;
    }
    documents.push({
      name: `${pad(index)}-${procedure.number.key().toLowerCase()}.txt`,
      title: `procedure ${procedure.number.toString()}`,
      text: procedureForm(procedure, header),
    });
    index += 1;
    for (const record of workspace.procedures.recordsBehind(procedure)) {
      documents.push({
        name: `${pad(index)}-${record.number.key().toLowerCase()}.txt`,
        title: `record ${record.number.key()}`,
        text: recordForm(record, header),
      });
      index += 1;
    }
  }

  documents.push({
    name: `${pad(index)}-exceptions.txt`,
    title: 'outstanding items',
    text: exceptionsDocument(report.sections),
  });

  return [indexDocument(options.vessel, documents, header), ...documents];
}

function indexDocument(
  vessel: string,
  documents: readonly Document[],
  header: FormHeader,
): Document {
  const lines = [heading(`DATA PACKAGE  ${vessel}`), '', `shop: ${header.shop}`, ''];
  lines.push(
    renderTable(
      [...documents],
      [
        { header: 'file', value: (row) => row.name },
        { header: 'contents', value: (row) => row.title },
      ],
    ),
  );
  lines.push('');
  lines.push(`printed ${header.printedAt} by arc ${header.buildVersion}`);
  return { name: '00-index.txt', title: 'index', text: lines.join('\n') };
}

function weldMapDocument(
  vessel: string,
  joints: ReturnType<Workspace['fabrication']['joints']>,
): string {
  return [
    heading(`WELD MAP  ${vessel}`),
    '',
    renderTable(
      [...joints],
      [
        { header: 'joint', value: (row) => row.id },
        { header: 'description', value: (row) => row.description },
        { header: 'cat', value: (row) => row.category },
        { header: 'type', align: 'right', value: (row) => String(row.type) },
        { header: 'thickness', align: 'right', value: (row) => row.thickness.toFraction() },
        { header: 'base metal', value: (row) => `${row.baseMetalLeft} / ${row.baseMetalRight}` },
        { header: 'heats', value: (row) => `${row.heatLeft} / ${row.heatRight}` },
        { header: 'procedure', value: (row) => row.procedure.toString() },
        { header: 'rt', value: (row) => row.radiography },
      ],
      { emptyMessage: 'no joints on this vessel' },
    ),
  ].join('\n');
}

function weldLogDocument(vessel: string, workspace: Workspace): string {
  const mine = new Set(workspace.fabrication.joints(vessel).map((joint) => joint.id));
  const entries = workspace.fabrication.entries().filter((entry) => mine.has(entry.joint));
  return [
    heading(`WELD LOG  ${vessel}`),
    '',
    renderTable(
      [...entries],
      [
        { header: 'entry', value: (row) => row.id },
        { header: 'joint', value: (row) => row.joint },
        { header: 'welder', value: (row) => row.stencil },
        { header: 'process', value: (row) => row.process },
        { header: 'procedure', value: (row) => row.procedure.toString() },
        { header: 'welded', value: (row) => row.weldedOn.toString() },
        { header: 'consumable', value: (row) => `${row.consumable} ${row.consumableLot}` },
      ],
      { emptyMessage: 'nothing logged against this vessel' },
    ),
  ].join('\n');
}

function examinationDocument(vessel: string, workspace: Workspace): string {
  const mine = new Set(workspace.fabrication.joints(vessel).map((joint) => joint.id));
  const examinations = workspace.examinations.examinations().filter((item) => mine.has(item.joint));
  return [
    heading(`EXAMINATION REPORTS  ${vessel}`),
    '',
    renderTable(
      [...examinations],
      [
        { header: 'report', value: (row) => row.id },
        { header: 'joint', value: (row) => row.joint },
        { header: 'method', value: (row) => row.method },
        { header: 'extent', value: (row) => row.extent },
        { header: 'taken', value: (row) => row.performedOn.toString() },
        {
          header: 'technician',
          value: (row) => `${row.technician.name} (${row.technician.level})`,
        },
        { header: 'reference', value: (row) => row.reportNumber },
      ],
      { emptyMessage: 'nothing examined on this vessel' },
    ),
  ].join('\n');
}

function exceptionsDocument(sections: ReturnType<typeof assemblePackage>['sections']): string {
  const lines = [heading('OUTSTANDING ITEMS'), ''];
  for (const section of sections) {
    lines.push(heading(`${section.name} - ${section.complete ? 'complete' : 'outstanding'}`, '-'));
    if (section.findings.length === 0) {
      lines.push('nothing to report');
    }
    for (const finding of section.findings) {
      lines.push(describeFinding(finding));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function pad(index: number): string {
  return String(index).padStart(2, '0');
}
