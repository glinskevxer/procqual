import { Command } from 'commander';

import { decimal } from '../../core/decimal.js';
import { ValidationError } from '../../core/errors.js';
import { PlainDate } from '../../core/plainDate.js';
import { keyValues } from '../../core/text.js';
import { Length } from '../../core/units.js';
import { allBaseMetals, baseMetal, curveFor, isBaseMetal } from '../../materials/baseMetal.js';
import { allStock, fillersForJoint, needsHoldingOven } from '../../materials/fillerMetal.js';
import type { DepositAnalysis, Element } from '../../codes/anumber.js';
import { carbonEquivalent, certifiedCurve, verifyCertificate } from '../../materials/heat.js';
import { reviewChart } from '../../fabrication/heatTreatmentChart.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

const ELEMENTS: readonly Element[] = ['C', 'Cr', 'Mo', 'Ni', 'Mn', 'Si', 'V'];

function readAnalysis(values: readonly string[]): DepositAnalysis {
  const analysis: DepositAnalysis = {};
  for (const pair of values) {
    const [element, amount] = pair.split('=');
    const found = ELEMENTS.find((candidate) => candidate === element?.trim());
    if (found === undefined || amount === undefined) {
      throw new ValidationError(
        'chemistry',
        `expected an element=percent pair, as C=0.18: ${pair}`,
        {
          pair,
        },
      );
    }
    analysis[found] = decimal(amount.trim());
  }
  return analysis;
}

/**
 * The material side of the shop.
 *
 * The certificate check on the way in is the whole reason this is a command
 * and not a spreadsheet. A goods inwards clerk with a mill certificate and a
 * terminal can be told, in the time it takes to type the numbers, that the
 * plate does not meet its own specification, and the lorry is often still in
 * the yard.
 */
export function materialsCommand(out: Output, context: Context): Command {
  const command = new Command('materials').description('base metals, consumables and heats');

  command
    .command('specifications')
    .description('the base metals the shop buys')
    .option('--normalised', 'read the curve for a normalised heat', false)
    .action((options: { normalised: boolean }) => {
      printHeading(out, 'Base metals');
      printTable(
        out,
        [...allBaseMetals()],
        [
          { header: 'specification', value: (row) => row.designation },
          { header: 'P-No', value: (row) => row.pNumber },
          { header: 'group', align: 'right', value: (row) => String(row.groupNumber) },
          { header: 'form', value: (row) => row.category },
          { header: 'tensile', align: 'right', value: (row) => String(row.minimumTensileKsi) },
          { header: 'curve', value: (row) => curveFor(row.designation, options.normalised) },
        ],
      );
    });

  command
    .command('consumables')
    .description('the consumable stock')
    .action(() => {
      printHeading(out, 'Consumable stock');
      printTable(
        out,
        [...allStock()],
        [
          { header: 'code', value: (row) => row.code },
          {
            header: 'classification',
            value: (row) => `${row.specification} ${row.classification}`,
          },
          { header: 'trade name', value: (row) => row.tradeName },
          { header: 'processes', value: (row) => row.processes.join(', ') },
          { header: 'oven', value: (row) => (needsHoldingOven(row.code) ? 'yes' : 'no') },
        ],
      );
    });

  command
    .command('filler <left> <right>')
    .description('what the shop will put in a joint between two base metals')
    .action((left: string, right: string) => {
      const leftP = isBaseMetal(left) ? baseMetal(left).pNumber : left;
      const rightP = isBaseMetal(right) ? baseMetal(right).pNumber : right;
      const found = fillersForJoint(leftP, rightP);
      if (found.length === 0) {
        out.line(
          `nothing on the standing list for a P-No ${leftP} to P-No ${rightP} joint, so the welding engineer has to write it up`,
        );
        return;
      }
      out.line(`P-No ${leftP} to P-No ${rightP}:`);
      for (const item of found) {
        out.line(`  ${item.code} (${item.tradeName})`);
      }
    });

  command
    .command('certify <heat>')
    .description('file a mill certificate')
    .requiredOption('--specification <name>', 'as SA-516 Gr 70')
    .requiredOption('--supplier <name>', 'who supplied it')
    .requiredOption('--certificate <number>', 'the certificate number')
    .requiredOption('--dated <date>', 'the certificate date')
    .requiredOption('--thickness <length>', 'as supplied')
    .requiredOption('--tensile <ksi>', 'certified tensile strength')
    .requiredOption('--yield <ksi>', 'certified yield strength')
    .requiredOption('--elongation <percent>', 'certified elongation')
    .option('--normalised', 'the mill normalised the heat', false)
    .option('--element <pair...>', 'element=percent, repeatable')
    .action(
      (
        heatNumber: string,
        options: {
          specification: string;
          supplier: string;
          certificate: string;
          dated: string;
          thickness: string;
          tensile: string;
          yield: string;
          elongation: string;
          normalised: boolean;
          element?: string[];
        },
      ) => {
        const heat = {
          heatNumber,
          specification: options.specification,
          supplier: options.supplier,
          certificateNumber: options.certificate,
          certificateDate: PlainDate.parse(options.dated),
          thickness: Length.parse(options.thickness),
          normalised: options.normalised,
          chemistry: readAnalysis(options.element ?? []),
          mechanical: {
            tensileKsi: decimal(options.tensile),
            yieldKsi: decimal(options.yield),
            elongationPercent: decimal(options.elongation),
          },
        };
        context.workspace().materials.certify(heat, context.actor);
        out.line(
          `${heatNumber} filed on curve ${certifiedCurve(heat)}, carbon equivalent ${carbonEquivalent(heat.chemistry).toString()}`,
        );
        printFindings(out, verifyCertificate(heat));
      },
    );

  command
    .command('heats')
    .description('the certificates on file')
    .action(() => {
      printHeading(out, 'Mill certificates');
      printTable(
        out,
        [...context.workspace().materials.heats()],
        [
          { header: 'heat', value: (row) => row.heatNumber },
          { header: 'specification', value: (row) => row.specification },
          { header: 'supplier', value: (row) => row.supplier },
          { header: 'thk', align: 'right', value: (row) => row.thickness.toFraction() },
          {
            header: 'tensile',
            align: 'right',
            value: (row) => row.mechanical.tensileKsi.toString(),
          },
          { header: 'curve', value: (row) => certifiedCurve(row) },
          {
            header: 'ce',
            align: 'right',
            value: (row) => carbonEquivalent(row.chemistry).toString(),
          },
        ],
        'no certificates on file',
      );
    });

  command
    .command('heat <number>')
    .description('one certificate, with what the checks made of it')
    .action((heatNumber: string) => {
      const heat = context.workspace().materials.requireHeat(heatNumber);
      printHeading(out, `Heat ${heat.heatNumber} from ${heat.supplier}`);
      out.line(
        keyValues([
          ['specification', heat.specification],
          ['certificate', `${heat.certificateNumber} dated ${heat.certificateDate.toString()}`],
          ['thickness', heat.thickness.toFraction()],
          ['normalised', heat.normalised ? 'yes' : 'no'],
          ['curve', certifiedCurve(heat)],
          ['tensile', heat.mechanical.tensileKsi.toString()],
          ['yield', heat.mechanical.yieldKsi.toString()],
          ['elongation', heat.mechanical.elongationPercent.toString()],
          ['carbon equivalent', carbonEquivalent(heat.chemistry).toString()],
        ]),
      );
      out.line('');
      printFindings(out, verifyCertificate(heat));
    });

  command
    .command('charts')
    .description('the furnace charts on file')
    .option('--vessel <tag>', 'narrow to one vessel')
    .action((options: { vessel?: string }) => {
      const charts = context.workspace().materials.charts(options.vessel);
      printHeading(out, 'Heat treatment charts');
      printTable(
        out,
        [...charts],
        [
          { header: 'chart', value: (row) => row.id },
          { header: 'vessel', value: (row) => row.vessel },
          { header: 'furnace', value: (row) => row.furnace },
          { header: 'run', value: (row) => row.runOn.toString() },
          { header: 'joints', value: (row) => row.joints.join(', ') },
          { header: 'findings', align: 'right', value: (row) => String(reviewChart(row).length) },
        ],
        'no charts on file',
      );
    });

  return command;
}
