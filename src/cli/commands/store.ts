import { Command } from 'commander';

import { PlainDate } from '../../core/plainDate.js';
import { pluralise } from '../../core/text.js';
import { Temperature } from '../../core/temperature.js';
import {
  exposureLimitHours,
  exposureSoFar,
  issueState,
  OVEN_RANGE,
  rebakeAccepted,
  reviewIssue,
  reviewOven,
} from '../../fabrication/consumables.js';
import { needsHoldingOven } from '../../materials/fillerMetal.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

/**
 * The store room hatch.
 *
 * `out` and `back` are meant to be one keystroke each on a terminal beside the
 * oven, because a control that takes a minute to record is a control that gets
 * recorded at the end of the shift from memory, which is not a control.
 */
export function storeCommand(out: Output, context: Context): Command {
  const command = new Command('store').description('the consumable store room');

  command
    .command('out <id> <consumable> <lot>')
    .description('issue a tin or a reel from the oven')
    .requiredOption('--to <stencil>', 'who is taking it')
    .requiredOption('--oven <name>', 'which oven it came out of')
    .option('--at <instant>', 'when, if not now')
    .action(
      (
        id: string,
        consumable: string,
        lot: string,
        options: { to: string; oven: string; at?: string },
      ) => {
        const workspace = context.workspace();
        const at = options.at ?? context.clock.now().toISOString();
        const issue = workspace.consumables.issue(
          id,
          consumable,
          lot,
          options.oven,
          options.to,
          PlainDate.fromInstant(new Date(at)),
          at,
          context.actor,
        );
        const limit = exposureLimitHours(consumable);
        out.line(
          limit === undefined
            ? `${id} issued, no exposure clock on this consumable`
            : `${id} issued with ${issue.priorExposureHours.toString()} of ${limit.toString()} hours already used`,
        );
        printFindings(out, reviewIssue(issue, at));
      },
    );

  command
    .command('back <id>')
    .description('record a tin going back into the oven')
    .option('--at <instant>', 'when, if not now')
    .action((id: string, options: { at?: string }) => {
      const workspace = context.workspace();
      const at = options.at ?? context.clock.now().toISOString();
      workspace.consumables.recordReturn(id, at, context.actor);
      const issue = workspace.consumables.requireIssue(id);
      out.line(
        `${id} back after ${exposureSoFar(issue, at).toString()} hours out, state ${issueState(issue, at)}`,
      );
      printFindings(out, reviewIssue(issue, at));
    });

  command
    .command('issues')
    .description('what is out of the oven now, and what it has used')
    .option('--all', 'include the tins that have gone back', false)
    .action((options: { all: boolean }) => {
      const workspace = context.workspace();
      const now = context.clock.now().toISOString();
      const issues = workspace.consumables
        .issues()
        .filter((item) => options.all || item.returnedAt === undefined);
      printHeading(out, options.all ? 'Every issue' : 'Out of the oven');
      printTable(
        out,
        [...issues],
        [
          { header: 'issue', value: (row) => row.id },
          { header: 'consumable', value: (row) => row.consumable },
          { header: 'lot', value: (row) => row.lot },
          { header: 'to', value: (row) => row.issuedTo },
          { header: 'out', value: (row) => row.issuedAt },
          { header: 'back', value: (row) => row.returnedAt ?? '' },
          { header: 'hours', align: 'right', value: (row) => exposureSoFar(row, now).toString() },
          { header: 'state', value: (row) => issueState(row, now) },
        ],
        options.all ? 'nothing has been issued' : 'nothing is out of the oven',
      );
      const findings = issues.flatMap((item) => reviewIssue(item, now));
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('oven <name> <temperature>')
    .description('log an oven temperature')
    .option('--at <instant>', 'when, if not now')
    .option('--rebake', 'this reading is from a rebake cycle', false)
    .action((name: string, temperature: string, options: { at?: string; rebake: boolean }) => {
      const reading = {
        oven: name,
        at: options.at ?? context.clock.now().toISOString(),
        temperature: Temperature.parse(temperature),
      };
      context.workspace().consumables.logOven(reading, context.actor);
      if (options.rebake) {
        out.line(
          rebakeAccepted(reading.temperature)
            ? `${name} logged at ${reading.temperature.toString()}, inside the rebake band`
            : `${name} logged at ${reading.temperature.toString()}, which is not a rebake temperature`,
        );
        return;
      }
      out.line(
        `${name} logged at ${reading.temperature.toString()}, holding band ${OVEN_RANGE.toString()}`,
      );
      printFindings(out, reviewOven([reading]));
    });

  command
    .command('ovens')
    .description('the oven log')
    .option('--oven <name>', 'narrow to one oven')
    .action((options: { oven?: string }) => {
      const readings = context.workspace().consumables.readings(options.oven);
      printHeading(out, 'Oven log');
      printTable(
        out,
        [...readings],
        [
          { header: 'oven', value: (row) => row.oven },
          { header: 'at', value: (row) => row.at },
          { header: 'temperature', align: 'right', value: (row) => row.temperature.toString() },
          {
            header: 'in band',
            value: (row) => (OVEN_RANGE.contains(row.temperature) ? 'yes' : 'no'),
          },
        ],
        'nothing logged',
      );
      out.line('');
      out.line(`${pluralise(readings.length, 'reading')} logged`);
      printFindings(out, reviewOven([...readings]));
    });

  command
    .command('controlled')
    .description('which consumables are on the oven clock at all')
    .action(() => {
      const codes = ['E7018-1/8', 'E6010-1/8', 'E8018-B2', 'E308L-16', 'ER70S-6', 'EM12K'];
      printTable(out, codes, [
        { header: 'consumable', value: (row) => row },
        { header: 'oven', value: (row) => (needsHoldingOven(row) ? 'yes' : 'no') },
        {
          header: 'allowance',
          value: (row) => exposureLimitHours(row)?.toString() ?? '',
        },
      ]);
    });

  return command;
}
