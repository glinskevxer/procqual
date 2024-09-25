import { Command } from 'commander';

import { ArcError } from '../core/errors.js';
import { codesCommand } from './commands/codes.js';
import { jointsCommand } from './commands/joints.js';
import { weldCommand } from './commands/weld.js';
import { weldersCommand } from './commands/welders.js';
import type { Context } from './context.js';
import { createContext } from './context.js';
import type { Output } from './output.js';

export const VERSION = '0.1.0';

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

  program.addCommand(codesCommand(out));
  program.addCommand(jointsCommand(out, context));
  program.addCommand(weldCommand(out, context));
  program.addCommand(weldersCommand(out, context));
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
  const program = buildProgram(out, context);
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return { code: 0 };
  } catch (error) {
    if (error instanceof ArcError) {
      out.error(`${error.code}: ${error.message}`);
      return { code: 2 };
    }
    if (isCommanderExit(error)) {
      return { code: error.exitCode };
    }
    out.error(error instanceof Error ? error.message : String(error));
    return { code: 1 };
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
