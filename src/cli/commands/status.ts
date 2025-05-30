import { Command } from 'commander';

import { heading, keyValues, pluralise } from '../../core/text.js';
import { continuityStatusOn, dueWithinDays } from '../../personnel/continuity.js';
import { shopExceptions } from '../../reporting/exceptions.js';
import { statusesFor } from '../../reporting/jointStatus.js';
import { statusInputFor } from '../../reporting/dataPackage.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

/**
 * One screen, run first thing.
 *
 * Every other command answers a question somebody already knew to ask. This is
 * for the morning, before anybody has thought of a question, and it is
 * deliberately short: three tables and a count. A dashboard that fills a
 * screen and a half is one nobody reads twice.
 */
export function statusCommand(out: Output, context: Context): Command {
  return new Command('status')
    .description('the shop this morning')
    .option('--on <date>', 'read it as it stood on this day')
    .option('--due <days>', 'the continuity warning window', '30')
    .action((options: { on?: string; due: string }) => {
      const workspace = context.workspace();
      const on = onDate(context, options.on);

      printHeading(out, `${workspace.marker.shop} at ${on.toString()}`);
      out.line(
        keyValues([
          ['welders', String(workspace.personnel.welders().length)],
          ['procedures', String(workspace.procedures.procedures().length)],
          ['vessels', String(workspace.vessels.vessels().length)],
          ['joints', String(workspace.fabrication.joints().length)],
          ['journal entries', String(workspace.entryCount())],
        ]),
      );

      const rows = workspace.registerEntries().map((entry) => ({
        qualification: entry.qualification,
        status: continuityStatusOn(entry.qualification, entry.usageDates, on, workspace.policy),
      }));
      const due = dueWithinDays(rows, Number(options.due));
      const lapsed = rows.filter((row) => row.status.state === 'lapsed');

      out.line('');
      out.line(heading('welders to watch', '-'));
      printTable(
        out,
        [...due, ...lapsed],
        [
          { header: 'stencil', value: (row) => row.qualification.stencil },
          { header: 'process', value: (row) => row.qualification.process },
          { header: 'state', value: (row) => row.status.state },
          { header: 'expires', value: (row) => row.status.expiresOn.toString() },
          { header: 'days', align: 'right', value: (row) => String(row.status.daysRemaining) },
        ],
        'nobody lapses inside the window',
      );

      out.line('');
      out.line(heading('vessels', '-'));
      printTable(
        out,
        [...workspace.vessels.vessels()],
        [
          { header: 'vessel', value: (row) => row.tag },
          { header: 'customer', value: (row) => row.customer },
          {
            header: 'joints',
            align: 'right',
            value: (row) => String(workspace.fabrication.joints(row.tag).length),
          },
          {
            header: 'finished',
            align: 'right',
            value: (row) =>
              String(
                statusesFor(
                  workspace.fabrication.joints(row.tag),
                  statusInputFor(workspace),
                ).filter((status) => status.complete).length,
              ),
          },
        ],
        'no vessels on the books',
      );

      const exceptions = shopExceptions(workspace, on);
      out.line('');
      out.line(
        exceptions.total === 0
          ? 'nothing outstanding anywhere'
          : `${pluralise(exceptions.total, 'item')} outstanding across ${pluralise(exceptions.areas.length, 'area')}, ${String(exceptions.blocking)} blocking`,
      );
    });
}
