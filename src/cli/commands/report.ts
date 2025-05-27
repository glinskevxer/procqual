import { Command } from 'commander';

import { heading, pluralise } from '../../core/text.js';
import {
  assemblePackage,
  outstandingSections,
  packageInputFor,
  statusInputFor,
} from '../../reporting/dataPackage.js';
import { shopExceptions, worstAreas } from '../../reporting/exceptions.js';
import { describeStatus, outstandingJoints, statusesFor } from '../../reporting/jointStatus.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

/**
 * The reports, which is what most people who use this system ever run.
 *
 * `package` is meant to be run every week from the day the first plate is cut,
 * not on the day the inspector is booked. Everything it finds is cheaper to
 * fix the week it happens.
 */
export function reportCommand(out: Output, context: Context): Command {
  const command = new Command('report').description('the reports');

  command
    .command('joints <vessel>')
    .description('where every joint on a vessel has got to')
    .option('--outstanding', 'only the ones that are not finished', false)
    .action((vessel: string, options: { outstanding: boolean }) => {
      const workspace = context.workspace();
      const statuses = statusesFor(workspace.fabrication.joints(vessel), statusInputFor(workspace));
      const shown = options.outstanding ? outstandingJoints(statuses) : statuses;
      printHeading(out, `Joint status for ${vessel}`);
      printTable(
        out,
        [...shown],
        [
          { header: 'joint', value: (row) => row.joint.id },
          { header: 'stage', value: (row) => row.stage },
          {
            header: 'deposit',
            align: 'right',
            value: (row) => row.depositLaid?.toFraction() ?? '',
          },
          { header: 'welders', value: (row) => row.welders.join(', ') },
          { header: 'reports', align: 'right', value: (row) => String(row.examinations.length) },
          { header: 'outstanding', value: (row) => row.methodsOutstanding.join(', ') },
          {
            header: 'open repairs',
            align: 'right',
            value: (row) => String(row.openRepairs.length),
          },
        ],
        options.outstanding ? 'every joint is finished' : 'nothing on the weld map',
      );
    });

  command
    .command('joint <id>')
    .description('one joint in detail, with everything still to clear')
    .action((id: string) => {
      const workspace = context.workspace();
      const joint = workspace.fabrication.requireJoint(id);
      const status = statusesFor([joint], statusInputFor(workspace))[0];
      if (status === undefined) {
        return;
      }
      printHeading(out, describeStatus(status));
      printFindings(out, status.findings);
    });

  command
    .command('package <vessel>')
    .description('whether the paperwork is complete enough to sign for')
    .option('--lethal', 'the vessel is in lethal service', false)
    .action((vessel: string, options: { lethal: boolean }) => {
      const report = assemblePackage(packageInputFor(context.workspace(), vessel, options.lethal));
      printHeading(out, `Data package for ${vessel}`);
      for (const item of report.sections) {
        out.line('');
        out.line(heading(`${item.name} - ${item.complete ? 'complete' : 'outstanding'}`, '-'));
        printFindings(out, item.findings);
      }
      out.line('');
      out.line(
        report.complete
          ? 'the package is complete'
          : `${pluralise(report.outstanding, 'item')} outstanding across ${pluralise(outstandingSections(report).length, 'section')}`,
      );
    });

  command
    .command('exceptions')
    .description('everything outstanding anywhere in the shop')
    .option('--on <date>', 'read it as it stood on this day')
    .option('--area <name>', 'narrow to one area')
    .action((options: { on?: string; area?: string }) => {
      const on = onDate(context, options.on);
      const report = shopExceptions(context.workspace(), on);
      printHeading(out, `Outstanding at ${on.toString()}`);
      const areas =
        options.area === undefined
          ? worstAreas(report)
          : report.areas.filter((area) => area.area === options.area);
      if (areas.length === 0) {
        out.line(
          options.area === undefined
            ? 'nothing outstanding'
            : `nothing outstanding in ${options.area}`,
        );
        return;
      }
      for (const area of areas) {
        out.line('');
        out.line(heading(`${area.area} (${pluralise(area.findings.length, 'item')})`, '-'));
        printFindings(out, area.findings);
      }
      out.line('');
      out.line(
        `${pluralise(report.total, 'item')} outstanding, ${String(report.blocking)} of them blocking`,
      );
    });

  return command;
}
