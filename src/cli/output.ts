import { describeFinding, sortFindings, type Finding } from '../core/errors.js';
import { heading, renderTable, type Column } from '../core/text.js';

/**
 * Everything the command line prints goes through here.
 *
 * Two reasons. The obvious one is that a test can hand in a recorder and read
 * back exactly what would have been printed. The less obvious one is that
 * findings have to look the same everywhere they appear, because the shop
 * reads them off a dozen different reports and a finding that reads one way in
 * the procedure index and another way in the joint report gets treated as two
 * different problems.
 */

export interface Output {
  line(text?: string): void;
  error(text: string): void;
}

export class ConsoleOutput implements Output {
  line(text = ''): void {
    process.stdout.write(`${text}\n`);
  }

  error(text: string): void {
    process.stderr.write(`${text}\n`);
  }
}

export class RecordingOutput implements Output {
  readonly lines: string[] = [];
  readonly errors: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.errors.push(text);
  }

  text(): string {
    return this.lines.join('\n');
  }

  errorText(): string {
    return this.errors.join('\n');
  }
}

export function printHeading(out: Output, title: string): void {
  out.line(heading(title));
}

export function printTable<T>(
  out: Output,
  rows: readonly T[],
  columns: readonly Column<T>[],
  emptyMessage?: string,
): void {
  out.line(renderTable(rows, columns, emptyMessage === undefined ? {} : { emptyMessage }));
}

export function printFindings(out: Output, findings: readonly Finding[]): void {
  if (findings.length === 0) {
    out.line('nothing to report');
    return;
  }
  for (const finding of sortFindings(findings)) {
    out.line(describeFinding(finding));
  }
}
