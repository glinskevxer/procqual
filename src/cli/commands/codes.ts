import { Command } from 'commander';

import { allANumbers, describeANumber } from '../../codes/anumber.js';
import { parseClassification, describeClassification } from '../../codes/classification.js';
import { allFNumbers, fNumbersQualifiedBy, needsAtmosphericControl } from '../../codes/fnumber.js';
import { allPNumbers, pNumbersQualifiedBy } from '../../codes/pnumber.js';
import { parseProcess } from '../../codes/process.js';
import {
  combinedPositions,
  parseTestPosition,
  positionsQualifiedBy,
  TEST_POSITIONS,
} from '../../codes/position.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

/**
 * Lookups against the code tables.
 *
 * These exist because the coordinator's alternative is a paper book on a shelf
 * in the next building, and the answer to "what does an F number four coupon
 * cover" gets guessed rather than looked up when the book is far enough away.
 */
export function codesCommand(out: Output): Command {
  const command = new Command('codes').description('look things up in the code tables');

  command
    .command('p-numbers')
    .description('list the base metal groupings and what each one reaches down to')
    .action(() => {
      printHeading(out, 'Base metal P numbers');
      printTable(
        out,
        [...allPNumbers()],
        [
          { header: 'P-No', value: (row) => row.code },
          { header: 'family', value: (row) => row.family },
          { header: 'groups', value: (row) => row.groups.join(', ') },
          { header: 'reaches', value: (row) => pNumbersQualifiedBy(row.code).join(', ') },
        ],
      );
    });

  command
    .command('f-numbers')
    .description('list the filler groupings')
    .option('--process <code>', 'show what a coupon of each group covers for this process', 'SMAW')
    .action((options: { process: string }) => {
      const process = parseProcess(options.process);
      printHeading(out, `Filler metal F numbers, as run with ${process}`);
      printTable(
        out,
        [...allFNumbers()],
        [
          { header: 'F-No', align: 'right', value: (row) => String(row.code) },
          { header: 'description', value: (row) => row.description },
          { header: 'oven', value: (row) => (needsAtmosphericControl(row.code) ? 'yes' : 'no') },
          {
            header: 'covers',
            value: (row) =>
              row.processes.includes(process)
                ? fNumbersQualifiedBy(row.code, process).join(', ')
                : 'not used',
          },
        ],
      );
    });

  command
    .command('a-numbers')
    .description('list the weld deposit chemistry groups')
    .action(() => {
      printHeading(out, 'Weld deposit A numbers');
      for (const facts of allANumbers()) {
        out.line(describeANumber(facts.code));
      }
    });

  command
    .command('positions')
    .description('show what each test position qualifies')
    .option('--fillet', 'read the fillet column instead of the groove column', false)
    .action((options: { fillet: boolean }) => {
      const weldType = options.fillet ? 'fillet' : 'groove';
      printHeading(out, `Positions qualified for ${weldType} welds`);
      printTable(
        out,
        [...TEST_POSITIONS],
        [
          { header: 'coupon', value: (row) => row },
          {
            header: 'qualifies',
            value: (row) => {
              const qualified = positionsQualifiedBy(row, weldType);
              return qualified.length === 0 ? 'nothing' : qualified.join(', ');
            },
          },
        ],
      );
    });

  command
    .command('combine <positions...>')
    .description('add several coupons together, as 2G plus 5G')
    .option('--fillet', 'read the fillet column instead of the groove column', false)
    .action((positions: string[], options: { fillet: boolean }) => {
      const parsed = positions.map((value) => parseTestPosition(value));
      const weldType = options.fillet ? 'fillet' : 'groove';
      const combined = combinedPositions(parsed, weldType);
      out.line(
        `${parsed.join(' + ')} qualifies ${combined.length === 0 ? 'nothing' : combined.join(', ')} for ${weldType} welds`,
      );
    });

  command
    .command('filler <specification> <classification>')
    .description('read the groups out of a printed classification')
    .action((specification: string, classification: string) => {
      out.line(describeClassification(parseClassification(`${specification} ${classification}`)));
    });

  return command;
}
