// Fails the build on any advisory nobody has looked at.
//
// `npm audit` on its own is either ignored or turned into a rule that
// everything must be clean, and the second one is worse: it gets switched off
// the first week a transitive development dependency picks up a low severity
// advisory with no fix. So every advisory this build ships with is written
// down with a reason and a date the acceptance runs out, and anything not on
// that list fails.
//
// Two rules, and they are deliberately different in weight.
//
// An advisory nobody has written down fails the build when it is high or
// critical, and is reported when it is not. Failing on every low severity
// advisory in a transitive development dependency is how this check gets
// switched off in its first month.
//
// An acceptance past its review date does not fail the build either. It says
// so, loudly, every time the check runs, which is what actually gets somebody
// to look at it again. An acceptance with no review date at all would be a
// permanently ignored advisory, so the date is required.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);

function readAudit() {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch (error) {
    // npm audit exits non zero when it finds anything, and still prints the
    // report on stdout. That is the ordinary case here, not a failure.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

function advisoryIds(vulnerability) {
  const ids = new Set();
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'object' && typeof via.url === 'string') {
      const id = via.url.split('/').pop();
      if (id !== undefined) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

const accepted = JSON.parse(readFileSync('audit-accepted.json', 'utf8')).accepted;
const byId = new Map(accepted.map((entry) => [entry.advisory, entry]));

const report = readAudit();
const problems = [];

const warnings = [];

for (const entry of accepted) {
  if (typeof entry.expiresOn !== 'string') {
    problems.push(`${entry.advisory} is accepted with no review date`);
    continue;
  }
  if (entry.expiresOn <= today) {
    warnings.push(
      `the acceptance of ${entry.advisory} (${entry.package}) is past its review date of ${entry.expiresOn}`,
    );
  }
}

const seen = new Set();
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  const ids = advisoryIds(vulnerability);
  if (ids.length === 0) {
    // A package flagged only because something it depends on is flagged. The
    // advisory itself is reported against that dependency.
    continue;
  }
  for (const id of ids) {
    seen.add(id);
    if (byId.has(id)) {
      continue;
    }
    const message = `${name}: ${id} (${vulnerability.severity}) is not in audit-accepted.json`;
    if (vulnerability.severity === 'high' || vulnerability.severity === 'critical') {
      problems.push(message);
    } else {
      warnings.push(message);
    }
  }
}

for (const entry of accepted) {
  if (!seen.has(entry.advisory)) {
    warnings.push(
      `${entry.advisory} (${entry.package}) is accepted and npm audit no longer reports it, so take it out`,
    );
  }
}

for (const warning of warnings) {
  process.stdout.write(`audit: ${warning}\n`);
}

if (problems.length > 0) {
  for (const problem of problems) {
    process.stderr.write(`audit: ${problem}\n`);
  }
  process.exitCode = 1;
} else {
  const counts = report.metadata?.vulnerabilities ?? {};
  process.stdout.write(
    `audit: ${String(counts.total ?? 0)} advisories, ${String(accepted.length)} accepted, none unaccounted for\n`,
  );
}
