import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { field, optionalField, parseCsv, requireColumns } from '../../../src/importing/csv.js';

describe('reading a plain file', () => {
  const table = parseCsv('stencil,name\nW-118,R Ashworth\nW-205,T Naylor\n');

  it('reads the headers and the rows', () => {
    expect(table.headers).toEqual(['stencil', 'name']);
    expect(table.rows).toHaveLength(2);
    expect(field(table.rows[0]!, 'name')).toBe('R Ashworth');
  });

  it('numbers the lines from one, counting the header', () => {
    expect(table.rows[0]?.line).toBe(2);
    expect(table.rows[1]?.line).toBe(3);
  });

  it('trims the values', () => {
    const spaced = parseCsv('stencil,name\n  W-118 , R Ashworth \n');
    expect(field(spaced.rows[0]!, 'stencil')).toBe('W-118');
  });
});

describe('the awkward files', () => {
  it('reads quoted fields with commas in them', () => {
    const table = parseCsv('code,description\nE7018,"low hydrogen, all position"\n');
    expect(field(table.rows[0]!, 'description')).toBe('low hydrogen, all position');
  });

  it('reads a doubled quote inside a quoted field', () => {
    const table = parseCsv('code,note\nE7018,"the ""dry"" one"\n');
    expect(field(table.rows[0]!, 'note')).toBe('the "dry" one');
  });

  it('reads a newline inside a quoted field', () => {
    const table = parseCsv('code,note\nE7018,"first\nsecond"\ncode2,plain\n');
    expect(table.rows).toHaveLength(2);
    expect(field(table.rows[0]!, 'note')).toBe('first\nsecond');
  });

  it('copes with carriage returns', () => {
    const table = parseCsv('a,b\r\n1,2\r\n');
    expect(field(table.rows[0]!, 'b')).toBe('2');
  });

  it('strips a byte order mark', () => {
    const table = parseCsv('﻿stencil,name\nW-118,R Ashworth\n');
    expect(table.headers).toEqual(['stencil', 'name']);
  });

  it('ignores a blank line at the end', () => {
    expect(parseCsv('a,b\n1,2\n\n').rows).toHaveLength(1);
  });

  it('reads a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2').rows).toHaveLength(1);
  });
});

describe('what it refuses', () => {
  it('refuses an empty file', () => {
    expect(() => parseCsv('')).toThrow(/no header row/);
  });

  it('refuses a blank or duplicated column name', () => {
    expect(() => parseCsv('a,,c\n1,2,3\n')).toThrow(/blank column name/);
    expect(() => parseCsv('a,a\n1,2\n')).toThrow(/names a twice/);
  });

  it('refuses a short row rather than filling it in', () => {
    expect(() => parseCsv('a,b,c\n1,2\n')).toThrow(/line 2 has 2 fields/);
  });

  it('refuses a long row as well', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/line 2 has 3 fields/);
  });

  it('refuses a file that ends inside a quote', () => {
    expect(() => parseCsv('a,b\n1,"unfinished\n')).toThrow(/inside a quoted field/);
  });
});

describe('reading fields out of a row', () => {
  const table = parseCsv('stencil,name,note\nW-118,R Ashworth,\n');

  it('insists on a column that has to be there', () => {
    expect(() => field(table.rows[0]!, 'missing')).toThrow(ValidationError);
    expect(() => requireColumns(table, ['stencil', 'from'])).toThrow(/no from column/);
    expect(() => requireColumns(table, ['stencil'])).not.toThrow();
  });

  it('reads a blank optional field as absent', () => {
    expect(optionalField(table.rows[0]!, 'note')).toBeUndefined();
    expect(optionalField(table.rows[0]!, 'name')).toBe('R Ashworth');
    expect(optionalField(table.rows[0]!, 'missing')).toBeUndefined();
  });
});
