# arc

Weld procedure qualification, welder performance qualification and joint
traceability for a code fabrication shop.

This is the system the welding engineer and the quality department run the
paperwork on. It holds the base metal and consumable catalogues, the procedure
qualification records and what each one qualifies, the procedure specifications
and whether the records behind them actually reach that far, and eventually the
weld map, the examination records and the documentation package for a vessel.

There is no web front end and there is not going to be one. The people who use
it are at a bench or on a shop floor terminal.

## Layout

    src/codes/          the code tables, and only the tables
    src/core/           measurements, dates, intervals, findings
    src/materials/      base metal and consumable catalogues, mill certificates
    src/qualification/  records, procedures, and what covers what
    src/store/          the append only journal
    src/cli/            the command line
    tests/              unit, integration and command line suites

## Running things

    npm install
    npm run check          lint, types and the whole suite
    npm run arc -- --help  the command line, straight off the sources

## Why it is built the way it is

A quality record is a history rather than a current state, so nothing is ever
updated in place. Every change is an entry in a journal and the current state
is what you get by reading the entries in order. When an inspector asks why a
joint was signed off on a Tuesday, the answer has to be the record as it stood
on the Tuesday.

The other thing worth knowing before reading the code is that almost no rule in
this domain stands on its own. Whether a variable is essential depends on
whether the vessel needs notch toughness. Whether a coupon still covers a
thicker part depends on how it was heat treated. The tables in `src/codes` are
kept free of judgement for that reason, and the composition happens a layer up.
