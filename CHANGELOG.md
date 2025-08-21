# Changelog

## 1.0.0

The first version run against a real job from the first plate to the data
package. Nothing in the rules changed for it. What changed is that a shop has
now used it end to end, and the parts that were awkward at eight in the morning
have been made less so.

- one screen to run first thing, and one command that checks everything the
  program can check about itself
- the exception list grouped by what it is about rather than by severity
- the version in one place, so a build cannot report a number the package does
  not carry

## 0.9.0

Everything a shop needs, and the number kept under one until it had been run
against a real job.

- procedure qualification records, what each one qualifies, and whether the
  procedures behind them reach as far as they claim
- the welder register, the continuity clock fed from the weld log, and
  qualification by production radiography
- the weld map, the weld log with consumable lot traceability, and the
  assignment check that four systems each get to refuse
- examinations, acceptance criteria, repairs, spot radiography escalation and
  the repair rate
- mill certificates, furnace charts, holding oven control
- vessels and their design conditions, which decide the toughness question the
  whole variable register hangs off
- the data package, the printed forms and the exception list
- an append only journal with a hashed chain, migrations, an advisory lock and
  a workspace that refuses to be read by a build older than the one that wrote
  it
