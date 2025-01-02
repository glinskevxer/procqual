import { parseProcess } from '../codes/process.js';
import { decimal } from '../core/decimal.js';
import { ArcError, blocking, type Finding } from '../core/errors.js';
import { DocumentNumber } from '../core/identifier.js';
import { PlainDate } from '../core/plainDate.js';
import { Length } from '../core/units.js';
import { normaliseStencil } from '../personnel/welder.js';
import type { Workspace } from '../store/workspace.js';
import { field, optionalField, parseCsv, requireColumns, type CsvRow } from './csv.js';

/**
 * Bringing the old system's exports in.
 *
 * Every importer here runs the same way and it is worth saying why. A file is
 * read whole, every row is turned into a domain record, and only then is
 * anything written. An import that writes the first four hundred rows and
 * stops on the four hundred and first leaves a workspace nobody can reason
 * about: the rows that landed are real records, the rest are not, and the only
 * way back is to work out which is which by hand.
 *
 * The dry run is the same code path with the writing turned off, so what it
 * reports is what would happen rather than an approximation of it.
 */

export interface ImportOptions {
  readonly dryRun?: boolean;
  readonly actor?: string;
}

export interface ImportResult {
  readonly read: number;
  readonly written: number;
  readonly findings: readonly Finding[];
}

type RowWriter = (workspace: Workspace, actor: string) => void;

function runImport(
  workspace: Workspace,
  text: string,
  columns: readonly string[],
  build: (row: CsvRow) => RowWriter,
  options: ImportOptions,
): ImportResult {
  const table = parseCsv(text);
  requireColumns(table, columns);

  const writers: RowWriter[] = [];
  const findings: Finding[] = [];
  for (const row of table.rows) {
    try {
      writers.push(build(row));
    } catch (error) {
      findings.push(
        blocking(
          'import.bad_row',
          `line ${String(row.line)}: ${error instanceof ArcError ? error.message : String(error)}`,
          { subject: String(row.line) },
        ),
      );
    }
  }
  if (findings.length > 0 || options.dryRun === true) {
    return { read: table.rows.length, written: 0, findings };
  }
  const actor = options.actor ?? 'import';
  for (const writer of writers) {
    writer(workspace, actor);
  }
  return { read: table.rows.length, written: writers.length, findings };
}

export function importWelders(
  workspace: Workspace,
  text: string,
  options: ImportOptions = {},
): ImportResult {
  return runImport(
    workspace,
    text,
    ['stencil', 'name', 'from'],
    (row) => {
      const welder = {
        stencil: normaliseStencil(field(row, 'stencil')),
        name: field(row, 'name'),
        employedFrom: PlainDate.parse(field(row, 'from')),
        employedUntil: readOptionalDate(row, 'until'),
      };
      return (target, actor) => {
        target.personnel.registerWelder(welder, actor);
        if (welder.employedUntil !== undefined) {
          target.personnel.recordLeaving(welder.stencil, welder.employedUntil, actor);
        }
      };
    },
    options,
  );
}

export function importHeats(
  workspace: Workspace,
  text: string,
  options: ImportOptions = {},
): ImportResult {
  return runImport(
    workspace,
    text,
    [
      'heat',
      'specification',
      'supplier',
      'certificate',
      'dated',
      'thickness',
      'tensile',
      'yield',
      'elongation',
    ],
    (row) => {
      const heat = {
        heatNumber: field(row, 'heat'),
        specification: field(row, 'specification'),
        supplier: field(row, 'supplier'),
        certificateNumber: field(row, 'certificate'),
        certificateDate: PlainDate.parse(field(row, 'dated')),
        thickness: Length.parse(field(row, 'thickness')),
        normalised: optionalField(row, 'normalised') === 'yes',
        chemistry: {
          C: readOptionalDecimal(row, 'carbon'),
          Mn: readOptionalDecimal(row, 'manganese'),
          Si: readOptionalDecimal(row, 'silicon'),
          Cr: readOptionalDecimal(row, 'chromium'),
          Mo: readOptionalDecimal(row, 'molybdenum'),
          Ni: readOptionalDecimal(row, 'nickel'),
        },
        mechanical: {
          tensileKsi: decimal(field(row, 'tensile')),
          yieldKsi: decimal(field(row, 'yield')),
          elongationPercent: decimal(field(row, 'elongation')),
        },
      };
      return (target, actor) => {
        target.materials.certify(heat, actor);
      };
    },
    options,
  );
}

export function importWeldLog(
  workspace: Workspace,
  text: string,
  options: ImportOptions = {},
): ImportResult {
  return runImport(
    workspace,
    text,
    [
      'entry',
      'joint',
      'welder',
      'process',
      'procedure',
      'welded',
      'consumable',
      'lot',
      'deposit',
      'foreman',
    ],
    (row) => {
      const entry = {
        id: field(row, 'entry'),
        joint: field(row, 'joint'),
        stencil: field(row, 'welder'),
        process: parseProcess(field(row, 'process')),
        procedure: DocumentNumber.parse(field(row, 'procedure')),
        weldedOn: PlainDate.parse(field(row, 'welded')),
        role: readRole(optionalField(row, 'role')),
        consumable: field(row, 'consumable'),
        consumableLot: field(row, 'lot'),
        depositThickness: Length.parse(field(row, 'deposit')),
        foreman: field(row, 'foreman'),
      };
      return (target, actor) => {
        target.fabrication.logWeld(entry, actor);
      };
    },
    options,
  );
}

function readOptionalDate(row: CsvRow, name: string): PlainDate | undefined {
  const value = optionalField(row, name);
  return value === undefined ? undefined : PlainDate.parse(value);
}

function readOptionalDecimal(row: CsvRow, name: string): ReturnType<typeof decimal> | undefined {
  const value = optionalField(row, name);
  return value === undefined ? undefined : decimal(value);
}

function readRole(value: string | undefined): 'root' | 'fill' | 'cap' | 'repair' | 'tack' {
  const roles = ['root', 'fill', 'cap', 'repair', 'tack'] as const;
  const found = roles.find((role) => role === value);
  return found ?? 'fill';
}
