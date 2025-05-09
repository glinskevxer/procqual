// Runs the built image the way a shop floor terminal would.
//
// The checks are here rather than inline in the workflow because a shell
// pipeline in yaml swallows its own exit status in ways that are hard to see,
// and because somebody with docker on their laptop should be able to run
// exactly what CI runs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image = process.argv[2] ?? 'arc:ci';
const failures = [];

function arc(args, mounts = []) {
  return execFileSync('docker', ['run', '--rm', ...mounts, image, ...args], {
    encoding: 'utf8',
  });
}

// Anything reading or writing a mounted workspace has to run as the user who
// owns the directory on the host. The image carries an unprivileged user of
// its own, and a bind mount does not translate uids, so leaving it to run as
// that user means the first write into the mount comes back EACCES on any
// host whose uid is not the one baked into the base image. A shop mounting a
// share hits this on the first command, so the check has to run the way they
// have to run it.
function mountedAs(directory) {
  const uid = process.getuid === undefined ? 0 : process.getuid();
  const gid = process.getgid === undefined ? 0 : process.getgid();
  return ['--user', `${uid}:${gid}`, '-v', `${directory}:/workspace`];
}

function expectContains(label, output, wanted) {
  if (output.includes(wanted)) {
    process.stdout.write(`image: ${label} ok\n`);
    return;
  }
  failures.push(`${label}: expected output to contain ${JSON.stringify(wanted)}`);
  process.stderr.write(output);
}

expectContains('version', arc(['--version']), '0.');
expectContains('help', arc(['--help']), 'weld procedure qualification');
expectContains('p numbers', arc(['codes', 'p-numbers']), 'austenitic stainless');
expectContains(
  'combined positions',
  arc(['codes', 'combine', '2G', '5G']),
  'flat, horizontal, vertical, overhead',
);

const workspace = mkdtempSync(join(tmpdir(), 'arc-image-'));
try {
  arc(['workspace', 'init', '/workspace', '--shop', 'ci'], mountedAs(workspace));
  if (existsSync(join(workspace, 'arc.json'))) {
    process.stdout.write('image: writes into a mounted workspace ok\n');
  } else {
    failures.push('the workspace marker was not written into the mount');
  }

  const status = arc(['workspace', 'status'], mountedAs(workspace));
  expectContains('reads the mounted workspace back', status, 'shop:');
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

let refused = false;
try {
  arc(['codes', 'f-numbers', '--process', 'EBW']);
} catch (error) {
  refused = typeof error.status === 'number' && error.status !== 0;
}
if (refused) {
  process.stdout.write('image: bad input refused ok\n');
} else {
  failures.push('a bad process should exit non zero inside the image');
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`image: ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('image: all checks passed\n');
}
