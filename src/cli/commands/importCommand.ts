import { resolve } from 'node:path';

import { Command } from 'commander';

import { pluralise } from '../../core/text.js';
import {
  importHeats,
  importWeldLog,
  importWelders,
  type ImportOptions,
  type ImportResult,
} from '../../importing/importers.js';
import type { Workspace } from '../../store/workspace.js';
import type { Context } from '../context.js';
import { readTextFile } from '../files.js';
import type { Output } from '../output.js';
import { printFindings, printHeading } from '../output.js';

/**
 * Bringing files in.
 *
 * Every one of these defaults to a dry run and takes `--write` to do it for
 * real. That is the wrong way round for a normal command line and the right
 * way round for this one: an import writes hundreds of records into an append
 * only journal and there is no undo, only a correcting entry for every row.
 */
export function importCommand(out: Output, context: Context): Command {
  const command = new Command('import').description('bring files in from the old system');

  const run = (
    label: string,
    path: string,
    write: boolean,
    importer: (workspace: Workspace, text: string, options: ImportOptions) => ImportResult,
  ): void => {
    const resolved = resolve(path);
    const result = importer(context.workspace(), readTextFile(resolved), {
      dryRun: !write,
      actor: context.actor,
    });
    printHeading(out, `${label} from ${resolved}`);
    out.line(`${pluralise(result.read, 'row')} read`);
    if (result.findings.length > 0) {
      out.line('');
      printFindings(out, result.findings);
      out.line('');
      out.line('nothing was written');
      return;
    }
    out.line(
      write
        ? `${pluralise(result.written, 'row')} written`
        : 'dry run, nothing written. Run again with --write to keep it',
    );
  };

  command
    .command('welders <file>')
    .description('a csv of stencil, name, from and optionally until')
    .option('--write', 'write the records rather than only checking the file', false)
    .action((file: string, options: { write: boolean }) => {
      run('Welders', file, options.write, importWelders);
    });

  command
    .command('heats <file>')
    .description('a csv of mill certificates')
    .option('--write', 'write the records rather than only checking the file', false)
    .action((file: string, options: { write: boolean }) => {
      run('Mill certificates', file, options.write, importHeats);
    });

  command
    .command('weld-log <file>')
    .description('a csv of weld log entries')
    .option('--write', 'write the records rather than only checking the file', false)
    .action((file: string, options: { write: boolean }) => {
      run('Weld log', file, options.write, importWeldLog);
    });

  return command;
}
