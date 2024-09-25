import { Command } from 'commander';

import { parseProcess } from '../../codes/process.js';
import { ValidationError } from '../../core/errors.js';
import { DocumentNumber } from '../../core/identifier.js';
import { PlainDate } from '../../core/plainDate.js';
import { pluralise } from '../../core/text.js';
import { Length } from '../../core/units.js';
import {
  depositInJoint,
  jointsUsingLot,
  processesOnJoint,
  reviewEntry,
  weldersOnJoint,
  type LogRole,
  type WeldLogEntry,
} from '../../fabrication/weldLog.js';
import type { Context } from '../context.js';
import type { Output } from '../output.js';
import { printFindings, printHeading, printTable } from '../output.js';

const ROLES: readonly LogRole[] = ['root', 'fill', 'cap', 'repair', 'tack'];

function readRole(value: string): LogRole {
  const found = ROLES.find((role) => role === value);
  if (found === undefined) {
    throw new ValidationError('role', `not a weld log role: ${value}`, { value, known: ROLES });
  }
  return found;
}

interface LogOptions {
  joint: string;
  welder: string;
  process: string;
  procedure: string;
  on: string;
  role: string;
  consumable: string;
  lot: string;
  deposit: string;
  foreman: string;
}

/**
 * The weld log from the command line, and the two questions asked of it.
 *
 * Forward tracing is the one that matters on a bad morning. A supplier issues
 * a recall on a lot of electrodes and somebody has to say, today, which joints
 * on which vessels have that lot in them. Everything else here exists so that
 * question can be answered without reading a lever arch file.
 */
export function weldCommand(out: Output, context: Context): Command {
  const command = new Command('weld').description('the weld log');

  command
    .command('log <id>')
    .description('record a run of weld')
    .requiredOption('--joint <id>', 'the joint on the map')
    .requiredOption('--welder <stencil>', 'who welded it')
    .requiredOption('--process <code>', 'the process used')
    .requiredOption('--procedure <number>', 'the procedure followed')
    .requiredOption('--on <date>', 'the day it was welded')
    .option('--role <kind>', 'root, fill, cap, repair or tack', 'fill')
    .requiredOption('--consumable <code>', 'the stock code of the consumable')
    .requiredOption('--lot <number>', 'the lot or heat number of the tin or reel')
    .requiredOption('--deposit <length>', 'weld metal laid in this run')
    .requiredOption('--foreman <name>', 'who signed for it')
    .action((id: string, options: LogOptions) => {
      const entry: WeldLogEntry = {
        id,
        joint: options.joint,
        stencil: options.welder,
        process: parseProcess(options.process),
        procedure: DocumentNumber.parse(options.procedure),
        weldedOn: PlainDate.parse(options.on),
        role: readRole(options.role),
        consumable: options.consumable,
        consumableLot: options.lot,
        depositThickness: Length.parse(options.deposit),
        foreman: options.foreman,
      };
      const workspace = context.workspace();
      workspace.fabrication.logWeld(entry, context.actor);
      const findings = reviewEntry(entry, workspace.fabrication.joint(entry.joint));
      out.line(`${entry.id} logged against ${entry.joint}`);
      if (findings.length > 0) {
        out.line('');
        printFindings(out, findings);
      }
    });

  command
    .command('void <id>')
    .description('take an entry out of the live log without deleting it')
    .requiredOption('--reason <text>', 'why it should not count')
    .action((id: string, options: { reason: string }) => {
      context.workspace().fabrication.voidEntry(id, options.reason, context.actor);
      out.line(`${id} voided`);
    });

  command
    .command('list')
    .description('the live log')
    .option('--joint <id>', 'narrow to one joint')
    .option('--voided', 'show the voided entries instead', false)
    .action((options: { joint?: string; voided: boolean }) => {
      const fabrication = context.workspace().fabrication;
      if (options.voided) {
        printHeading(out, 'Voided entries');
        printTable(
          out,
          [...fabrication.voidedEntries()],
          [
            { header: 'entry', value: (row) => row.entry.id },
            { header: 'joint', value: (row) => row.entry.joint },
            { header: 'reason', value: (row) => row.reason },
          ],
          'nothing voided',
        );
        return;
      }
      const entries = fabrication.entries(options.joint);
      printHeading(out, options.joint === undefined ? 'Weld log' : `Weld log for ${options.joint}`);
      printTable(
        out,
        [...entries],
        [
          { header: 'entry', value: (row) => row.id },
          { header: 'joint', value: (row) => row.joint },
          { header: 'welder', value: (row) => row.stencil },
          { header: 'proc', value: (row) => row.process },
          { header: 'role', value: (row) => row.role },
          { header: 'welded', value: (row) => row.weldedOn.toString() },
          { header: 'consumable', value: (row) => `${row.consumable} ${row.consumableLot}` },
          { header: 'deposit', align: 'right', value: (row) => row.depositThickness.toFraction() },
        ],
        'nothing logged',
      );
      if (options.joint !== undefined && entries.length > 0) {
        const deposit = depositInJoint(entries, options.joint);
        out.line('');
        out.line(
          `${deposit?.toFraction() ?? '0'} of deposit by ${pluralise(weldersOnJoint(entries, options.joint).length, 'welder')} using ${processesOnJoint(entries, options.joint).join(' and ')}`,
        );
      }
    });

  command
    .command('trace <consumable> <lot>')
    .description('every joint a consumable lot went into')
    .action((consumable: string, lot: string) => {
      const joints = jointsUsingLot(context.workspace().fabrication.entries(), consumable, lot);
      if (joints.length === 0) {
        out.line(`no joint carries ${consumable} lot ${lot}`);
        return;
      }
      out.line(`${consumable} lot ${lot} is in ${pluralise(joints.length, 'joint')}:`);
      for (const joint of joints) {
        out.line(`  ${joint}`);
      }
    });

  return command;
}
