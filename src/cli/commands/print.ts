import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { ValidationError } from '../../core/errors.js';
import { DocumentNumber } from '../../core/identifier.js';
import { procedureForm, recordForm, type FormHeader } from '../../reporting/forms.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { VERSION } from '../program.js';

/**
 * Printing the forms.
 *
 * Writing to a file rather than to the terminal is the normal case here, not
 * the exception, because these go into a folder rather than onto a screen. The
 * file is written whole or not at all, and an existing one is never quietly
 * replaced: a signed procedure that has been overwritten by an unsigned draft
 * of itself is not recoverable from anywhere.
 */
export function printCommand(out: Output, context: Context): Command {
  const command = new Command('print').description('the printed forms');

  const header = (): FormHeader => ({
    shop: context.workspace().marker.shop,
    printedAt: context.clock.now().toISOString(),
    buildVersion: VERSION,
  });

  const emit = (text: string, path: string | undefined): void => {
    if (path === undefined) {
      out.line(text);
      return;
    }
    const resolved = resolve(path);
    try {
      writeFileSync(resolved, `${text}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      throw new ValidationError('out', `cannot write ${resolved}`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    out.line(`written to ${resolved}`);
  };

  command
    .command('procedure <number>')
    .description('print a welding procedure specification')
    .option('--out <file>', 'write to a file rather than to the terminal')
    .action((number: string, options: { out?: string }) => {
      const procedure = context
        .workspace()
        .procedures.requireProcedure(DocumentNumber.parse(number));
      emit(procedureForm(procedure, header()), options.out);
    });

  command
    .command('record <number>')
    .description('print a procedure qualification record')
    .option('--out <file>', 'write to a file rather than to the terminal')
    .action((number: string, options: { out?: string }) => {
      const record = context
        .workspace()
        .procedures.requireRecord(DocumentNumber.parse(number).key());
      emit(recordForm(record, header()), options.out);
    });

  return command;
}
