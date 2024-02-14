import { describe, expect, it } from 'vitest';

import {
  heading,
  indent,
  joinWithAnd,
  keyValues,
  pad,
  pluralise,
  renderTable,
  truncate,
  wrap,
  type Column,
} from '../../../src/core/text.js';

interface Row {
  id: string;
  process: string;
  thickness: string;
}

const rows: Row[] = [
  { id: 'PQR-0001', process: 'SMAW', thickness: '0.375' },
  { id: 'PQR-0002', process: 'GTAW', thickness: '1.125' },
];

const columns: Column<Row>[] = [
  { header: 'number', value: (row) => row.id },
  { header: 'process', value: (row) => row.process },
  { header: 'thk', align: 'right', value: (row) => row.thickness },
];

describe('renderTable', () => {
  it('lays out headers, a rule and the rows', () => {
    expect(renderTable(rows, columns)).toBe(
      [
        'number    process  thk',
        '--------  -------  -----',
        'PQR-0001  SMAW     0.375',
        'PQR-0002  GTAW     1.125',
      ].join('\n'),
    );
  });

  it('can drop the rule', () => {
    const text = renderTable(rows, columns, { rule: false });
    expect(text.split('\n')).toHaveLength(3);
  });

  it('takes a custom gap', () => {
    expect(renderTable(rows, columns, { gap: ' | ', rule: false }).split('\n')[0]).toBe(
      'number   | process | thk',
    );
  });

  it('honours a fixed column width', () => {
    const fixed: Column<Row>[] = [{ header: 'n', width: 12, value: (row) => row.id }];
    expect(renderTable(rows, fixed, { rule: false }).split('\n')[1]).toBe('PQR-0001');
  });

  it('says so when there is nothing to show', () => {
    expect(renderTable([], columns)).toBe('(nothing to show)');
    expect(renderTable([], columns, { emptyMessage: 'no procedures' })).toBe('no procedures');
  });

  it('trims the trailing spaces off every line', () => {
    for (const line of renderTable(rows, columns).split('\n')) {
      expect(line).toBe(line.trimEnd());
    }
  });
});

describe('pad and truncate', () => {
  it('pads to either side', () => {
    expect(pad('ab', 5)).toBe('ab   ');
    expect(pad('ab', 5, 'right')).toBe('   ab');
    expect(pad('abcdef', 3)).toBe('abcdef');
  });

  it('truncates with an ellipsis when there is room for one', () => {
    expect(truncate('abcdefgh', 5)).toBe('ab...');
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate('abcdef', 0)).toBe('');
  });
});

describe('wrap', () => {
  it('breaks on spaces at the requested width', () => {
    expect(wrap('the coupon thickness is out of range', 12)).toEqual([
      'the coupon',
      'thickness is',
      'out of range',
    ]);
  });

  it('keeps a word longer than the width on its own line', () => {
    expect(wrap('radiographically examined', 6)).toEqual(['radiographically', 'examined']);
  });

  it('handles empty input', () => {
    expect(wrap('   ', 10)).toEqual(['']);
    expect(wrap('abc', 0)).toEqual(['abc']);
  });
});

describe('other layout helpers', () => {
  it('indents every non blank line', () => {
    expect(indent('a\n\nb', 2)).toBe('  a\n\n  b');
  });

  it('underlines a heading to its own length', () => {
    expect(heading('Welder register')).toBe('Welder register\n===============');
    expect(heading('ab', '-')).toBe('ab\n--');
  });

  it('aligns a block of key and value pairs', () => {
    expect(
      keyValues([
        ['process', 'SMAW'],
        ['base metal', 'P-1 Gr 1'],
      ]),
    ).toBe('process:    SMAW\nbase metal: P-1 Gr 1');
  });

  it('pluralises', () => {
    expect(pluralise(1, 'joint')).toBe('1 joint');
    expect(pluralise(2, 'joint')).toBe('2 joints');
    expect(pluralise(0, 'radiograph', 'radiographs')).toBe('0 radiographs');
  });

  it('joins a list the way a sentence would', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['a'])).toBe('a');
    expect(joinWithAnd(['a', 'b'])).toBe('a and b');
    expect(joinWithAnd(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
