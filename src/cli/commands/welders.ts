import { Command } from 'commander';

import { parseProcess } from '../../codes/process.js';
import { PlainDate } from '../../core/plainDate.js';
import { pluralise } from '../../core/text.js';
import {
  continuityStatusOn,
  dueWithinDays,
  type ContinuityStatus,
} from '../../personnel/continuity.js';
import type { RegisterEntry } from '../../personnel/register.js';
import { normaliseStencil, type PerformanceQualification } from '../../personnel/welder.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

interface StatusRow {
  qualification: PerformanceQualification;
  status: ContinuityStatus;
}

function statusRows(entries: readonly RegisterEntry[], on: PlainDate): StatusRow[] {
  return entries.map((entry) => ({
    qualification: entry.qualification,
    status: continuityStatusOn(entry.qualification, entry.usageDates, on),
  }));
}

/**
 * The welder register, from the command line.
 *
 * The continuity list is the one that gets run. A coordinator wants to know
 * who goes off the books this month before the month starts, because a coupon
 * takes a day of a welder's time and the laboratory is not open at midnight.
 */
export function weldersCommand(out: Output, context: Context): Command {
  const command = new Command('welders').description('the welder register');

  command
    .command('add <stencil> <name>')
    .description('put a welder on the register')
    .requiredOption('--from <date>', 'the day they started, as 2024-01-16')
    .action((stencil: string, name: string, options: { from: string }) => {
      const welder = context
        .workspace()
        .personnel.registerWelder(
          { stencil, name, employedFrom: PlainDate.parse(options.from) },
          context.actor,
        );
      out.line(`${welder.stencil} added`);
    });

  command
    .command('left <stencil>')
    .description('record the day a welder left')
    .requiredOption('--on <date>', 'their last day')
    .action((stencil: string, options: { on: string }) => {
      context
        .workspace()
        .personnel.recordLeaving(stencil, PlainDate.parse(options.on), context.actor);
      out.line(`${normaliseStencil(stencil)} recorded as leaving on ${options.on}`);
    });

  command
    .command('list')
    .description('everyone on the register')
    .option('--on <date>', 'read the register as it stood on this day')
    .action((options: { on?: string }) => {
      const workspace = context.workspace();
      const on = onDate(context, options.on);
      const welders = workspace.personnel.welders();
      printHeading(out, `Welder register at ${on.toString()}`);
      printTable(
        out,
        [...welders],
        [
          { header: 'stencil', value: (row) => row.stencil },
          { header: 'name', value: (row) => row.name },
          { header: 'from', value: (row) => row.employedFrom.toString() },
          { header: 'until', value: (row) => row.employedUntil?.toString() ?? '' },
          {
            header: 'coupons',
            align: 'right',
            value: (row) => String(workspace.personnel.entriesFor(row.stencil).length),
          },
        ],
        'nobody on the register',
      );
    });

  command
    .command('used <stencil> <process>')
    .description('record a day the welder deposited metal, which restarts the clock')
    .requiredOption('--on <date>', 'the day')
    .action((stencil: string, process: string, options: { on: string }) => {
      context
        .workspace()
        .personnel.recordUse(
          stencil,
          parseProcess(process),
          PlainDate.parse(options.on),
          context.actor,
        );
      out.line(`${normaliseStencil(stencil)} ${parseProcess(process)} used on ${options.on}`);
    });

  command
    .command('continuity')
    .description('who is current, who has lapsed and who is about to')
    .option('--on <date>', 'read it as it stood on this day')
    .option('--due <days>', 'show only those lapsing inside this many days')
    .action((options: { on?: string; due?: string }) => {
      const on = onDate(context, options.on);
      const entries = context.workspace().personnel.entries();
      const rows = statusRows(entries, on);
      const shown =
        options.due === undefined ? rows : [...dueWithinDays(rows, Number(options.due))];
      printHeading(out, `Continuity at ${on.toString()}`);
      printTable(
        out,
        shown,
        [
          { header: 'stencil', value: (row) => row.qualification.stencil },
          { header: 'coupon', value: (row) => row.qualification.number.key() },
          { header: 'process', value: (row) => row.qualification.process },
          { header: 'state', value: (row) => row.status.state },
          { header: 'last used', value: (row) => row.status.lastUsed.toString() },
          { header: 'expires', value: (row) => row.status.expiresOn.toString() },
          { header: 'days', align: 'right', value: (row) => String(row.status.daysRemaining) },
        ],
        'no coupons on the register',
      );
      const lapsed = rows.filter((row) => row.status.state === 'lapsed').length;
      if (lapsed > 0 && options.due === undefined) {
        out.line('');
        out.line(`${pluralise(lapsed, 'coupon')} lapsed`);
      }
    });

  return command;
}
