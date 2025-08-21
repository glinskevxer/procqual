import { Command } from 'commander';

import { keyValues, pluralise } from '../../core/text.js';
import {
  busyDays,
  summariseActors,
  summariseDays,
  weekendDays,
} from '../../reporting/auditTrail.js';
import { verifyChain } from '../../store/journal.js';
import { describeBuild } from '../../version.js';
import { LATEST_SCHEMA } from '../../store/migrations.js';
import { defaultWorkspacePath, Workspace } from '../../store/workspace.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

/**
 * Looking after the workspace itself.
 *
 * `verify` is the one that matters and it is meant to be run by a scheduled
 * job rather than by a person. The chain cannot stop somebody rewriting the
 * whole file, but it does mean an edit has to be a rewrite, and a check that
 * runs every night narrows the window in which one could happen unnoticed to
 * a day.
 */
export function workspaceCommand(out: Output, context: Context): Command {
  const command = new Command('workspace').description('the workspace itself');

  command
    .command('init [directory]')
    .description('create a workspace')
    .requiredOption('--shop <name>', 'what to call this shop in the record')
    .action((directory: string | undefined, options: { shop: string }) => {
      const path = directory ?? defaultWorkspacePath();
      const workspace = Workspace.open(path, {
        clock: context.clock,
        create: true,
        shop: options.shop,
      });
      out.line(`workspace created at ${workspace.directory} for ${workspace.marker.shop}`);
    });

  command
    .command('status')
    .description('what is in the workspace')
    .action(() => {
      const workspace = context.workspace();
      printHeading(out, `Workspace ${workspace.directory}`);
      out.line(
        keyValues([
          ['shop', workspace.marker.shop],
          ['created', workspace.marker.createdAt],
          ['build', describeBuild()],
          ['schema', `${String(workspace.marker.schemaVersion)} of ${String(LATEST_SCHEMA)}`],
          ['journal entries', String(workspace.entryCount())],
          ['welders', String(workspace.personnel.welders().length)],
          ['coupons', String(workspace.personnel.entries().length)],
          ['records', String(workspace.procedures.records().length)],
          ['procedures', String(workspace.procedures.procedures().length)],
          ['joints', String(workspace.fabrication.joints().length)],
          ['weld log entries', String(workspace.fabrication.entries().length)],
          ['examinations', String(workspace.examinations.examinations().length)],
          ['repairs', String(workspace.examinations.repairs().length)],
          ['heats', String(workspace.materials.heats().length)],
          ['charts', String(workspace.materials.charts().length)],
        ]),
      );
    });

  command
    .command('verify')
    .description('check that nothing has been edited behind the program')
    .action(() => {
      const entries = context.workspace().journal.read();
      const problems = verifyChain(entries);
      if (problems.length === 0) {
        out.line(`${pluralise(entries.length, 'entry', 'entries')} checked, the chain is intact`);
        return;
      }
      printHeading(out, 'The journal has been altered');
      printTable(
        out,
        [...problems],
        [
          { header: 'entry', align: 'right', value: (row) => String(row.sequence) },
          { header: 'problem', value: (row) => row.problem },
          { header: 'detail', value: (row) => row.detail },
        ],
      );
    });

  command
    .command('history')
    .description('the journal itself, newest last')
    .option('--type <name>', 'only entries of one type')
    .option('--actor <name>', 'only entries written by one person')
    .option('--last <count>', 'only the last so many', '25')
    .action((options: { type?: string; actor?: string; last: string }) => {
      const entries = context
        .workspace()
        .journal.read()
        .filter((entry) => options.type === undefined || entry.type === options.type)
        .filter((entry) => options.actor === undefined || entry.actor === options.actor);
      const shown = entries.slice(Math.max(0, entries.length - Number(options.last)));
      printHeading(out, 'Journal');
      printTable(
        out,
        [...shown],
        [
          { header: 'seq', align: 'right', value: (row) => String(row.sequence) },
          { header: 'at', value: (row) => row.at },
          { header: 'actor', value: (row) => row.actor },
          { header: 'type', value: (row) => row.type },
          { header: 'subject', value: (row) => subjectOf(row.payload) },
        ],
        'nothing in the journal',
      );
    });

  command
    .command('audit')
    .description('who has been writing in the journal, and when')
    .option('--busy <multiple>', 'flag days this many times above the rest', '5')
    .action((options: { busy: string }) => {
      const entries = context.workspace().journal.read();
      const actors = summariseActors(entries);
      const days = summariseDays(entries);
      printHeading(out, 'Who wrote what');
      printTable(
        out,
        [...actors],
        [
          { header: 'actor', value: (row) => row.actor },
          { header: 'entries', align: 'right', value: (row) => String(row.entries) },
          { header: 'first', value: (row) => row.firstAt },
          { header: 'last', value: (row) => row.lastAt },
          { header: 'kinds', align: 'right', value: (row) => String(row.types.length) },
        ],
        'nothing in the journal',
      );

      const weekends = weekendDays(days);
      const busy = busyDays(days, Number(options.busy));
      if (weekends.length > 0 || busy.length > 0) {
        out.line('');
        printHeading(out, 'Worth a second look');
        printTable(
          out,
          [...weekends, ...busy],
          [
            { header: 'day', value: (row) => row.day },
            { header: 'entries', align: 'right', value: (row) => String(row.entries) },
            { header: 'actors', value: (row) => row.actors.join(', ') },
            {
              header: 'why',
              value: (row) => (weekends.includes(row) ? 'weekend' : 'far busier than the rest'),
            },
          ],
        );
      }
    });

  return command;
}

/** A short label for an entry, taken from whichever key looks like its subject. */
function subjectOf(payload: Readonly<Record<string, unknown>>): string {
  for (const key of ['id', 'number', 'stencil', 'heatNumber', 'name']) {
    const value = payload[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}
