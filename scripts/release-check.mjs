// Everything that has to be true before a version is tagged.
//
// Each of these has caught something at least once somewhere, and none of them
// is caught by the tests: a build that passes every suite can still ship a
// dist that was compiled two commits ago, a version in package.json that
// nobody bumped, or a command reference describing a flag that no longer
// exists.
//
// It runs in CI on every push, not only on a release, because a check that
// only runs on release day is a check that fails on release day.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const notes = [];

function check(label, work) {
  try {
    const message = work();
    notes.push(`${label}: ${message ?? 'ok'}`);
  } catch (error) {
    problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function insist(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));

check('version', () => {
  insist(
    /^\d+\.\d+\.\d+$/.test(manifest.version),
    `${manifest.version} is not a plain three part version`,
  );
  return manifest.version;
});

check('the version the program reports', () => {
  const source = readFileSync('src/version.ts', 'utf8');
  const match = /export const VERSION = '([^']+)'/.exec(source);
  insist(match !== null, 'src/version.ts does not declare a VERSION');
  insist(
    match[1] === manifest.version,
    `src/version.ts says ${match[1]} and package.json says ${manifest.version}`,
  );
  return match[1];
});

check('the changelog names this version', () => {
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  insist(
    changelog.includes(`## ${manifest.version}`),
    `CHANGELOG.md has no entry for ${manifest.version}`,
  );
  return `## ${manifest.version}`;
});

check('the entry point exists in the build', () => {
  const entry = manifest.bin?.arc;
  insist(typeof entry === 'string', 'package.json declares no arc binary');
  const path = entry.replace(/^\.\//, '');
  insist(existsSync(path), `${path} is not built, run npm run build`);
  return path;
});

check('the build is newer than the sources', () => {
  const entry = statSync('dist/cli/main.js').mtimeMs;
  const newest = newestSource('src');
  insist(entry >= newest, 'dist is older than src, run npm run build');
  return 'up to date';
});

check('the command reference matches the command tree', () => {
  execFileSync(process.execPath, ['scripts/reference.mjs', '--check'], { stdio: 'pipe' });
  return 'up to date';
});

check('every advisory is accounted for', () => {
  execFileSync(process.execPath, ['scripts/audit-dependencies.mjs'], { stdio: 'pipe' });
  return 'accounted for';
});

check('the working tree is clean', () => {
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  insist(status === '', `there are uncommitted changes:\n${status}`);
  return 'clean';
});

function newestSource(directory) {
  let newest = 0;
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    newest = Math.max(newest, item.isDirectory() ? newestSource(path) : statSync(path).mtimeMs);
  }
  return newest;
}

for (const note of notes) {
  process.stdout.write(`release: ${note}\n`);
}
for (const problem of problems) {
  process.stderr.write(`release: ${problem}\n`);
}
process.exitCode = problems.length > 0 ? 1 : 0;
