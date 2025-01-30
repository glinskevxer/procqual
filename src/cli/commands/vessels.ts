import { Command } from 'commander';

import { decimal } from '../../core/decimal.js';
import { ValidationError } from '../../core/errors.js';
import { PlainDate } from '../../core/plainDate.js';
import { keyValues, pluralise } from '../../core/text.js';
import { Temperature } from '../../core/temperature.js';
import {
  curveForJoint,
  describeVessel,
  reviewJointAgainstVessel,
  reviewVessel,
  toughnessRequiredFor,
  type Service,
  type Vessel,
} from '../../fabrication/vessel.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

const SERVICES: readonly Service[] = ['general', 'lethal', 'steam', 'sour'];

function readService(value: string): Service {
  const found = SERVICES.find((service) => service === value.toLowerCase());
  if (found === undefined) {
    throw new ValidationError('service', `not a service: ${value}`, { value, allowed: SERVICES });
  }
  return found;
}

/**
 * Vessels from the command line.
 *
 * `review` is the one to run the day the drawings land and again the day the
 * design conditions change. It reads every joint against the conditions, and
 * the two questions it answers, which joints now need notch toughness and
 * which are marked for too little radiography, are the two that get expensive
 * later.
 */
export function vesselsCommand(out: Output, context: Context): Command {
  const command = new Command('vessels').description('vessels and their design conditions');

  command
    .command('record <tag>')
    .description('put a vessel on the books')
    .requiredOption('--description <text>', 'what it is')
    .requiredOption('--customer <name>', 'who it is for')
    .requiredOption('--pressure <psi>', 'design pressure')
    .requiredOption('--temperature <degrees>', 'design temperature')
    .requiredOption('--mdmt <degrees>', 'minimum design metal temperature')
    .requiredOption('--ordered <date>', 'the day it was ordered')
    .option('--service <kind>', 'general, lethal, steam or sour', 'general')
    .option('--normalised <heat...>', 'heats supplied normalised')
    .action(
      (
        tag: string,
        options: {
          description: string;
          customer: string;
          pressure: string;
          temperature: string;
          mdmt: string;
          ordered: string;
          service: string;
          normalised?: string[];
        },
      ) => {
        const vessel: Vessel = {
          tag,
          description: options.description,
          customer: options.customer,
          service: readService(options.service),
          minimumDesignMetalTemperature: Temperature.parse(options.mdmt),
          designPressurePsi: decimal(options.pressure),
          designTemperature: Temperature.parse(options.temperature),
          orderedOn: PlainDate.parse(options.ordered),
          normalisedHeats: options.normalised ?? [],
        };
        context.workspace().vessels.record(vessel, context.actor);
        out.line(describeVessel(vessel));
        printFindings(out, reviewVessel(vessel));
      },
    );

  command
    .command('list')
    .description('the vessels on the books')
    .action(() => {
      const workspace = context.workspace();
      printHeading(out, 'Vessels');
      printTable(
        out,
        [...workspace.vessels.vessels()],
        [
          { header: 'tag', value: (row) => row.tag },
          { header: 'customer', value: (row) => row.customer },
          { header: 'service', value: (row) => row.service },
          { header: 'psi', align: 'right', value: (row) => row.designPressurePsi.toString() },
          { header: 'design', align: 'right', value: (row) => row.designTemperature.toString() },
          {
            header: 'mdmt',
            align: 'right',
            value: (row) => row.minimumDesignMetalTemperature.toString(),
          },
          {
            header: 'joints',
            align: 'right',
            value: (row) => String(workspace.fabrication.joints(row.tag).length),
          },
        ],
        'no vessels on the books',
      );
    });

  command
    .command('review <tag>')
    .description('read every joint against the design conditions')
    .action((tag: string) => {
      const workspace = context.workspace();
      const vessel = workspace.vessels.requireVessel(tag);
      const joints = workspace.fabrication.joints(tag);
      printHeading(out, describeVessel(vessel));
      const history = workspace.vessels.changeHistory(tag);
      if (history.length > 0) {
        out.line(`${pluralise(history.length, 'design change')}: ${history.join('; ')}`);
        out.line('');
      }
      printTable(
        out,
        [...joints],
        [
          { header: 'joint', value: (row) => row.id },
          { header: 'thickness', align: 'right', value: (row) => row.thickness.toFraction() },
          { header: 'curve', value: (row) => curveForJoint(vessel, row) },
          {
            header: 'toughness',
            value: (row) => (toughnessRequiredFor(vessel, row) ? 'yes' : 'no'),
          },
          { header: 'rt', value: (row) => row.radiography },
        ],
        'nothing on the weld map for this vessel',
      );
      const findings = [
        ...reviewVessel(vessel),
        ...joints.flatMap((joint) => reviewJointAgainstVessel(vessel, joint)),
      ];
      out.line('');
      printFindings(out, findings);
    });

  command
    .command('change <tag>')
    .description('record a change to the design conditions')
    .requiredOption('--pressure <psi>', 'design pressure')
    .requiredOption('--temperature <degrees>', 'design temperature')
    .requiredOption('--mdmt <degrees>', 'minimum design metal temperature')
    .requiredOption('--reason <text>', 'why it changed and who asked')
    .option('--service <kind>', 'general, lethal, steam or sour')
    .action(
      (
        tag: string,
        options: {
          pressure: string;
          temperature: string;
          mdmt: string;
          reason: string;
          service?: string;
        },
      ) => {
        const workspace = context.workspace();
        const before = workspace.vessels.requireVessel(tag);
        workspace.vessels.changeConditions(
          tag,
          {
            minimumDesignMetalTemperature: Temperature.parse(options.mdmt),
            designPressurePsi: decimal(options.pressure),
            designTemperature: Temperature.parse(options.temperature),
            service: options.service === undefined ? before.service : readService(options.service),
          },
          options.reason,
          context.actor,
        );
        const after = workspace.vessels.requireVessel(tag);
        out.line(describeVessel(after));
        out.line('');
        out.line(
          keyValues([
            ['was', describeVessel(before)],
            ['reason', options.reason],
          ]),
        );
      },
    );

  return command;
}
