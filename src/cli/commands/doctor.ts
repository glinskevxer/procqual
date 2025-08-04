import { Command } from 'commander';

import { pluralise } from '../../core/text.js';
import { verifyChain } from '../../store/journal.js';
import { LATEST_SCHEMA } from '../../store/migrations.js';
import { readLock } from '../../store/lock.js';
import { coverFindings } from '../../reporting/technicianRegister.js';
import { shopExceptions } from '../../reporting/exceptions.js';
import type { Context } from '../context.js';
import { onDate } from '../files.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

/**
 * Everything the program can check about itself, in one command.
 *
 * This is the one to run on a Monday morning and after anything unusual: a
 * power cut, a restore from backup, a version upgrade. Each line is a check
 * somebody would otherwise have to know to run, and the point of gathering
 * them is that nobody knows to run any of them until something has already
 * gone wrong.
 *
 * It reports rather than fixes. A workspace with an altered journal or a lock
 * left behind by a dead process needs a person, and a command that quietly put
 * either of those right would be the last thing anybody heard about it.
 */

type Verdict = 'ok' | 'look' | 'stop';

interface Check {
  readonly name: string;
  readonly verdict: Verdict;
  readonly detail: string;
}

export function doctorCommand(out: Output, context: Context): Command {
  return new Command('doctor')
    .description('check the workspace and everything the program can tell about itself')
    .option('--on <date>', 'read the dated checks as they stood on this day')
    .action((options: { on?: string }) => {
      const workspace = context.workspace();
      const on = onDate(context, options.on);
      const checks: Check[] = [];

      const entries = workspace.journal.read();
      const problems = verifyChain(entries);
      checks.push({
        name: 'journal',
        verdict: problems.length === 0 ? 'ok' : 'stop',
        detail:
          problems.length === 0
            ? `${pluralise(entries.length, 'entry', 'entries')}, chain intact`
            : `altered at entry ${String(problems[0]?.sequence ?? 0)}`,
      });

      checks.push({
        name: 'schema',
        verdict: workspace.marker.schemaVersion === LATEST_SCHEMA ? 'ok' : 'look',
        detail: `${String(workspace.marker.schemaVersion)} of ${String(LATEST_SCHEMA)}`,
      });

      const holder = workspace.isInMemory() ? undefined : readLock(workspace.directory);
      checks.push({
        name: 'lock',
        verdict: holder === undefined ? 'ok' : 'look',
        detail:
          holder === undefined
            ? 'nobody is writing'
            : `held by ${holder.actor} on ${holder.host} since ${holder.takenAt}`,
      });

      checks.push({
        name: 'policy',
        verdict: 'ok',
        detail: `continuity ${String(workspace.policy.continuityMonths)} months, repair window ${String(workspace.policy.repairWindowDays)} days`,
      });

      const cover = coverFindings(workspace, on);
      const missing = cover.filter((finding) => finding.severity === 'blocking');
      checks.push({
        name: 'examination cover',
        verdict: missing.length === 0 ? 'ok' : 'stop',
        detail:
          missing.length === 0
            ? 'every method the work needs is held by somebody current'
            : missing.map((finding) => finding.message).join('; '),
      });

      const exceptions = shopExceptions(workspace, on);
      checks.push({
        name: 'outstanding',
        verdict: exceptions.blocking > 0 ? 'look' : 'ok',
        detail:
          exceptions.total === 0
            ? 'nothing outstanding'
            : `${pluralise(exceptions.total, 'item')}, ${String(exceptions.blocking)} blocking`,
      });

      printHeading(out, `Doctor at ${on.toString()}`);
      printTable(out, checks, [
        { header: 'check', value: (row) => row.name },
        { header: 'verdict', value: (row) => row.verdict },
        { header: 'detail', value: (row) => row.detail },
      ]);

      const stop = checks.filter((check) => check.verdict === 'stop');
      const look = checks.filter((check) => check.verdict === 'look');
      out.line('');
      if (stop.length > 0) {
        out.line(`${pluralise(stop.length, 'check')} needs somebody now`);
        return;
      }
      out.line(
        look.length === 0
          ? 'everything the program can check is in order'
          : `${pluralise(look.length, 'check')} worth a look`,
      );
    });
}
