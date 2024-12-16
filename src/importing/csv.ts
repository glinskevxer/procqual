import { ValidationError } from '../core/errors.js';

/**
 * A csv reader, written rather than installed.
 *
 * The files this reads come out of the system the shop had before this one,
 * and out of whatever a coordinator saved from a spreadsheet. Both of those
 * produce quoted fields with commas and newlines inside them, both produce
 * carriage returns, and one of them puts a byte order mark on the front. A
 * library would handle all of that and would also bring in a dependency for
 * two hundred lines of work, on a project whose whole runtime dependency list
 * is one argument parser.
 *
 * What it does not do is guess. A row with the wrong number of fields is an
 * error naming the line, not a row with holes in it, because a silently short
 * row in a materials import becomes a heat with no certificate.
 */

export interface CsvRow {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface CsvTable {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
}

export function parseCsv(text: string): CsvTable {
  const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = splitRecords(withoutMark);
  const first = records[0];
  if (first === undefined) {
    throw new ValidationError('csv', 'the file has no header row', {});
  }
  const headers = first.fields.map((field) => field.trim());
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === '') {
      throw new ValidationError('csv', 'the header row has a blank column name', {});
    }
    if (seen.has(header)) {
      throw new ValidationError('csv', `the header row names ${header} twice`, { header });
    }
    seen.add(header);
  }

  const rows: CsvRow[] = [];
  for (const record of records.slice(1)) {
    if (record.fields.length === 1 && record.fields[0]?.trim() === '') {
      continue;
    }
    if (record.fields.length !== headers.length) {
      throw new ValidationError(
        'csv',
        `line ${String(record.line)} has ${String(record.fields.length)} fields and the header has ${String(headers.length)}`,
        { line: record.line },
      );
    }
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = record.fields[index] ?? '';
    });
    rows.push({ line: record.line, values });
  }
  return { headers, rows };
}

export function requireColumns(table: CsvTable, wanted: readonly string[]): void {
  const missing = wanted.filter((header) => !table.headers.includes(header));
  if (missing.length > 0) {
    throw new ValidationError('csv', `the file has no ${missing.join(', ')} column`, {
      missing,
      found: table.headers,
    });
  }
}

export function field(row: CsvRow, name: string): string {
  const value = row.values[name];
  if (value === undefined) {
    throw new ValidationError('csv', `line ${String(row.line)} has no ${name}`, {
      line: row.line,
      name,
    });
  }
  return value.trim();
}

export function optionalField(row: CsvRow, name: string): string | undefined {
  const value = row.values[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

interface Record_ {
  line: number;
  fields: string[];
}

function splitRecords(text: string): Record_[] {
  const records: Record_[] = [];
  let fields: string[] = [];
  let current = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endField = (): void => {
    fields.push(current);
    current = '';
  };
  const endRecord = (): void => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
    recordLine = line;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (character === '\n') {
          line += 1;
        }
        current += character;
      }
      continue;
    }
    if (character === '"' && current === '') {
      quoted = true;
      continue;
    }
    if (character === ',') {
      endField();
      continue;
    }
    if (character === '\r') {
      continue;
    }
    if (character === '\n') {
      line += 1;
      recordLine = line - 1;
      endRecord();
      recordLine = line;
      continue;
    }
    current += character;
  }
  if (quoted) {
    throw new ValidationError('csv', 'the file ends inside a quoted field', {});
  }
  if (current !== '' || fields.length > 0) {
    endRecord();
  }
  return records;
}
