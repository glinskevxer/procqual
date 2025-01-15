import { Command } from 'commander';

import { parseProcess } from '../../codes/process.js';
import { pluralise } from '../../core/text.js';
import { assess, jointRequirement, reasonsRefused } from '../../fabrication/assignment.js';
import { eligibleWelders } from '../../personnel/register.js';
import { claimFor } from '../../qualification/wps.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

/**
 * Can this man weld that joint tomorrow morning.
 *
 * The command exists because the answer lives in four places that nobody
 * checks together. A foreman who asks it out loud gets a yes from whoever is
 * nearest, and the four systems each get a chance to say no here instead.
 */
export function assignCommand(out: Output, context: Context): Command {
  const command = new Command('assign').description('who may weld what');

  command
    .command('check <joint> <welder>')
    .description('whether a welder may take a joint')
    .requiredOption('--process <code>', 'the process to be used')
    .requiredOption('--consumable <code>', 'the consumable to be used')
    .option('--on <date>', 'the day the work would be done')
    .action(
      (
        jointId: string,
        stencil: string,
        options: { process: string; consumable: string; on?: string },
      ) => {
        const workspace = context.workspace();
        const joint = workspace.fabrication.requireJoint(jointId);
        const procedure = workspace.procedures.requireProcedure(joint.procedure);
        const welder = workspace.personnel.requireWelder(stencil);
        const on = onDate(context, options.on);

        const answer = assess({
          joint,
          procedure,
          records: workspace.procedures.recordsBehind(procedure),
          welder,
          entries: workspace.personnel.entries(),
          process: parseProcess(options.process),
          consumable: options.consumable,
          on,
        });

        printHeading(
          out,
          `${welder.stencil} on ${joint.id} with ${procedure.number.toString()} on ${on.toString()}`,
        );
        if (answer.allowed) {
          out.line('allowed');
          printFindings(out, answer.findings);
          return;
        }
        out.line(`refused on ${pluralise(reasonsRefused(answer).length, 'count')}`);
        out.line('');
        printFindings(out, answer.findings);
      },
    );

  command
    .command('who <joint>')
    .description('everyone who could take a joint today')
    .requiredOption('--process <code>', 'the process to be used')
    .option('--on <date>', 'the day the work would be done')
    .action((jointId: string, options: { process: string; on?: string }) => {
      const workspace = context.workspace();
      const joint = workspace.fabrication.requireJoint(jointId);
      const procedure = workspace.procedures.requireProcedure(joint.procedure);
      const process = parseProcess(options.process);
      const claim = claimFor(procedure, process);
      const on = onDate(context, options.on);

      if (claim === undefined) {
        out.line(`${procedure.number.toString()} does not offer ${process}`);
        return;
      }
      const requirement = jointRequirement(
        joint,
        process,
        claim.fNumbers[0] ?? 1,
        claim.progression,
      );
      const found = eligibleWelders(
        workspace.personnel.welders(),
        workspace.personnel.entries(),
        requirement,
        on,
      );
      printHeading(out, `Welders for ${joint.id} on ${on.toString()}`);
      printTable(
        out,
        [...found],
        [
          { header: 'stencil', value: (row) => row.stencil },
          { header: 'name', value: (row) => row.name },
        ],
        'nobody on the register can take this joint today',
      );
    });

  return command;
}
