import { Command } from 'commander';

import { DocumentNumber } from '../../core/identifier.js';
import { PlainDate } from '../../core/plainDate.js';
import { keyValues } from '../../core/text.js';
import { assessRevision } from '../../qualification/revision.js';
import { supportFindings, unsupportedClauses } from '../../qualification/support.js';
import { describeProcedure, isInForce, reviewProcedure } from '../../qualification/wps.js';
import { procedureReader } from '../../store/procedureCodec.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';
import { readRecordFile } from '../readFile.js';

/**
 * Procedures from the command line.
 *
 * `support` is the command that earns the system its keep. A welding engineer
 * can hold a procedure and the records behind it in their head for about a
 * week after writing them, and after that the only honest answer to "does this
 * still stand" is to work through both documents field by field.
 */
export function proceduresCommand(out: Output, context: Context): Command {
  const command = new Command('procedures').description('welding procedure specifications');

  command
    .command('issue <file>')
    .description('issue a procedure from a json file')
    .action((file: string) => {
      const procedure = readRecordFile(file, procedureReader, 'a procedure');
      const findings = reviewProcedure(procedure);
      if (findings.some((item) => item.severity === 'blocking')) {
        printFindings(out, findings);
        out.line('');
        out.line('not issued');
        return;
      }
      context.workspace().procedures.issue(procedure, context.actor);
      out.line(`${procedure.number.toString()} issued`);
      if (findings.length > 0) {
        printFindings(out, findings);
      }
    });

  command
    .command('list')
    .description('every revision of every procedure')
    .option('--on <date>', 'show whether each was in force on this day')
    .action((options: { on?: string }) => {
      const on = options.on === undefined ? context.clock.today() : PlainDate.parse(options.on);
      printHeading(out, `Procedure index at ${on.toString()}`);
      printTable(
        out,
        [...context.workspace().procedures.procedures()],
        [
          { header: 'number', value: (row) => row.number.toString() },
          { header: 'title', value: (row) => row.title },
          { header: 'processes', value: (row) => row.layers.map((item) => item.process).join('+') },
          { header: 'issued', value: (row) => row.issuedOn.toString() },
          { header: 'in force', value: (row) => (isInForce(row, on) ? 'yes' : 'no') },
          { header: 'records', value: (row) => row.supportedBy.join(', ') },
        ],
        'no procedures issued',
      );
    });

  command
    .command('show <number>')
    .description('one procedure in full')
    .action((number: string) => {
      const procedure = context
        .workspace()
        .procedures.requireProcedure(DocumentNumber.parse(number));
      printHeading(out, describeProcedure(procedure));
      out.line(
        keyValues([
          ['issued', procedure.issuedOn.toString()],
          ['withdrawn', procedure.withdrawnOn?.toString() ?? 'no'],
          ['weld type', procedure.weldType],
          ['product form', procedure.productForm],
          [
            'base metals',
            `P-No ${procedure.pNumbers.join('/')} groups ${procedure.groupNumbers.join('/')}`,
          ],
          ['thickness', procedure.baseMetalThickness.toString()],
          ['positions', procedure.positions.join(', ')],
          ['heat treatment', procedure.pwht],
          ['notch toughness', procedure.toughnessQualified ? 'yes' : 'no'],
          ['records', procedure.supportedBy.join(', ')],
        ]),
      );
      out.line('');
      for (const layer of procedure.layers) {
        out.line(
          `${layer.process}: F-No ${layer.fNumbers.join('/')}, deposit ${layer.depositThickness.toString()}, ${layer.progression}, preheat ${layer.preheatMinimum.toString()}, interpass ${layer.interpassMaximum.toString()}`,
        );
      }
      const findings = reviewProcedure(procedure);
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('support <number>')
    .description('whether the records behind it reach as far as it claims')
    .action((number: string) => {
      const store = context.workspace().procedures;
      const procedure = store.requireProcedure(DocumentNumber.parse(number));
      const report = supportFindings(procedure, store.recordsBehind(procedure));
      printHeading(
        out,
        `${procedure.number.toString()} against ${report.recordsUsed.join(', ') || 'no records'}`,
      );
      printFindings(out, report.findings);
      out.line('');
      out.line(
        report.supported ? 'supported' : `not supported: ${unsupportedClauses(report).join(', ')}`,
      );
    });

  command
    .command('compare <from> <to>')
    .description('what a revision moved and what it costs')
    .action((from: string, to: string) => {
      const store = context.workspace().procedures;
      const previous = store.requireProcedure(DocumentNumber.parse(from));
      const next = store.requireProcedure(DocumentNumber.parse(to));
      const impact = assessRevision(previous, next, store.recordsBehind(next));
      printHeading(out, `${previous.number.toString()} to ${next.number.toString()}`);
      printTable(
        out,
        [...impact.movements],
        [
          { header: 'field', value: (row) => row.field },
          { header: 'direction', value: (row) => row.direction },
          { header: 'detail', value: (row) => row.detail },
        ],
        'nothing moved',
      );
      out.line('');
      printFindings(out, impact.findings);
      out.line('');
      out.line(
        impact.needsNewRecord
          ? 'a new qualification record is needed'
          : 'the records still cover it',
      );
    });

  command
    .command('withdraw <number>')
    .description('withdraw a revision')
    .requiredOption('--on <date>', 'the day it stops being in force')
    .requiredOption('--reason <text>', 'why')
    .action((number: string, options: { on: string; reason: string }) => {
      context
        .workspace()
        .procedures.withdraw(
          DocumentNumber.parse(number),
          PlainDate.parse(options.on),
          options.reason,
          context.actor,
        );
      out.line(`${number} withdrawn on ${options.on}`);
    });

  return command;
}
