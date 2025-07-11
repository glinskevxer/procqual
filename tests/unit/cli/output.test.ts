import { describe, expect, it, vi } from 'vitest';

import {
  ConsoleOutput,
  printFindings,
  printHeading,
  printTable,
  RecordingOutput,
} from '../../../src/cli/output.js';
import { advisory, blocking } from '../../../src/core/errors.js';

describe('the console output', () => {
  it('writes a line to standard output', () => {
    const out = new ConsoleOutput();
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        written.push(String(chunk));
        return true;
      });
    out.line('hello');
    out.line();
    spy.mockRestore();
    expect(written).toEqual(['hello\n', '\n']);
  });

  it('writes an error to standard error', () => {
    const out = new ConsoleOutput();
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        written.push(String(chunk));
        return true;
      });
    out.error('broke');
    spy.mockRestore();
    expect(written).toEqual(['broke\n']);
  });
});

describe('the recording output', () => {
  it('keeps the lines and the errors apart', () => {
    const out = new RecordingOutput();
    out.line('a');
    out.line();
    out.error('bad');
    expect(out.lines).toEqual(['a', '']);
    expect(out.text()).toBe('a\n');
    expect(out.errorText()).toBe('bad');
  });
});

describe('the printers', () => {
  it('underlines a heading', () => {
    const out = new RecordingOutput();
    printHeading(out, 'Welder register');
    expect(out.text()).toBe('Welder register\n===============');
  });

  it('prints a table and its empty message', () => {
    const out = new RecordingOutput();
    printTable(out, [{ id: 'a' }], [{ header: 'id', value: (row) => row.id }]);
    expect(out.text()).toContain('id');

    const empty = new RecordingOutput();
    printTable(empty, [], [{ header: 'id', value: () => '' }], 'nothing at all');
    expect(empty.text()).toBe('nothing at all');
  });

  it('prints findings worst first and says when there are none', () => {
    const out = new RecordingOutput();
    printFindings(out, [advisory('a', 'a note'), blocking('b', 'a fault')]);
    expect(out.lines[0]).toContain('BLOCKING');
    expect(out.lines[1]).toContain('ADVISORY');

    const quiet = new RecordingOutput();
    printFindings(quiet, []);
    expect(quiet.text()).toBe('nothing to report');
  });
});
