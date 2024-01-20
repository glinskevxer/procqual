import { describe, expect, it } from 'vitest';

import {
  advisory,
  ArcError,
  blocking,
  ConflictError,
  countBySeverity,
  deficiency,
  describeFinding,
  isAcceptable,
  isClean,
  NotFoundError,
  sortFindings,
  StorageError,
  ValidationError,
  worstSeverity,
} from '../../../src/core/errors.js';

describe('ArcError', () => {
  it('keeps the code and freezes the details', () => {
    const error = new ArcError('internal', 'broke', { where: 'here' });
    expect(error.code).toBe('internal');
    expect(error.message).toBe('broke');
    expect(error.details).toEqual({ where: 'here' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('serialises to a flat object', () => {
    const error = new ArcError('unsupported', 'no such process', { process: 'EBW' });
    expect(error.toJSON()).toEqual({
      code: 'unsupported',
      message: 'no such process',
      details: { process: 'EBW' },
    });
  });

  it('is still a real Error', () => {
    const error = new ArcError('internal', 'broke');
    expect(error).toBeInstanceOf(Error);
    expect(error.stack).toBeTypeOf('string');
  });
});

describe('the error subclasses', () => {
  it('records the field on a validation error', () => {
    const error = new ValidationError('thickness', 'must be positive', { given: -1 });
    expect(error.code).toBe('validation');
    expect(error.field).toBe('thickness');
    expect(error.details).toEqual({ field: 'thickness', given: -1 });
  });

  it('builds the message of a not found error', () => {
    const error = new NotFoundError('pqr', 'PQR-1004');
    expect(error.message).toBe('no pqr with id PQR-1004');
    expect(error.code).toBe('not_found');
  });

  it('marks a conflict', () => {
    expect(new ConflictError('already issued').code).toBe('conflict');
  });

  it('marks a storage failure', () => {
    expect(new StorageError('journal truncated').code).toBe('storage');
  });
});

describe('findings', () => {
  const list = [
    advisory('note', 'filler lot nearly exhausted'),
    blocking('range', 'coupon thickness out of range', { clause: 'QW-451.1' }),
    deficiency('nde', 'radiography not filed', { subject: 'J-14' }),
  ];

  it('freezes each finding', () => {
    expect(Object.isFrozen(list[1])).toBe(true);
  });

  it('reports the worst severity present', () => {
    expect(worstSeverity(list)).toBe('blocking');
    expect(worstSeverity([advisory('a', 'a')])).toBe('advisory');
    expect(worstSeverity([])).toBeUndefined();
  });

  it('calls a list with a blocking finding unacceptable', () => {
    expect(isAcceptable(list)).toBe(false);
    expect(isAcceptable([advisory('a', 'a'), deficiency('b', 'b')])).toBe(true);
  });

  it('calls a list clean only when everything is advisory', () => {
    expect(isClean([advisory('a', 'a')])).toBe(true);
    expect(isClean([deficiency('b', 'b')])).toBe(false);
    expect(isClean([])).toBe(true);
  });

  it('sorts by severity and keeps the input order inside a rank', () => {
    const sorted = sortFindings([
      advisory('a1', 'first advisory'),
      blocking('b1', 'first block'),
      advisory('a2', 'second advisory'),
      blocking('b2', 'second block'),
    ]);
    expect(sorted.map((item) => item.code)).toEqual(['b1', 'b2', 'a1', 'a2']);
  });

  it('counts by severity', () => {
    expect(countBySeverity(list)).toEqual({ blocking: 1, deficiency: 1, advisory: 1 });
    expect(countBySeverity([])).toEqual({ blocking: 0, deficiency: 0, advisory: 0 });
  });

  it('renders a finding with its clause and subject', () => {
    expect(describeFinding(list[1]!)).toBe(
      'BLOCKING coupon thickness out of range [QW-451.1]',
    );
    expect(describeFinding(list[2]!)).toBe('DEFICIENCY J-14: radiography not filed');
    expect(describeFinding(list[0]!)).toBe('ADVISORY filler lot nearly exhausted');
  });
});
