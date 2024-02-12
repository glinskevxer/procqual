import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import {
  DocumentNumber,
  InMemorySequence,
  nextNumber,
} from '../../../src/core/identifier.js';

describe('parsing', () => {
  it('reads a plain number', () => {
    const number = DocumentNumber.parse('WPS-0142');
    expect(number.series).toBe('WPS');
    expect(number.sequence).toBe(142);
    expect(number.revision).toBeUndefined();
    expect(number.toString()).toBe('WPS-0142');
  });

  it('reads a revision suffix', () => {
    const number = DocumentNumber.parse('WPS-0142 Rev 3');
    expect(number.revision).toBe(3);
    expect(number.toString()).toBe('WPS-0142 Rev 3');
  });

  it('is not fussy about case or spacing', () => {
    expect(DocumentNumber.parse('  wps-0142 rev 2 ').toString()).toBe('WPS-0142 Rev 2');
  });

  it('keeps the padding width it was given', () => {
    expect(DocumentNumber.parse('PQR-17').toString()).toBe('PQR-17');
    expect(DocumentNumber.parse('PQR-0017').toString()).toBe('PQR-0017');
  });

  it('rejects what is not a document number', () => {
    expect(() => DocumentNumber.parse('142')).toThrow(ValidationError);
    expect(() => DocumentNumber.parse('WPS')).toThrow(ValidationError);
    expect(() => DocumentNumber.parse('WPS-0142 Revision 3')).toThrow(ValidationError);
  });
});

describe('construction', () => {
  it('rejects a bad series', () => {
    expect(() => DocumentNumber.of('w', 1)).toThrow(/document series/);
    expect(() => DocumentNumber.of('TOOLONGSERIES', 1)).toThrow(/document series/);
    expect(() => DocumentNumber.of('1WPS', 1)).toThrow(/document series/);
  });

  it('rejects an out of range sequence', () => {
    expect(() => DocumentNumber.of('WPS', 0)).toThrow(/sequence out of range/);
    expect(() => DocumentNumber.of('WPS', 1_000_000)).toThrow(/sequence out of range/);
    expect(() => DocumentNumber.of('WPS', 1.5)).toThrow(/sequence out of range/);
  });

  it('rejects an out of range revision', () => {
    expect(() => DocumentNumber.of('WPS', 1, -1)).toThrow(/revision out of range/);
    expect(() => DocumentNumber.of('WPS', 1, 1000)).toThrow(/revision out of range/);
  });
});

describe('revisions', () => {
  const base = DocumentNumber.parse('WPS-0142');

  it('moves to a numbered revision', () => {
    expect(base.atRevision(0).toString()).toBe('WPS-0142 Rev 0');
    expect(base.atRevision(4).revision).toBe(4);
  });

  it('takes the next revision, treating an unrevised document as zero', () => {
    expect(base.nextRevision().toString()).toBe('WPS-0142 Rev 1');
    expect(base.atRevision(3).nextRevision().toString()).toBe('WPS-0142 Rev 4');
  });

  it('drops back to the unrevised number', () => {
    expect(base.atRevision(3).withoutRevision().toString()).toBe('WPS-0142');
  });

  it('recognises the same document at a different revision', () => {
    expect(base.isSameDocument(base.atRevision(9))).toBe(true);
    expect(base.isSameDocument(DocumentNumber.parse('WPS-0143'))).toBe(false);
    expect(base.isSameDocument(DocumentNumber.parse('PQR-0142'))).toBe(false);
  });

  it('keys on the document, not the revision', () => {
    expect(base.atRevision(7).key()).toBe('WPS-0142');
    expect(base.key()).toBe(base.atRevision(0).key());
  });
});

describe('ordering', () => {
  it('sorts by series, then sequence, then revision', () => {
    const numbers = [
      DocumentNumber.parse('WPS-0002'),
      DocumentNumber.parse('PQR-0010'),
      DocumentNumber.parse('WPS-0001 Rev 2'),
      DocumentNumber.parse('WPS-0001'),
    ];
    const sorted = [...numbers].sort((left, right) => left.compare(right));
    expect(sorted.map(String)).toEqual([
      'PQR-0010',
      'WPS-0001',
      'WPS-0001 Rev 2',
      'WPS-0002',
    ]);
  });

  it('treats identical numbers as equal', () => {
    expect(DocumentNumber.parse('WPQ-0003').equals(DocumentNumber.of('WPQ', 3))).toBe(true);
  });

  it('serialises to its printed form', () => {
    expect(JSON.parse(JSON.stringify({ n: DocumentNumber.parse('WPS-1 Rev 1') }))).toEqual({
      n: 'WPS-1 Rev 1',
    });
  });
});

describe('sequences', () => {
  it('hands out numbers from one', () => {
    const source = new InMemorySequence();
    expect(source.next('WPS')).toBe(1);
    expect(source.next('WPS')).toBe(2);
    expect(source.next('PQR')).toBe(1);
  });

  it('peeks without consuming', () => {
    const source = new InMemorySequence();
    expect(source.peek('WPS')).toBe(1);
    expect(source.peek('WPS')).toBe(1);
    expect(source.next('WPS')).toBe(1);
  });

  it('starts where it is told to', () => {
    const source = new InMemorySequence({ wps: 141 });
    expect(source.next('WPS')).toBe(142);
  });

  it('moves past a number that arrived from outside', () => {
    const source = new InMemorySequence();
    source.observe(DocumentNumber.parse('WPS-0500'));
    expect(source.next('WPS')).toBe(501);
    source.observe(DocumentNumber.parse('WPS-0002'));
    expect(source.next('WPS')).toBe(502);
  });

  it('builds a whole document number', () => {
    const source = new InMemorySequence({ PQR: 16 });
    expect(nextNumber(source, 'PQR').toString()).toBe('PQR-0017');
    expect(nextNumber(source, 'PQR', 3).toString()).toBe('PQR-018');
  });
});
