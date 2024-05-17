import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { inches } from '../../../src/core/units.js';
import {
  blockers,
  evaluateCoupon,
  outstandingWork,
  summariseVerdict,
} from '../../../src/qualification/evaluation.js';
import { samplePqr } from '../../support/pqr.js';
import { passingBends, passingImpacts, passingTensiles } from '../../support/specimens.js';
import { baseVariables } from '../../support/variables.js';

const goodCoupon = () =>
  samplePqr({
    tests: {
      tensile: passingTensiles(),
      bends: passingBends(),
      impacts: [],
      hardness: [],
    },
  });

describe('a coupon that passed', () => {
  it('is accepted with nothing outstanding', () => {
    const verdict = evaluateCoupon(goodCoupon());
    expect(verdict.accepted).toBe(true);
    expect(verdict.counts.blocking).toBe(0);
    expect(verdict.counts.deficiency).toBe(0);
  });

  it('reports the tensile results it worked out', () => {
    const verdict = evaluateCoupon(goodCoupon());
    expect(verdict.tensileResults).toHaveLength(2);
    expect(verdict.tensileResults[0]?.strengthKsi.toString()).toBe('74.6667');
  });

  it('summarises in one line', () => {
    expect(summariseVerdict(evaluateCoupon(goodCoupon()))).toBe('PQR-0042 accepted');
  });

  it('carries the plan it graded against', () => {
    const verdict = evaluateCoupon(goodCoupon());
    expect(verdict.plan.tensileCount).toBe(2);
    expect(verdict.plan.bends?.total).toBe(4);
  });
});

describe('every check runs, not just the first to fail', () => {
  it('reports the tensile failure and the bend failure together', () => {
    const record = samplePqr({
      tests: {
        tensile: [
          {
            ...passingTensiles()[0]!,
            ultimateLoadPounds: decimal('15000'),
            failureLocation: 'weld',
          },
          { ...passingTensiles()[1]!, id: 'T2' },
        ],
        bends: [
          {
            id: 'B1',
            type: 'face',
            discontinuities: [{ location: 'weld', size: inches('0.25'), fusionRelated: true }],
          },
        ],
        impacts: [],
        hardness: [],
      },
    });
    const codes = evaluateCoupon(record).findings.map((item) => item.code);
    expect(codes).toContain('tensile.below_minimum');
    expect(codes).toContain('bend.open_discontinuity');
    expect(codes).toContain('bend.too_few_specimens');
  });

  it('sorts the blocking findings to the front', () => {
    const record = samplePqr({
      tests: {
        tensile: passingTensiles(),
        bends: [],
        impacts: [],
        hardness: [],
      },
    });
    const verdict = evaluateCoupon(record);
    expect(verdict.findings[0]?.severity).toBe('blocking');
    expect(blockers(verdict).length).toBeGreaterThan(0);
    expect(summariseVerdict(verdict)).toMatch(/rejected on \d+/);
  });
});

describe('what the toughness answer adds', () => {
  it('grades no impacts at all when none were called for', () => {
    const record = samplePqr({
      tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    });
    expect(evaluateCoupon(record).findings.map((item) => item.code)).not.toContain(
      'impact.no_sets',
    );
  });

  it('asks for them when they were', () => {
    const record = samplePqr({
      toughnessRequired: true,
      tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    });
    const verdict = evaluateCoupon(record);
    expect(outstandingWork(verdict).map((item) => item.code)).toContain('pqr.toughness_untested');
    expect(verdict.findings.map((item) => item.code)).toContain('impact.no_sets');
    expect(verdict.accepted).toBe(true);
    expect(summariseVerdict(verdict)).toMatch(/accepted with \d+ outstanding/);
  });

  it('accepts a toughness coupon that carries its sets', () => {
    const record = samplePqr({
      toughnessRequired: true,
      tests: {
        tensile: passingTensiles(),
        bends: passingBends(),
        impacts: passingImpacts(),
        hardness: [],
      },
    });
    const verdict = evaluateCoupon(record);
    expect(verdict.accepted).toBe(true);
    expect(verdict.counts.deficiency).toBe(0);
  });
});

describe('a dissimilar joint', () => {
  it('is graded against its softer side', () => {
    const record = samplePqr({
      baseMetalRight: 'SA-106 Gr B',
      tests: {
        tensile: [
          {
            ...passingTensiles()[0]!,
            ultimateLoadPounds: decimal('17500'),
            failureLocation: 'weld',
          },
          {
            ...passingTensiles()[1]!,
            ultimateLoadPounds: decimal('17500'),
            failureLocation: 'weld',
          },
        ],
        bends: passingBends(),
        impacts: [],
        hardness: [],
      },
    });
    expect(evaluateCoupon(record).accepted).toBe(true);

    const matched = samplePqr({ ...record, baseMetalRight: 'SA-516 Gr 70' });
    expect(evaluateCoupon(matched).accepted).toBe(false);
  });
});

describe('what the family adds', () => {
  it('asks for a hardness traverse on a chrome moly coupon', () => {
    const record = samplePqr({
      layers: [
        {
          ...baseVariables(),
          baseMetal: { ...baseVariables().baseMetal, pNumber: '4', groupNumber: 1 },
        },
      ],
      tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
    });
    const codes = evaluateCoupon(record).findings.map((item) => item.code);
    expect(codes).toContain('hardness.no_survey');
  });

  it('asks for one on any family in sour service', () => {
    const record = goodCoupon();
    const codes = evaluateCoupon(record, { sourService: true }).findings.map((item) => item.code);
    expect(codes).toContain('hardness.no_survey');
  });
});

describe('a fillet coupon', () => {
  it('is not graded on bends it was never meant to have', () => {
    const record = samplePqr({
      weldType: 'fillet',
      tests: { tensile: [], bends: [], impacts: [], hardness: [] },
    });
    const codes = evaluateCoupon(record).findings.map((item) => item.code);
    expect(codes).not.toContain('bend.too_few_specimens');
    expect(codes).toContain('tensile.too_few_specimens');
  });
});
