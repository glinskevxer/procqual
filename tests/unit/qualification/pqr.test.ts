import { describe, expect, it } from 'vitest';

import { isAcceptable, ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  governingTensile,
  isCertified,
  isDissimilarJoint,
  layerFor,
  processesUsed,
  reviewRecord,
  totalDeposit,
} from '../../../src/qualification/pqr.js';
import { samplePqr } from '../../support/pqr.js';
import { baseVariables } from '../../support/variables.js';

const twoLayer = () => {
  const root = {
    ...baseVariables(),
    process: 'GTAW' as const,
    filler: {
      ...baseVariables().filler,
      fNumber: 6,
      classification: 'ER70S-2',
      depositThickness: inches('1/8'),
    },
    gas: { shieldingComposition: 'argon' },
  };
  const fill = {
    ...baseVariables(),
    filler: { ...baseVariables().filler, depositThickness: inches('1/4') },
  };
  return samplePqr({ layers: [root, fill] });
};

describe('reading a record', () => {
  it('lists the processes in the order they were run', () => {
    expect(processesUsed(twoLayer())).toEqual(['GTAW', 'SMAW']);
  });

  it('finds one process layer', () => {
    expect(layerFor(twoLayer(), 'GTAW').filler.classification).toBe('ER70S-2');
  });

  it('refuses a process the coupon never used', () => {
    expect(() => layerFor(twoLayer(), 'SAW')).toThrow(ValidationError);
    expect(() => layerFor(twoLayer(), 'SAW')).toThrow(/does not record SAW/);
  });

  it('adds the deposits up across the layers', () => {
    expect(totalDeposit(twoLayer()).toFraction()).toBe('3/8');
    expect(totalDeposit(samplePqr()).toFraction()).toBe('3/8');
  });

  it('takes the weaker of the two base metals as governing', () => {
    expect(governingTensile(samplePqr())).toBe(70);
    expect(governingTensile(samplePqr({ baseMetalRight: 'SA-106 Gr B' }))).toBe(60);
  });

  it('spots a joint between two families', () => {
    expect(isDissimilarJoint(samplePqr())).toBe(false);
    expect(isDissimilarJoint(samplePqr({ baseMetalRight: 'SA-240 304L' }))).toBe(true);
    expect(isDissimilarJoint(samplePqr({ baseMetalRight: 'SA-106 Gr B' }))).toBe(false);
  });

  it('counts a record certified only when it is witnessed and dated', () => {
    expect(isCertified(samplePqr())).toBe(true);
    expect(isCertified(samplePqr({ certifiedOn: undefined }))).toBe(false);
    expect(isCertified(samplePqr({ witnessedBy: undefined }))).toBe(false);
  });
});

describe('reviewing a record for transcription faults', () => {
  it('passes a clean record', () => {
    expect(reviewRecord(samplePqr())).toEqual([]);
    expect(reviewRecord(twoLayer())).toEqual([]);
  });

  it('refuses a record with no process at all', () => {
    const findings = reviewRecord(samplePqr({ layers: [] }));
    expect(findings.map((item) => item.code)).toEqual(['pqr.no_layers']);
  });

  it('refuses the same process twice', () => {
    const findings = reviewRecord(
      samplePqr({
        layers: [
          {
            ...baseVariables(),
            filler: { ...baseVariables().filler, depositThickness: inches('1/8') },
          },
          {
            ...baseVariables(),
            filler: { ...baseVariables().filler, depositThickness: inches('1/4') },
          },
        ],
      }),
    );
    expect(findings.map((item) => item.code)).toContain('pqr.duplicate_process');
  });

  it('refuses more deposit than there is coupon', () => {
    const findings = reviewRecord(
      samplePqr({
        couponThickness: inches('1/4'),
        layers: [
          {
            ...baseVariables(),
            baseMetal: { ...baseVariables().baseMetal, thickness: inches('1/4') },
          },
        ],
      }),
    );
    expect(findings.map((item) => item.code)).toContain('pqr.deposit_exceeds_coupon');
  });

  it('refuses a layer whose base metal thickness disagrees with the coupon', () => {
    const findings = reviewRecord(samplePqr({ couponThickness: inches('1/2') }));
    expect(findings.map((item) => item.code)).toContain('pqr.thickness_disagrees');
  });

  it('wants a diameter on a pipe coupon', () => {
    const findings = reviewRecord(samplePqr({ productForm: 'pipe' }));
    expect(findings.map((item) => item.code)).toContain('pqr.no_diameter');
    expect(reviewRecord(samplePqr({ productForm: 'pipe', outsideDiameter: inches('6') }))).toEqual(
      [],
    );
  });

  it('records a deficiency for a toughness coupon with no impacts', () => {
    const findings = reviewRecord(samplePqr({ toughnessRequired: true }));
    expect(findings.map((item) => item.code)).toEqual(['pqr.toughness_untested']);
    expect(isAcceptable(findings)).toBe(true);
  });

  it('refuses a record certified before the coupon was welded', () => {
    const findings = reviewRecord(samplePqr({ certifiedOn: date('2024-03-01') }));
    expect(findings.map((item) => item.code)).toContain('pqr.certified_before_welded');
  });

  it('refuses a coupon witnessed by the welder who ran it', () => {
    const findings = reviewRecord(samplePqr({ witnessedBy: 'W-118' }));
    expect(findings.map((item) => item.code)).toContain('pqr.witnessed_by_welder');
  });
});
