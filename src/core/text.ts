/**
 * Plain text layout for the reports this system prints.
 *
 * Everything the shop reads comes out of a terminal or a printer that is older
 * than most of the staff, so the output is fixed width text. No colour, no box
 * drawing characters, nothing that turns into mojibake on the way to the weld
 * shop printer.
 */

export type Alignment = 'left' | 'right';

export interface Column<T> {
  readonly header: string;
  readonly align?: Alignment;
  readonly width?: number;
  value(row: T): string;
}

export interface TableOptions {
  /** Two spaces reads better than a pipe on a narrow printer. */
  readonly gap?: string;
  readonly rule?: boolean;
  readonly emptyMessage?: string;
}

export function renderTable<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  options: TableOptions = {},
): string {
  const gap = options.gap ?? '  ';
  if (rows.length === 0) {
    return options.emptyMessage ?? '(nothing to show)';
  }
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, index) => {
    if (column.width !== undefined) {
      return column.width;
    }
    const longest = cells.reduce((best, row) => Math.max(best, (row[index] ?? '').length), 0);
    return Math.max(column.header.length, longest);
  });
  const lines: string[] = [];
  lines.push(joinCells(columns.map((column, index) => pad(column.header, widths[index] ?? 0, 'left')), gap));
  if (options.rule !== false) {
    lines.push(joinCells(widths.map((width) => '-'.repeat(width)), gap));
  }
  for (const row of cells) {
    lines.push(
      joinCells(
        row.map((cell, index) => pad(cell, widths[index] ?? 0, columns[index]?.align ?? 'left')),
        gap,
      ),
    );
  }
  return lines.join('\n');
}

export function pad(text: string, width: number, align: Alignment = 'left'): string {
  if (text.length >= width) {
    return text;
  }
  return align === 'left' ? text.padEnd(width) : text.padStart(width);
}

export function truncate(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  if (text.length <= width) {
    return text;
  }
  return width <= 3 ? text.slice(0, width) : `${text.slice(0, width - 3)}...`;
}

export function wrap(text: string, width: number): string[] {
  if (width <= 0) {
    return [text];
  }
  const words = text.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');
}

export function heading(text: string, underline = '='): string {
  return `${text}\n${underline.repeat(text.length)}`;
}

export function keyValues(pairs: readonly (readonly [string, string])[]): string {
  const width = pairs.reduce((best, [key]) => Math.max(best, key.length), 0);
  return pairs.map(([key, value]) => `${pad(`${key}:`, width + 1)} ${value}`).join('\n');
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function joinWithAnd(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0] ?? '';
  }
  const head = items.slice(0, -1).join(', ');
  return `${head} and ${items[items.length - 1] ?? ''}`;
}

function joinCells(cells: readonly string[], gap: string): string {
  return cells.join(gap).trimEnd();
}
