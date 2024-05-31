import { ConsoleOutput } from './output.js';
import { run } from './program.js';

const out = new ConsoleOutput();

run(process.argv.slice(2), out)
  .then((result) => {
    process.exitCode = result.code;
  })
  .catch((error: unknown) => {
    out.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
