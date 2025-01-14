import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Command } from 'commander';

import { ValidationError } from '../../core/errors.js';
import { pluralise } from '../../core/text.js';
import { exportPackage } from '../../exporting/documents.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';
import { VERSION } from '../program.js';

/**
 * Writing the folder out.
 *
 * The directory has to be empty or not exist. Writing a package into a
 * directory that already has one in it produces a folder half from this run
 * and half from the last, and nothing in either half says which. That has
 * happened to somebody, somewhere, on the morning of an audit.
 */
export function exportCommand(out: Output, context: Context): Command {
  const command = new Command('export').description('write a vessel file out');

  command
    .command('package <vessel> <directory>')
    .description('write the whole data package as a folder of text files')
    .option('--lethal', 'the vessel is in lethal service', false)
    .option('--list', 'list what would be written without writing it', false)
    .action((vessel: string, directory: string, options: { lethal: boolean; list: boolean }) => {
      const documents = exportPackage(context.workspace(), {
        vessel,
        lethalService: options.lethal,
        printedAt: context.clock.now().toISOString(),
        buildVersion: VERSION,
      });

      if (options.list) {
        printHeading(out, `Data package for ${vessel}`);
        printTable(
          out,
          [...documents],
          [
            { header: 'file', value: (row) => row.name },
            { header: 'contents', value: (row) => row.title },
            {
              header: 'lines',
              align: 'right',
              value: (row) => String(row.text.split('\n').length),
            },
          ],
        );
        return;
      }

      const target = resolve(directory);
      if (existsSync(target) && readdirSync(target).length > 0) {
        throw new ValidationError('directory', `${target} is not empty`, { directory: target });
      }
      mkdirSync(target, { recursive: true });
      for (const document of documents) {
        writeFileSync(join(target, document.name), `${document.text}\n`, 'utf8');
      }
      out.line(`${pluralise(documents.length, 'document')} written to ${target}`);
    });

  return command;
}
