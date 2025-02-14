import { describe, expect, it } from 'vitest';

import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  assessProductionQualification,
  describeEligibility,
  eligibility,
  isAvailable,
  MINIMUM_COVERAGE,
  type ProductionQualificationRequest,
} from '../../../src/personnel/productionQualification.js';
import { sampleExamination } from '../../support/nde.js';

const request = (
  overrides: Partial<ProductionQualificationRequest> = {},
): ProductionQualificationRequest => ({
  stencil: 'W-118',
  process: 'SMAW',
  pNumber: '1',
  joint: 'J-14',
  weldedOn: date('2025-02-10'),
  examination: sampleExamination({ performedOn: date('2025-02-12') }),
  jointThickness: inches('1/2'),
  ...overrides,
});

describe('when the route is open at all', () => {
  it('is open for ordinary work', () => {
    expect(eligibility(request())).toBe('available');
    expect(isAvailable(request())).toBe(true);
    expect(describeEligibility('available')).toContain('may stand in');
  });

  it('is shut for short circuiting transfer', () => {
    const shortCircuit = request({ process: 'GMAW', transferMode: 'short-circuiting' });
    expect(eligibility(shortCircuit)).toBe('not-for-short-circuiting');
    expect(assessProductionQualification(shortCircuit).findings[0]?.message).toContain(
      'does not find the fusion faults',
    );
  });

  it('is open for gas metal arc in the other transfer modes', () => {
    expect(eligibility(request({ process: 'GMAW', transferMode: 'spray' }))).toBe('available');
  });

  it('is shut on aluminium', () => {
    expect(eligibility(request({ pNumber: '22' }))).toBe('not-for-aluminium');
    expect(describeEligibility('not-for-aluminium')).toContain('aluminium');
  });
});

describe('reading the radiograph', () => {
  it('qualifies the welder on a clean one', () => {
    const verdict = assessProductionQualification(request());
    expect(verdict.qualified).toBe(true);
    expect(verdict.findings[0]?.code).toBe('production.qualified');
  });

  it('insists on six inches of weld actually covered', () => {
    const short = request({
      examination: sampleExamination({ coverage: inches('4'), performedOn: date('2025-02-12') }),
    });
    expect(MINIMUM_COVERAGE.toFraction()).toBe('6');
    const verdict = assessProductionQualification(short);
    expect(verdict.qualified).toBe(false);
    expect(verdict.findings.map((item) => item.code)).toContain('production.too_short');
  });

  it('refuses a report against a different joint', () => {
    const wrong = request({
      examination: sampleExamination({ joint: 'J-15', performedOn: date('2025-02-12') }),
    });
    expect(assessProductionQualification(wrong).findings.map((item) => item.code)).toContain(
      'production.wrong_joint',
    );
  });

  it('refuses anything that is not radiography', () => {
    const surface = request({
      examination: sampleExamination({ method: 'MT', performedOn: date('2025-02-12') }),
    });
    expect(assessProductionQualification(surface).findings.map((item) => item.code)).toContain(
      'production.not_radiography',
    );
  });

  it('refuses a radiograph dated before the weld', () => {
    const early = request({
      examination: sampleExamination({ performedOn: date('2025-01-01') }),
    });
    expect(assessProductionQualification(early).findings.map((item) => item.code)).toContain(
      'production.examined_before_welded',
    );
  });

  it('does not qualify anybody off a rejected radiograph', () => {
    const rejected = request({
      examination: sampleExamination({
        performedOn: date('2025-02-12'),
        indications: [{ type: 'crack', size: inches('1/32'), fromDatum: inches('3') }],
      }),
    });
    const verdict = assessProductionQualification(rejected);
    expect(verdict.qualified).toBe(false);
    expect(verdict.findings.map((item) => item.code)).toContain('production.rejected');
  });
});
