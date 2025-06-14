import { Command } from 'commander';

import { DocumentNumber } from '../../core/identifier.js';
import { Length } from '../../core/units.js';
import { keyValues, pluralise } from '../../core/text.js';
import {
  describeJoint,
  jointEfficiency,
  parseJointType,
  parseRadiographyLevel,
  jointTypeFacts,
  parseJointCategory,
  reviewJoint,
  type Joint,
} from '../../fabrication/joint.js';
import { describeDemand, requiredExaminations } from '../../nde/requirement.js';
import type { Context } from '../context.js';
import { parseProductionPosition } from '../../codes/position.js';
import { parseProductForm, parseWeldType } from '../parse.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

interface MapOptions {
  vessel: string;
  description: string;
  category: string;
  type: string;
  weld: string;
  form: string;
  position: string;
  thickness: string;
  length: string;
  diameter?: string;
  left: string;
  right: string;
  heatLeft: string;
  heatRight: string;
  procedure: string;
  radiography: string;
}

/**
 * The weld map from the command line.
 *
 * `show` is the one worth having. It is the only place in the shop where the
 * category, the construction type, the examination level, the efficiency that
 * falls out of them and the examinations that follow are all on the same piece
 * of paper. Everywhere else they live on four different drawings.
 */
export function jointsCommand(out: Output, context: Context): Command {
  const command = new Command('joints').description('the weld map');

  command
    .command('map <id>')
    .description('put a joint on the weld map')
    .requiredOption('--vessel <tag>', 'the vessel it belongs to')
    .requiredOption('--description <text>', 'where it is on the vessel')
    .requiredOption('--category <letter>', 'A, B, C or D')
    .requiredOption('--type <number>', 'construction type, 1 to 7')
    .option('--weld <kind>', 'groove or fillet', 'groove')
    .option('--form <kind>', 'plate or pipe', 'plate')
    .requiredOption('--position <name>', 'flat, horizontal, vertical or overhead')
    .requiredOption('--thickness <length>', 'as 1/2 or 0.5')
    .requiredOption('--length <length>', 'length of weld, in inches')
    .option('--diameter <length>', 'outside diameter, for a pipe joint')
    .requiredOption('--left <specification>', 'base metal on one side')
    .requiredOption('--right <specification>', 'base metal on the other')
    .requiredOption('--heat-left <number>', 'heat number on one side')
    .requiredOption('--heat-right <number>', 'heat number on the other')
    .requiredOption('--procedure <number>', 'the procedure it is welded to')
    .option('--radiography <level>', 'full, spot or none', 'full')
    .action((id: string, options: MapOptions) => {
      const joint: Joint = {
        id,
        vessel: options.vessel,
        description: options.description,
        category: parseJointCategory(options.category),
        type: parseJointType(options.type),
        weldType: parseWeldType(options.weld),
        productForm: parseProductForm(options.form),
        position: parseProductionPosition(options.position),
        thickness: Length.parse(options.thickness),
        lengthOfWeld: Length.parse(options.length),
        baseMetalLeft: options.left,
        baseMetalRight: options.right,
        heatLeft: options.heatLeft,
        heatRight: options.heatRight,
        procedure: DocumentNumber.parse(options.procedure),
        radiography: parseRadiographyLevel(options.radiography),
        ...(options.diameter === undefined
          ? {}
          : { outsideDiameter: Length.parse(options.diameter) }),
      };
      const findings = reviewJoint(joint);
      context.workspace().fabrication.mapJoint(joint, context.actor);
      out.line(describeJoint(joint));
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('list')
    .description('the joints on the map')
    .option('--vessel <tag>', 'narrow to one vessel')
    .action((options: { vessel?: string }) => {
      const joints = context.workspace().fabrication.joints(options.vessel);
      printHeading(
        out,
        options.vessel === undefined ? 'Weld map' : `Weld map for ${options.vessel}`,
      );
      printTable(
        out,
        [...joints],
        [
          { header: 'joint', value: (row) => row.id },
          { header: 'vessel', value: (row) => row.vessel },
          { header: 'cat', value: (row) => row.category },
          { header: 'type', align: 'right', value: (row) => String(row.type) },
          { header: 'thk', align: 'right', value: (row) => row.thickness.toFraction() },
          { header: 'rt', value: (row) => row.radiography },
          {
            header: 'eff',
            align: 'right',
            value: (row) => jointEfficiency(row.type, row.radiography)?.toFixed(2) ?? 'n/a',
          },
          { header: 'procedure', value: (row) => row.procedure.key() },
        ],
        'nothing on the weld map',
      );
    });

  command
    .command('show <id>')
    .description('everything decided about one joint')
    .option('--lethal', 'the vessel is in lethal service', false)
    .action((id: string, options: { lethal: boolean }) => {
      const joint = context.workspace().fabrication.requireJoint(id);
      const efficiency = jointEfficiency(joint.type, joint.radiography);
      printHeading(out, `${joint.id}  ${joint.description}`);
      out.line(
        keyValues([
          ['vessel', joint.vessel],
          ['category', joint.category],
          ['construction', `type ${joint.type}, ${jointTypeFacts(joint.type).description}`],
          ['base metal', `${joint.baseMetalLeft} to ${joint.baseMetalRight}`],
          ['heats', `${joint.heatLeft} and ${joint.heatRight}`],
          ['thickness', joint.thickness.toFraction()],
          ['weld length', joint.lengthOfWeld.toFraction()],
          ['procedure', joint.procedure.toString()],
          ['radiography', joint.radiography],
          ['efficiency', efficiency === undefined ? 'not permitted' : efficiency.toFixed(2)],
        ]),
      );
      out.line('');
      const demands = requiredExaminations({
        joint,
        lethalService: options.lethal,
        repair: false,
      });
      out.line(`${pluralise(demands.length, 'examination')} required`);
      for (const demand of demands) {
        out.line(`  ${describeDemand(demand)}`);
      }
      const findings = reviewJoint(joint);
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('level <id> <level>')
    .description('change how much radiography a joint gets')
    .requiredOption('--reason <text>', 'who agreed it and why')
    .action((id: string, level: string, options: { reason: string }) => {
      const workspace = context.workspace();
      workspace.fabrication.changeExaminationLevel(
        id,
        parseRadiographyLevel(level),
        options.reason,
        context.actor,
      );
      out.line(describeJoint(workspace.fabrication.requireJoint(id)));
    });

  return command;
}
