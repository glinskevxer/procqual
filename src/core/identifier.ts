import { ValidationError } from './errors.js';

/**
 * Document numbers, in the shape a QA department already writes them.
 *
 * Every controlled document in the shop carries a series letter block, a
 * sequence and, for the ones that get reissued, a revision. `WPS-0142 Rev 3`
 * is the number on the paper, it is what an inspector asks for, and it sorts
 * by series then sequence then revision. Opaque random ids would be easier to
 * generate and impossible to use.
 */

const SERIES = /^[A-Z][A-Z0-9]{1,7}$/;
const PATTERN = /^([A-Z][A-Z0-9]{1,7})-(\d{1,6})(?:\s+Rev\s+(\d{1,3}))?$/i;

export class DocumentNumber {
  readonly series: string;
  readonly sequence: number;
  readonly revision: number | undefined;
  private readonly width: number;

  private constructor(series: string, sequence: number, revision: number | undefined, width: number) {
    this.series = series;
    this.sequence = sequence;
    this.revision = revision;
    this.width = width;
  }

  static of(series: string, sequence: number, revision?: number, width = 4): DocumentNumber {
    const upper = series.toUpperCase();
    if (!SERIES.test(upper)) {
      throw new ValidationError('series', `not a document series: ${JSON.stringify(series)}`, {
        series,
      });
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
      throw new ValidationError('sequence', `sequence out of range: ${sequence}`, { sequence });
    }
    if (revision !== undefined && (!Number.isInteger(revision) || revision < 0 || revision > 999)) {
      throw new ValidationError('revision', `revision out of range: ${revision}`, { revision });
    }
    return new DocumentNumber(upper, sequence, revision, width);
  }

  static parse(text: string): DocumentNumber {
    const match = PATTERN.exec(text.trim());
    if (match === null) {
      throw new ValidationError('id', `not a document number: ${JSON.stringify(text)}`, { text });
    }
    const digits = match[2] ?? '0';
    const revision = match[3] === undefined ? undefined : Number(match[3]);
    return DocumentNumber.of(match[1] ?? '', Number(digits), revision, digits.length);
  }

  /** The same document at a later revision. */
  atRevision(revision: number): DocumentNumber {
    return DocumentNumber.of(this.series, this.sequence, revision, this.width);
  }

  nextRevision(): DocumentNumber {
    return this.atRevision((this.revision ?? 0) + 1);
  }

  withoutRevision(): DocumentNumber {
    return DocumentNumber.of(this.series, this.sequence, undefined, this.width);
  }

  /** True when the two numbers name the same document at any revision. */
  isSameDocument(other: DocumentNumber): boolean {
    return this.series === other.series && this.sequence === other.sequence;
  }

  compare(other: DocumentNumber): -1 | 0 | 1 {
    if (this.series !== other.series) {
      return this.series < other.series ? -1 : 1;
    }
    if (this.sequence !== other.sequence) {
      return this.sequence < other.sequence ? -1 : 1;
    }
    const left = this.revision ?? -1;
    const right = other.revision ?? -1;
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }

  equals(other: DocumentNumber): boolean {
    return this.compare(other) === 0;
  }

  /** The stable key used for storage, with no revision and no spaces. */
  key(): string {
    return `${this.series}-${String(this.sequence).padStart(this.width, '0')}`;
  }

  toString(): string {
    return this.revision === undefined ? this.key() : `${this.key()} Rev ${this.revision}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Hands out the next free sequence in a series. */
export interface SequenceSource {
  next(series: string): number;
  peek(series: string): number;
}

export class InMemorySequence implements SequenceSource {
  private readonly counters = new Map<string, number>();

  constructor(start: Readonly<Record<string, number>> = {}) {
    for (const [series, value] of Object.entries(start)) {
      this.counters.set(series.toUpperCase(), value);
    }
  }

  next(series: string): number {
    const key = series.toUpperCase();
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return value;
  }

  peek(series: string): number {
    return (this.counters.get(series.toUpperCase()) ?? 0) + 1;
  }

  /** Move a counter past a number that arrived from somewhere else. */
  observe(number: DocumentNumber): void {
    const key = number.series;
    const current = this.counters.get(key) ?? 0;
    if (number.sequence > current) {
      this.counters.set(key, number.sequence);
    }
  }
}

export function nextNumber(source: SequenceSource, series: string, width = 4): DocumentNumber {
  return DocumentNumber.of(series, source.next(series), undefined, width);
}
