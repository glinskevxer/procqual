import { Command } from 'commander';

import { DocumentNumber } from '../../core/identifier.js';
import { PlainDate } from '../../core/plainDate.js';
import { keyValues, pluralise } from '../../core/text.js';
import { evaluateCoupon, summariseVerdict } from '../../qualification/evaluation.js';
import { isCertified, processesUsed, totalDeposit } from '../../qualification/pqr.js';
import { describeScope, scopesFor } from '../../qualification/qualifiedRanges.js';
import { buildTestPlan, totalSpecimens } from '../../qualification/testPlan.js';
import { readers } from '../../store/codec.js';
import { variablesReader } from '../../store/procedureCodec.js';
import { testsReader } from '../../store/testResultsCodec.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';
import { readRecordFile } from '../readFile.js';

const recordFileReader = readers.record({
  number: readers.documentNumber,
  weldedOn: readers.date,
  weldedBy: readers.text,
  weldType: readers.oneOf(['groove', 'fillet'] as const),
  productForm: readers.oneOf(['plate', 'pipe'] as const),
  baseMetalLeft: readers.text,
  baseMetalRight: readers.text,
  heatLeft: readers.text,
  heatRight: readers.text,
  couponThickness: readers.length,
  outsideDiameter: readers.optional(readers.length),
  layers: readers.array(variablesReader),
  toughnessRequired: readers.boolean,
  tests: testsReader,
  witnessedBy: readers.optional(readers.text),
  certifiedOn: readers.optional(readers.date),
});

/**
 * Qualification records from the command line.
 *
 * `plan` is the one that gets used before a coupon is welded and `evaluate` is
 * the one used after it comes back from the laboratory. Both take the same
 * record, which is the point: the plan is derived from the coupon rather than
 * chosen, so the specimens that come back can be checked against the ones that
 * should have been cut.
 */
export function pqrCommand(out: Output, context: Context): Command {
  const command = new Command('pqr').description('procedure qualification records');

  command
    .command('record <file>')
    .description('record a coupon from a json file')
    .action((file: string) => {
      const record = readRecordFile(file, recordFileReader, 'a qualification record');
      context.workspace().procedures.recordQualification(record, context.actor);
      const verdict = evaluateCoupon(record);
      out.line(summariseVerdict(verdict));
      if (verdict.findings.length > 0) {
        out.line('');
        printFindings(out, verdict.findings);
      }
    });

  command
    .command('list')
    .description('the records on file')
    .action(() => {
      const store = context.workspace().procedures;
      printHeading(out, 'Qualification records');
      printTable(
        out,
        [...store.records()],
        [
          { header: 'number', value: (row) => row.number.key() },
          { header: 'welded', value: (row) => row.weldedOn.toString() },
          { header: 'by', value: (row) => row.weldedBy },
          { header: 'processes', value: (row) => processesUsed(row).join('+') },
          { header: 'base metal', value: (row) => row.baseMetalLeft },
          { header: 'thk', align: 'right', value: (row) => row.couponThickness.toFraction() },
          { header: 'toughness', value: (row) => (row.toughnessRequired ? 'yes' : 'no') },
          { header: 'certified', value: (row) => (isCertified(row) ? 'yes' : 'no') },
          {
            header: 'superseded',
            value: (row) => store.supersededBy(row.number.key())?.by ?? '',
          },
        ],
        'no records on file',
      );
    });

  command
    .command('show <number>')
    .description('one record, with what it qualifies')
    .action((number: string) => {
      const record = context
        .workspace()
        .procedures.requireRecord(DocumentNumber.parse(number).key());
      printHeading(out, `${record.number.key()} welded ${record.weldedOn.toString()}`);
      out.line(
        keyValues([
          ['welder', record.weldedBy],
          ['weld type', record.weldType],
          ['product form', record.productForm],
          ['base metal', `${record.baseMetalLeft} to ${record.baseMetalRight}`],
          ['heats', `${record.heatLeft} and ${record.heatRight}`],
          ['coupon', record.couponThickness.toFraction()],
          ['deposit', totalDeposit(record).toFraction()],
          ['notch toughness', record.toughnessRequired ? 'required' : 'not required'],
          ['witnessed by', record.witnessedBy ?? 'nobody'],
          ['certified', record.certifiedOn?.toString() ?? 'no'],
        ]),
      );
      out.line('');
      out.line('qualifies');
      for (const scope of scopesFor(record)) {
        out.line(`  ${describeScope(scope)}`);
      }
    });

  command
    .command('plan <file>')
    .description('what has to be cut off a coupon before it is welded')
    .action((file: string) => {
      const record = readRecordFile(file, recordFileReader, 'a qualification record');
      const layer = record.layers[0];
      const plan = buildTestPlan({
        weldType: record.weldType,
        couponThickness: record.couponThickness,
        pNumber: layer?.baseMetal.pNumber ?? '1',
        impactTestingRequired: record.toughnessRequired,
      });
      printHeading(out, `Test plan for ${record.number.key()}`);
      out.line(
        keyValues([
          ['tensile', String(plan.tensileCount)],
          [
            'bends',
            plan.bends === undefined
              ? '0'
              : `${plan.bends.total} (${plan.bends.allowed.join(' or ')})`,
          ],
          ['macro', String(plan.macroCount)],
          ['impact sets', plan.impactSets.join(', ') || 'none'],
          ['hardness', String(plan.hardnessSurveys)],
        ]),
      );
      out.line('');
      out.line(`${pluralise(totalSpecimens(plan), 'specimen')} in all`);
      for (const note of plan.notes) {
        out.line(`  ${note}`);
      }
    });

  command
    .command('evaluate <number>')
    .description('grade a record that is already on file')
    .option('--sour', 'the vessel is in wet sour service', false)
    .action((number: string, options: { sour: boolean }) => {
      const record = context
        .workspace()
        .procedures.requireRecord(DocumentNumber.parse(number).key());
      const verdict = evaluateCoupon(record, { sourService: options.sour });
      printHeading(out, summariseVerdict(verdict));
      printFindings(out, verdict.findings);
    });

  command
    .command('certify <number>')
    .description('record who witnessed a coupon and when it was certified')
    .requiredOption('--by <name>', 'who witnessed it')
    .requiredOption('--on <date>', 'the day it was certified')
    .action((number: string, options: { by: string; on: string }) => {
      context
        .workspace()
        .procedures.certify(
          DocumentNumber.parse(number),
          options.by,
          PlainDate.parse(options.on),
          context.actor,
        );
      out.line(`${number} certified by ${options.by} on ${options.on}`);
    });

  command
    .command('supersede <number> <by>')
    .description('mark a record as replaced, keeping it on the file')
    .requiredOption('--reason <text>', 'why')
    .action((number: string, by: string, options: { reason: string }) => {
      context
        .workspace()
        .procedures.supersede(
          DocumentNumber.parse(number),
          DocumentNumber.parse(by),
          options.reason,
          context.actor,
        );
      out.line(`${number} superseded by ${by}`);
    });

  return command;
}
