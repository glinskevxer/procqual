// Runs the built command line the way a user would, against the compiled
// output rather than the sources. The unit suites drive the command tree
// directly with an injected output, so they never find out that the entry
// point does not resolve or that a subpath import lost its extension.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const entry = resolve('dist/cli/main.js');

function fail(message) {
  process.stderr.write(`smoke: ${message}\n`);
  process.exitCode = 1;
}

function arc(...args) {
  return execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
}

function expectContains(label, output, wanted) {
  if (!output.includes(wanted)) {
    fail(`${label}: expected output to contain ${JSON.stringify(wanted)}`);
    process.stderr.write(output);
    return false;
  }
  process.stdout.write(`smoke: ${label} ok\n`);
  return true;
}

if (!existsSync(entry)) {
  fail(`no build at ${entry}, run npm run build first`);
  process.exit(1);
}

expectContains('version', arc('--version'), '0.1.0');
expectContains('help', arc('--help'), 'weld procedure qualification');
expectContains('p numbers', arc('codes', 'p-numbers'), 'austenitic stainless');
expectContains('f numbers', arc('codes', 'f-numbers'), 'low hydrogen electrodes');
expectContains('positions', arc('codes', 'positions'), '6G');
expectContains(
  'combine',
  arc('codes', 'combine', '2G', '5G'),
  'flat, horizontal, vertical, overhead',
);
expectContains('filler', arc('codes', 'filler', 'SFA-5.1', 'E7018'), 'F-No 4');

let refused = false;
try {
  arc('codes', 'f-numbers', '--process', 'EBW');
} catch (error) {
  refused = typeof error.status === 'number' && error.status !== 0;
}
if (!refused) {
  fail('a bad process should exit non zero');
} else {
  process.stdout.write('smoke: bad process refused ok\n');
}

if (process.exitCode === undefined || process.exitCode === 0) {
  process.stdout.write('smoke: all checks passed\n');
}
