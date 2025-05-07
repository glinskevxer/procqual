# arc

Weld procedure qualification, welder performance qualification and joint
traceability for a code fabrication shop.

This is the system a welding engineer and a quality department run the
paperwork on. It holds the base metal and consumable catalogues, the procedure
qualification records and what each one qualifies, the procedure specifications
and whether the records behind them reach that far, the welder register and its
continuity clock, the weld map, the weld log, the examinations and repairs, the
mill certificates and furnace charts, and the data package that comes out at
the end of a job.

There is no web front end and there is not going to be one. The people who use
it are at a bench or on a shop floor terminal, and half of what it produces
goes on paper.

## Getting started

    npm install
    npm run check                       lint, types and the whole suite
    npm run arc -- workspace init /srv/arc --shop "bay four"
    npm run arc -- --help

The command reference is in [docs/cli.md](docs/cli.md) and is generated from
the command tree by `npm run reference`.

## Layout

    src/codes/          the code tables, and only the tables
    src/core/           measurements, dates, intervals, findings
    src/materials/      base metal and consumable catalogues, mill certificates
    src/qualification/  records, procedures, and what covers what
    src/personnel/      welders, their coupons and their continuity
    src/fabrication/    vessels, joints, the weld log, consumable control
    src/nde/            examinations, acceptance criteria, repairs, coverage
    src/reporting/      the reports and the printed forms
    src/importing/      reading what the old system exported
    src/exporting/      writing a data package out
    src/policy/         the numbers a shop sets for itself
    src/store/          the append only journal and the projections over it
    src/cli/            the command line
    tests/              unit, integration and command line suites

## The shape of it

**A quality record is a history, not a current state.** Nothing is updated in
place. Every change is an entry in an append only journal, each entry hashes
the one before it, and the current state is what you get by reading the entries
in order. When an inspector asks why a joint was signed off on a Tuesday, the
answer has to be the record as it stood on the Tuesday.

**Almost no rule in this domain stands on its own.** Whether a welding variable
is essential depends on whether the vessel needs notch toughness. Whether a
coupon still covers a thicker part depends on how it was heat treated. Which
surface examination method applies depends on whether the metal is magnetic.
The tables in `src/codes` are kept free of judgement for that reason, and the
composition happens a layer up.

**A rule saying no is the product, not a fault.** Exceptions are for programmer
error and broken storage. Everything else comes back as a finding with a
severity and the clause it rests on, so a reviewer can check the call.

## Running it

The workspace is one directory, usually on a share. Set `ARC_HOME` to point at
it, or pass a path. `ARC_ACTOR` names whoever is at the terminal, and that name
goes on every entry they write.

    ARC_HOME=/srv/arc ARC_ACTOR=kd arc welders continuity --due 30
    ARC_HOME=/srv/arc arc report package V-2201
    ARC_HOME=/srv/arc arc workspace verify

Exit codes are stable and are listed in `src/cli/exitCodes.ts`.
