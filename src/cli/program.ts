import { Command } from 'commander';

import { ArcError } from '../core/errors.js';
import { VERSION } from '../version.js';
import { describeExit, exitCodeFor, EXIT_INTERNAL, EXIT_OK, EXIT_USAGE } from './exitCodes.js';
import { assignCommand } from './commands/assign.js';
import { codesCommand } from './commands/codes.js';
import { doctorCommand } from './commands/doctor.js';
import { exportCommand } from './commands/exportCommand.js';
import { importCommand } from './commands/importCommand.js';
import { jointsCommand } from './commands/joints.js';
import { materialsCommand } from './commands/materials.js';
import { ndeCommand } from './commands/nde.js';
import { policyCommand } from './commands/policy.js';
import { pqrCommand } from './commands/pqr.js';
import { printCommand } from './commands/print.js';
import { proceduresCommand } from './commands/procedures.js';
import { reportCommand } from './commands/report.js';
import { statusCommand } from './commands/status.js';
import { storeCommand } from './commands/store.js';
import { vesselsCommand } from './commands/vessels.js';
import { weldCommand } from './commands/weld.js';
import { weldersCommand } from './commands/welders.js';
import { workspaceCommand } from './commands/workspace.js';
import type { Context } from './context.js';
import { createContext } from './context.js';
import type { Output } from './output.js';

export { VERSION } from '../version.js';

/**
 * Builds the whole command tree against an injected output.
 *
 * Nothing in here writes to the process streams itself and nothing calls
 * `process.exit`, so the same tree is what the tests drive.
 */
export function buildProgram(out: Output, context: Context = createContext()): Command {
  const program = new Command('arc')
    .description('weld procedure qualification and joint traceability')
    .version(VERSION)
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      // Commander writes help and its own errors straight to the process
      // streams otherwise, which puts half the output somewhere the tests
      // cannot see and the other half through the recorder.
      writeOut: (text) => {
        out.line(text.replace(/\n$/, ''));
      },
      writeErr: (text) => {
        out.error(text.replace(/\n$/, ''));
      },
    });

  program.addCommand(assignCommand(out, context));
  program.addCommand(codesCommand(out));
  program.addCommand(doctorCommand(out, context));
  program.addCommand(exportCommand(out, context));
  program.addCommand(importCommand(out, context));
  program.addCommand(jointsCommand(out, context));
  program.addCommand(materialsCommand(out, context));
  program.addCommand(ndeCommand(out, context));
  program.addCommand(policyCommand(out, context));
  program.addCommand(pqrCommand(out, context));
  program.addCommand(printCommand(out, context));
  program.addCommand(proceduresCommand(out, context));
  program.addCommand(reportCommand(out, context));
  program.addCommand(statusCommand(out, context));
  program.addCommand(storeCommand(out, context));
  program.addCommand(vesselsCommand(out, context));
  program.addCommand(weldCommand(out, context));
  program.addCommand(weldersCommand(out, context));
  program.addCommand(workspaceCommand(out, context));
  routeOutput(program, out);
  return program;
}

/**
 * Point every command in the tree at the injected output.
 *
 * Commander only passes `configureOutput` down to subcommands it built itself
 * with `.command()`. A command built separately and handed over with
 * `addCommand` keeps its own, so its usage errors go straight to the process
 * streams and the tests never see them.
 */
function routeOutput(command: Command, out: Output): void {
  command.configureOutput({
    writeOut: (text) => {
      out.line(text.replace(/\n$/, ''));
    },
    writeErr: (text) => {
      out.error(text.replace(/\n$/, ''));
    },
  });
  for (const child of command.commands) {
    child.exitOverride();
    routeOutput(child, out);
  }
}

export interface RunResult {
  readonly code: number;
}

export async function run(
  argv: readonly string[],
  out: Output,
  context?: Context,
): Promise<RunResult> {
  const resolved = context ?? createContext();
  const program = buildProgram(out, resolved);
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return { code: EXIT_OK };
  } catch (error) {
    if (error instanceof ArcError) {
      const code = exitCodeFor(error);
      out.error(`${error.code}: ${error.message}`);
      out.error(`arc: ${describeExit(code)}`);
      return { code };
    }
    if (isCommanderExit(error)) {
      return { code: error.exitCode === 0 ? EXIT_OK : EXIT_USAGE };
    }
    out.error(error instanceof Error ? error.message : String(error));
    return { code: EXIT_INTERNAL };
  } finally {
    // The lock is only ever held from the first write of a command to the end
    // of that command, so it goes back whether the command worked or not.
    resolved.release();
  }
}

interface CommanderExit {
  readonly code: string;
  readonly exitCode: number;
}

function isCommanderExit(error: unknown): error is CommanderExit {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    typeof (error as { exitCode: unknown }).exitCode === 'number'
  );
}
