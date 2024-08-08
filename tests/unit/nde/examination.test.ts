import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  assertReadable,
  canInterpret,
  indicationsOfType,
  isCertifiedOn,
  largestIndication,
  reviewExamination,
  totalIndicationLength,
  type Indication,
} from '../../../src/nde/examination.js';
import { sampleExamination, sampleTechnician } from '../../support/nde.js';

const indication = (overrides: Partial<Indication> = {}): Indication => ({
  type: 'slag',
  size: inches('1/8'),
  fromDatum: inches('12'),
  ...overrides,
});

describe('who may sign', () => {
  it('lets a level two interpret a method they are certified in', () => {
    expect(canInterpret(sampleTechnician(), 'RT')).toBe(true);
    expect(canInterpret(sampleTechnician({ level: 'III' }), 'RT')).toBe(true);
  });

  it('does not let a level one interpret anything', () => {
    expect(canInterpret(sampleTechnician({ level: 'I' }), 'RT')).toBe(false);
  });

  it('does not let a level two interpret a method they do not hold', () => {
    expect(canInterpret(sampleTechnician({ methods: ['MT', 'PT'] }), 'RT')).toBe(false);
  });

  it('reads the certification date', () => {
    const technician = sampleTechnician();
    expect(isCertifiedOn(technician, date('2026-03-31'))).toBe(true);
    expect(isCertifiedOn(technician, date('2026-04-01'))).toBe(false);
  });
});

describe('reviewing an examination', () => {
  it('passes a clean one', () => {
    expect(reviewExamination(sampleExamination())).toEqual([]);
  });

  it('refuses one signed by a level one', () => {
    const findings = reviewExamination(
      sampleExamination({ technician: sampleTechnician({ level: 'I' }) }),
    );
    expect(findings.map((item) => item.code)).toEqual(['nde.level_too_low']);
  });

  it('refuses one signed in a method the technician does not hold', () => {
    const findings = reviewExamination(
      sampleExamination({ technician: sampleTechnician({ methods: ['MT'] }) }),
    );
    expect(findings.map((item) => item.code)).toEqual(['nde.method_not_certified']);
  });

  it('refuses one taken after the certification ran out', () => {
    const findings = reviewExamination(
      sampleExamination({
        technician: sampleTechnician({ certifiedUntil: date('2024-01-01') }),
      }),
    );
    expect(findings.map((item) => item.code)).toContain('nde.certification_expired');
  });

  it('insists on a report number and some coverage', () => {
    expect(
      reviewExamination(sampleExamination({ reportNumber: ' ' })).map((item) => item.code),
    ).toContain('nde.no_report');
    expect(
      reviewExamination(sampleExamination({ coverage: inches('0') })).map((item) => item.code),
    ).toContain('nde.no_coverage');
  });

  it('notes an indication recorded with no size', () => {
    const findings = reviewExamination(
      sampleExamination({ indications: [indication({ size: inches('0') })] }),
    );
    expect(findings.map((item) => item.code)).toEqual(['nde.unsized_indication']);
    expect(findings[0]?.severity).toBe('deficiency');
  });

  it('throws when asked to insist on a readable examination', () => {
    expect(() =>
      assertReadable(sampleExamination({ technician: sampleTechnician({ level: 'I' }) })),
    ).toThrow(ValidationError);
    expect(() => assertReadable(sampleExamination())).not.toThrow();
  });
});

describe('reading the indications', () => {
  const examination = sampleExamination({
    indications: [
      indication({ type: 'porosity', size: inches('1/16') }),
      indication({ type: 'slag', size: inches('3/16') }),
      indication({ type: 'porosity', size: inches('1/32') }),
    ],
  });

  it('finds the largest', () => {
    expect(largestIndication(examination)?.size.toFraction()).toBe('3/16');
    expect(largestIndication(sampleExamination())).toBeUndefined();
  });

  it('picks out one type', () => {
    expect(indicationsOfType(examination, 'porosity')).toHaveLength(2);
    expect(indicationsOfType(examination, 'crack')).toEqual([]);
  });

  it('adds the lengths up for the accumulated length rules', () => {
    expect(totalIndicationLength(examination.indications)?.toInches().toString()).toBe('0.28125');
    expect(totalIndicationLength([])).toBeUndefined();
  });
});
