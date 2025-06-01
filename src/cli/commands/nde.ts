import { Command } from 'commander';

import { deficiency, ValidationError } from '../../core/errors.js';
import { PlainDate } from '../../core/plainDate.js';
import { pluralise } from '../../core/text.js';
import { Length } from '../../core/units.js';
import { judgeExamination } from '../../nde/acceptance.js';
import {
  coverageFindings,
  readAllIncrements,
  shortFilms,
  spotsRequired,
  type Spot,
} from '../../nde/coverage.js';
import type { Examination, Indication } from '../../nde/examination.js';
import { reviewExamination } from '../../nde/examination.js';
import { isComplete, reviewRepair, type Repair } from '../../nde/repair.js';
import { rateFindings, suspended } from '../../nde/repairRate.js';
import { repairRates } from '../../reporting/repairRateReport.js';
import { coverFindings, methodsNeeded, register } from '../../reporting/technicianRegister.js';
import { describeDemand, requiredExaminations } from '../../nde/requirement.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import {
  parseCertificationLevel,
  parseExaminationMethod,
  parseExtent,
  parseIndicationType,
} from '../parse.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

function readIndication(text: string): Indication {
  const parts = text.split(':');
  if (parts.length < 3) {
    throw new ValidationError(
      'indication',
      `expected type:size:position, as slag:1/8:12: ${text}`,
      { text },
    );
  }
  return {
    type: parseIndicationType(parts[0] ?? ''),
    size: Length.parse(parts[1] ?? '0'),
    fromDatum: Length.parse(parts[2] ?? '0'),
  };
}

/**
 * Examinations and repairs from the command line.
 *
 * `file` grades the report as it goes in rather than afterwards. A technician
 * standing at a terminal with the film still wet is the only person who can
 * put right an indication recorded against the wrong joint, and telling them
 * about it a week later in a report is no use to anybody.
 */
export function ndeCommand(out: Output, context: Context): Command {
  const command = new Command('nde').description('examinations and repairs');

  command
    .command('technician <name>')
    .description('put an examination technician on the register')
    .requiredOption('--level <roman>', 'I, II or III')
    .requiredOption('--methods <list>', 'comma separated, as RT,UT')
    .requiredOption('--until <date>', 'the day the certification runs out')
    .action((name: string, options: { level: string; methods: string; until: string }) => {
      context.workspace().examinations.registerTechnician(
        {
          name,
          level: parseCertificationLevel(options.level),
          methods: options.methods.split(',').map((value) => parseExaminationMethod(value)),
          certifiedUntil: PlainDate.parse(options.until),
        },
        context.actor,
      );
      out.line(`${name} registered`);
    });

  command
    .command('technicians')
    .description('who may interpret what, and who is about to run out')
    .option('--on <date>', 'read it as it stood on this day')
    .action((options: { on?: string }) => {
      const workspace = context.workspace();
      const on = onDate(context, options.on);
      printHeading(out, `Examination technicians at ${on.toString()}`);
      printTable(
        out,
        [...register(workspace, on)],
        [
          { header: 'name', value: (row) => row.technician.name },
          { header: 'level', value: (row) => row.technician.level },
          { header: 'until', value: (row) => row.technician.certifiedUntil.toString() },
          { header: 'days', align: 'right', value: (row) => String(row.daysRemaining) },
          { header: 'may interpret', value: (row) => row.interprets.join(', ') || 'nothing' },
        ],
        'nobody on the technician register',
      );
      out.line('');
      out.line(`the work on the books needs ${methodsNeeded(workspace).join(', ')}`);
      out.line('');
      printFindings(out, coverFindings(workspace, on));
    });

  command
    .command('file <id>')
    .description('file an examination report')
    .requiredOption('--joint <id>', 'the joint examined')
    .requiredOption('--method <code>', 'RT, UT, MT, PT or VT')
    .requiredOption('--technician <name>', 'who read it')
    .requiredOption('--on <date>', 'the day it was taken')
    .requiredOption('--report <number>', 'the laboratory report number')
    .requiredOption('--coverage <length>', 'length of weld covered')
    .option('--extent <kind>', 'full, spot or partial', 'full')
    .option('--after-pwht', 'taken after the heat treatment', false)
    .option('--indication <spec...>', 'type:size:position, repeatable')
    .action(
      (
        id: string,
        options: {
          joint: string;
          method: string;
          technician: string;
          on: string;
          report: string;
          coverage: string;
          extent: string;
          afterPwht: boolean;
          indication?: string[];
        },
      ) => {
        const workspace = context.workspace();
        const technician = workspace.examinations.technician(options.technician);
        if (technician === undefined) {
          throw new ValidationError(
            'technician',
            `${options.technician} is not on the technician register`,
            { name: options.technician },
          );
        }
        const joint = workspace.fabrication.requireJoint(options.joint);
        const examination: Examination = {
          id,
          joint: options.joint,
          method: parseExaminationMethod(options.method),
          extent: parseExtent(options.extent),
          performedOn: PlainDate.parse(options.on),
          technician,
          reportNumber: options.report,
          coverage: Length.parse(options.coverage),
          indications: (options.indication ?? []).map((text) => readIndication(text)),
          afterHeatTreatment: options.afterPwht,
        };
        workspace.examinations.file(examination, context.actor);
        const result = judgeExamination(examination, joint.thickness);
        out.line(
          `${id} filed against ${options.joint}: ${result.accepted ? 'accepted' : 'rejected'}`,
        );
        const findings = [...reviewExamination(examination), ...result.findings];
        if (findings.length > 0) {
          out.line('');
          printFindings(out, findings);
        }
      },
    );

  command
    .command('list')
    .description('the examinations on file')
    .option('--joint <id>', 'narrow to one joint')
    .action((options: { joint?: string }) => {
      const workspace = context.workspace();
      const examinations = workspace.examinations.examinations(options.joint);
      printHeading(out, 'Examinations');
      printTable(
        out,
        [...examinations],
        [
          { header: 'report', value: (row) => row.id },
          { header: 'joint', value: (row) => row.joint },
          { header: 'method', value: (row) => row.method },
          { header: 'extent', value: (row) => row.extent },
          { header: 'taken', value: (row) => row.performedOn.toString() },
          { header: 'by', value: (row) => `${row.technician.name} (${row.technician.level})` },
          { header: 'indications', align: 'right', value: (row) => String(row.indications.length) },
          {
            header: 'verdict',
            value: (row) => {
              const joint = workspace.fabrication.joint(row.joint);
              if (joint === undefined) {
                return 'no joint';
              }
              return judgeExamination(row, joint.thickness).accepted ? 'accept' : 'reject';
            },
          },
        ],
        'nothing filed',
      );
    });

  command
    .command('required <joint>')
    .description('what the code asks for on a joint')
    .option('--lethal', 'the vessel is in lethal service', false)
    .action((jointId: string, options: { lethal: boolean }) => {
      const joint = context.workspace().fabrication.requireJoint(jointId);
      const demands = requiredExaminations({ joint, lethalService: options.lethal, repair: false });
      printHeading(out, `Examinations required on ${joint.id}`);
      for (const demand of demands) {
        out.line(describeDemand(demand));
      }
    });

  command
    .command('coverage <joint>')
    .description('spot radiography, increment by increment')
    .action((jointId: string) => {
      const workspace = context.workspace();
      const joint = workspace.fabrication.requireJoint(jointId);
      const examinations = workspace.examinations
        .examinations(jointId)
        .filter((item) => item.method === 'RT');
      const spots: Spot[] = examinations.map((item, index) => ({
        id: item.id,
        examination: item.id,
        increment: index + 1,
        filmLength: item.coverage,
        accepted: judgeExamination(item, joint.thickness).accepted,
        additional: false,
      }));
      const readings = readAllIncrements(joint.lengthOfWeld, spots);
      printHeading(out, `Spot radiography on ${joint.id}`);
      out.line(
        `${joint.lengthOfWeld.toFraction()} of weld needs ${pluralise(spotsRequired(joint.lengthOfWeld), 'spot')}`,
      );
      out.line('');
      printTable(
        out,
        [...readings],
        [
          { header: 'increment', align: 'right', value: (row) => String(row.increment) },
          { header: 'state', value: (row) => row.state },
          { header: 'films', align: 'right', value: (row) => String(row.spots.length) },
          { header: 'reason', value: (row) => row.reason },
        ],
      );
      const short = shortFilms(spots);
      const findings = [...coverageFindings(readings)];
      for (const film of short) {
        findings.push(
          deficiency(
            'coverage.short_film',
            `${film.id} covers only ${film.filmLength.toFraction()}`,
            {
              subject: film.id,
            },
          ),
        );
      }
      out.line('');
      printFindings(out, findings);
    });

  command
    .command('repair <id>')
    .description('raise a repair against a rejected examination')
    .requiredOption('--joint <id>', 'the joint')
    .requiredOption('--from <report>', 'the examination that rejected it')
    .requiredOption('--defect <type>', 'what was found')
    .requiredOption('--length <length>', 'length of the excavation')
    .requiredOption('--depth <length>', 'depth of the excavation')
    .requiredOption('--on <date>', 'the day it was gouged out')
    .requiredOption('--welder <stencil>', 'who is rewelding it')
    .option('--attempt <number>', 'which go this is at the same place', '1')
    .option('--approval <reference>', 'engineering approval, where one is needed')
    .action(
      (
        id: string,
        options: {
          joint: string;
          from: string;
          defect: string;
          length: string;
          depth: string;
          on: string;
          welder: string;
          attempt: string;
          approval?: string;
        },
      ) => {
        const workspace = context.workspace();
        const joint = workspace.fabrication.requireJoint(options.joint);
        const examination = workspace.examinations.requireExamination(options.from);
        const repair: Repair = {
          id,
          joint: options.joint,
          raisedBy: options.from,
          method: examination.method,
          defect: readIndication(`${options.defect}:0.001:0`).type,
          attempt: Number(options.attempt),
          excavationLength: Length.parse(options.length),
          excavationDepth: Length.parse(options.depth),
          jointThickness: joint.thickness,
          excavatedOn: PlainDate.parse(options.on),
          rewelderStencil: options.welder,
          engineeringApproval: options.approval,
        };
        workspace.examinations.raiseRepair(repair, context.actor);
        out.line(`${id} raised against ${options.joint}`);
        printFindings(out, reviewRepair(repair, undefined));
      },
    );

  command
    .command('rates')
    .description('the repair rate for every welder and process')
    .option('--on <date>', 'read it as it stood on this day')
    .option('--suspended', 'only the ones over the suspend level', false)
    .action((options: { on?: string; suspended: boolean }) => {
      const workspace = context.workspace();
      const on = onDate(context, options.on);
      const readings = repairRates(workspace, on);
      const shown = options.suspended ? suspended(readings) : readings;
      printHeading(out, `Repair rate at ${on.toString()}`);
      printTable(
        out,
        [...shown],
        [
          { header: 'stencil', value: (row) => row.stencil },
          { header: 'process', value: (row) => row.process },
          { header: 'examined', align: 'right', value: (row) => String(row.examined) },
          { header: 'repaired', align: 'right', value: (row) => String(row.repaired) },
          { header: 'rate', align: 'right', value: (row) => row.rate.toString() },
          { header: 'state', value: (row) => row.state },
        ],
        options.suspended ? 'nobody is over the suspend level' : 'nothing examined in the window',
      );
      const findings = shown.flatMap((reading) => rateFindings(reading));
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('repairs')
    .description('the repairs raised, open ones first')
    .option('--joint <id>', 'narrow to one joint')
    .action((options: { joint?: string }) => {
      const repairs = context.workspace().examinations.repairs(options.joint);
      printHeading(out, 'Repairs');
      printTable(
        out,
        [...repairs],
        [
          { header: 'repair', value: (row) => row.id },
          { header: 'joint', value: (row) => row.joint },
          { header: 'defect', value: (row) => row.defect },
          { header: 'attempt', align: 'right', value: (row) => String(row.attempt) },
          { header: 'excavated', value: (row) => row.excavatedOn.toString() },
          { header: 'rewelded', value: (row) => row.reweldedOn?.toString() ?? '' },
          { header: 'state', value: (row) => (isComplete(row) ? 'closed' : 'open') },
        ],
        'no repairs raised',
      );
      const open = repairs.filter((item) => !isComplete(item)).length;
      if (open > 0) {
        out.line('');
        out.line(`${pluralise(open, 'repair')} still open`);
      }
    });

  return command;
}
