import { heading, keyValues, pad, renderTable, wrap } from '../core/text.js';
import { describeProcess } from '../codes/process.js';
import { totalDeposit, type ProcedureQualificationRecord } from '../qualification/pqr.js';
import { scopesFor } from '../qualification/qualifiedRanges.js';
import { evaluateCoupon } from '../qualification/evaluation.js';
import type { WeldingProcedureSpecification } from '../qualification/wps.js';

/**
 * The two forms that get printed, signed and put in a folder.
 *
 * Everything else in this system is a query. These are documents, and a
 * document has a shape somebody signs at the bottom of. The layout is fixed
 * width text on purpose: it comes out of the same printer as the travellers,
 * it photocopies, and an inspector who wants it faxed can have it faxed.
 *
 * The forms carry a line saying which build produced them and when. Two copies
 * of a procedure that differ and neither of which says where it came from is
 * a morning gone.
 */

const WIDTH = 88;

export interface FormHeader {
  readonly shop: string;
  readonly printedAt: string;
  readonly buildVersion: string;
}

export function procedureForm(wps: WeldingProcedureSpecification, header: FormHeader): string {
  const lines: string[] = [];
  lines.push(heading(`WELDING PROCEDURE SPECIFICATION  ${wps.number.toString()}`));
  lines.push('');
  lines.push(
    keyValues([
      ['shop', header.shop],
      ['title', wps.title],
      ['issued', wps.issuedOn.toString()],
      ['withdrawn', wps.withdrawnOn?.toString() ?? 'in force'],
      ['supporting records', wps.supportedBy.join(', ') || 'none'],
    ]),
  );
  lines.push('');
  lines.push(heading('JOINTS AND BASE METALS', '-'));
  lines.push(
    keyValues([
      ['weld type', wps.weldType],
      ['product form', wps.productForm],
      ['base metal', `P-No ${wps.pNumbers.join('/')}, groups ${wps.groupNumbers.join('/')}`],
      ['thickness range', wps.baseMetalThickness.toString()],
      ['positions', wps.positions.join(', ')],
      ['post weld heat treatment', wps.pwht],
      ['notch toughness', wps.toughnessQualified ? 'qualified' : 'not qualified'],
    ]),
  );
  lines.push('');
  lines.push(heading('PROCESSES', '-'));
  lines.push(
    renderTable(
      [...wps.layers],
      [
        { header: 'process', value: (row) => describeProcess(row.process) },
        { header: 'F-No', value: (row) => row.fNumbers.join('/') },
        { header: 'A-No', value: (row) => (row.aNumber === undefined ? '' : String(row.aNumber)) },
        { header: 'deposit', value: (row) => row.depositThickness.toString() },
        { header: 'progression', value: (row) => row.progression },
        { header: 'preheat', value: (row) => row.preheatMinimum.toString() },
        { header: 'interpass', value: (row) => row.interpassMaximum.toString() },
      ],
      { emptyMessage: 'no process on this procedure' },
    ),
  );
  lines.push('');
  lines.push(signatures(['welding engineer', 'quality manager']));
  lines.push(footer(header));
  return lines.join('\n');
}

export function recordForm(record: ProcedureQualificationRecord, header: FormHeader): string {
  const verdict = evaluateCoupon(record);
  const lines: string[] = [];
  lines.push(heading(`PROCEDURE QUALIFICATION RECORD  ${record.number.key()}`));
  lines.push('');
  lines.push(
    keyValues([
      ['shop', header.shop],
      ['welded', record.weldedOn.toString()],
      ['welded by', record.weldedBy],
      ['witnessed by', record.witnessedBy ?? 'not witnessed'],
      ['certified', record.certifiedOn?.toString() ?? 'not certified'],
    ]),
  );
  lines.push('');
  lines.push(heading('COUPON', '-'));
  lines.push(
    keyValues([
      ['weld type', record.weldType],
      ['product form', record.productForm],
      ['base metal', `${record.baseMetalLeft} to ${record.baseMetalRight}`],
      ['heat numbers', `${record.heatLeft} and ${record.heatRight}`],
      ['coupon thickness', record.couponThickness.toFraction()],
      ['deposit', totalDeposit(record).toFraction()],
      ['notch toughness', record.toughnessRequired ? 'required' : 'not required'],
    ]),
  );
  lines.push('');
  lines.push(heading('QUALIFIED RANGES', '-'));
  lines.push(
    renderTable(
      [...scopesFor(record)],
      [
        { header: 'process', value: (row) => row.process },
        { header: 'P-No', value: (row) => row.pNumbers.join('/') },
        { header: 'groups', value: (row) => row.groupNumbers.join('/') },
        { header: 'F-No', value: (row) => row.fNumbers.join('/') },
        { header: 'base metal', value: (row) => row.baseMetalThickness.toString() },
        { header: 'deposit', value: (row) => row.depositThickness.toString() },
      ],
      { emptyMessage: 'no process recorded' },
    ),
  );
  lines.push('');
  lines.push(heading('TEST RESULTS', '-'));
  lines.push(
    renderTable(
      [...verdict.tensileResults],
      [
        { header: 'specimen', value: (row) => row.specimen.id },
        { header: 'area', align: 'right', value: (row) => row.areaSquareInches.toString() },
        { header: 'ksi', align: 'right', value: (row) => row.strengthKsi.toString() },
        { header: 'required', align: 'right', value: (row) => row.requiredKsi.toString() },
        { header: 'broke in', value: (row) => row.specimen.failureLocation },
        { header: 'verdict', value: (row) => (row.accepted ? 'accept' : 'reject') },
      ],
      { emptyMessage: 'no tensile specimens recorded' },
    ),
  );
  lines.push('');
  for (const finding of verdict.findings) {
    for (const line of wrap(`${finding.severity.toUpperCase()}  ${finding.message}`, WIDTH)) {
      lines.push(line);
    }
  }
  lines.push('');
  lines.push(verdict.accepted ? 'RESULT: ACCEPTED' : 'RESULT: REJECTED');
  lines.push('');
  lines.push(signatures(['laboratory', 'quality manager']));
  lines.push(footer(header));
  return lines.join('\n');
}

function signatures(roles: readonly string[]): string {
  const lines: string[] = [];
  for (const role of roles) {
    lines.push(`${pad(role, 22)}  ${'.'.repeat(34)}   date ${'.'.repeat(12)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function footer(header: FormHeader): string {
  return `${'-'.repeat(WIDTH)}\nprinted ${header.printedAt} by arc ${header.buildVersion}`;
}
