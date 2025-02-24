import { Command } from 'commander';

import { parseProcess } from '../../codes/process.js';
import { parseTestPosition } from '../../codes/position.js';
import { DocumentNumber } from '../../core/identifier.js';
import { Length } from '../../core/units.js';
import {
  assessProductionQualification,
  describeEligibility,
  eligibility,
} from '../../personnel/productionQualification.js';
import { reviewQualification } from '../../personnel/welder.js';
import { PlainDate } from '../../core/plainDate.js';
import { pluralise } from '../../core/text.js';
import {
  continuityStatusOn,
  dueWithinDays,
  type ContinuityStatus,
} from '../../personnel/continuity.js';
import { processesHeld, type RegisterEntry } from '../../personnel/register.js';
import { normaliseStencil, type PerformanceQualification } from '../../personnel/welder.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

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
          {
            header: 'current',
            value: (row) => processesHeld(workspace.registerEntries(), row.stencil, on).join(', '),
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
    .command('coupon <number>')
    .description('record a performance qualification coupon')
    .requiredOption('--welder <stencil>', 'who ran it')
    .requiredOption('--process <code>', 'the process used')
    .requiredOption('--position <code>', 'the test position, as 3G')
    .requiredOption('--filler <number>', 'the F number of the filler used')
    .requiredOption('--deposit <length>', 'weld metal deposited')
    .requiredOption('--layers <count>', 'layers deposited')
    .requiredOption('--on <date>', 'the day it was welded')
    .requiredOption('--witness <name>', 'who witnessed it')
    .requiredOption('--base-metal <pNumber>', 'P number of the coupon material')
    .option('--fillet', 'a fillet coupon rather than a groove one', false)
    .option('--pipe <diameter>', 'a pipe coupon of this outside diameter')
    .option('--backing', 'welded onto backing', false)
    .option('--downhill', 'welded downhill', false)
    .option('--failed', 'the coupon did not pass its tests', false)
    .action(
      (
        number: string,
        options: {
          welder: string;
          process: string;
          position: string;
          filler: string;
          deposit: string;
          layers: string;
          on: string;
          witness: string;
          baseMetal: string;
          fillet: boolean;
          pipe?: string;
          backing: boolean;
          downhill: boolean;
          failed: boolean;
        },
      ) => {
        const workspace = context.workspace();
        const qualification = {
          number: DocumentNumber.parse(number),
          stencil: normaliseStencil(options.welder),
          weldedOn: PlainDate.parse(options.on),
          process: parseProcess(options.process),
          weldType: options.fillet ? ('fillet' as const) : ('groove' as const),
          productForm: options.pipe === undefined ? ('plate' as const) : ('pipe' as const),
          position: parseTestPosition(options.position),
          verticalProgression: options.downhill ? ('downhill' as const) : ('uphill' as const),
          fNumber: Number(options.filler),
          backing: options.backing,
          depositThickness: Length.parse(options.deposit),
          layers: Number(options.layers),
          outsideDiameter: options.pipe === undefined ? undefined : Length.parse(options.pipe),
          testMethod: options.fillet ? ('macro' as const) : ('bend' as const),
          passed: !options.failed,
          witnessedBy: options.witness,
        };
        const findings = reviewQualification(
          qualification,
          workspace.personnel.welder(qualification.stencil),
        );
        if (findings.some((item) => item.severity === 'blocking')) {
          printFindings(out, findings);
          out.line('');
          out.line('not recorded');
          return;
        }
        workspace.personnel.recordQualification(qualification, options.baseMetal, context.actor);
        out.line(`${qualification.number.key()} recorded for ${qualification.stencil}`);
        printFindings(out, findings);
      },
    );

  command
    .command('production <welder> <joint> <report>')
    .description('qualify a welder on a production radiograph instead of a coupon')
    .requiredOption('--process <code>', 'the process used')
    .requiredOption('--on <date>', 'the day the weld was run')
    .option('--transfer <mode>', 'the transfer mode, where it matters')
    .action(
      (
        stencil: string,
        jointId: string,
        reportId: string,
        options: { process: string; on: string; transfer?: string },
      ) => {
        const workspace = context.workspace();
        const joint = workspace.fabrication.requireJoint(jointId);
        const examination = workspace.examinations.requireExamination(reportId);
        const request = {
          stencil: normaliseStencil(stencil),
          process: parseProcess(options.process),
          transferMode: options.transfer as undefined,
          pNumber: '1',
          joint: jointId,
          weldedOn: PlainDate.parse(options.on),
          examination,
          jointThickness: joint.thickness,
        };
        out.line(describeEligibility(eligibility(request)));
        const verdict = assessProductionQualification(request);
        out.line('');
        printFindings(out, verdict.findings);
        out.line('');
        out.line(verdict.qualified ? 'qualified' : 'not qualified');
      },
    );

  command
    .command('continuity')
    .description('who is current, who has lapsed and who is about to')
    .option('--on <date>', 'read it as it stood on this day')
    .option('--due <days>', 'show only those lapsing inside this many days')
    .action((options: { on?: string; due?: string }) => {
      const on = onDate(context, options.on);
      const entries = context.workspace().registerEntries();
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
