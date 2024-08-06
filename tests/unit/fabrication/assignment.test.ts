import { describe, expect, it } from 'vitest';

import { Interval } from '../../../src/core/interval.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  assess,
  jointRequirement,
  procedureReachesJoint,
  reasonsRefused,
  type AssignmentQuestion,
} from '../../../src/fabrication/assignment.js';
import type { RegisterEntry } from '../../../src/personnel/register.js';
import { sampleJoint } from '../../support/joints.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';
import { sampleWps } from '../../support/wps.js';

const entry = (overrides: Partial<RegisterEntry> = {}): RegisterEntry => ({
  qualification: sampleQualification({ backing: false }),
  couponPNumber: '1',
  usageDates: [date('2024-06-20')],
  ...overrides,
});

const question = (overrides: Partial<AssignmentQuestion> = {}): AssignmentQuestion => ({
  joint: sampleJoint(),
  procedure: sampleWps(),
  records: [samplePqr()],
  welder: sampleWelder(),
  entries: [entry()],
  process: 'SMAW',
  consumable: 'E7018-1/8',
  on: date('2024-07-02'),
  ...overrides,
});

describe('everything agreeing', () => {
  it('lets the welder on the joint', () => {
    const answer = assess(question());
    expect(answer.findings).toEqual([]);
    expect(answer.allowed).toBe(true);
  });
});

describe('the procedure', () => {
  it('has to be in force on the day', () => {
    const answer = assess(question({ on: date('2024-03-01') }));
    expect(reasonsRefused(answer)[0]).toMatch(/not in force on 2024-03-01/);
  });

  it('has to be supported by a record that reaches as far as it claims', () => {
    const answer = assess(question({ records: [] }));
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.code)).toContain('support.no_records');
  });

  it('has to reach the joint even when it is perfectly well supported', () => {
    const narrow = sampleWps({ positions: ['flat', 'horizontal'] });
    const answer = assess(question({ procedure: narrow }));
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.code)).toContain('assign.position');
    expect(answer.findings.map((item) => item.code)).not.toContain('support.no_records');
  });

  it('has to cover the base metal on both sides of the joint', () => {
    const findings = procedureReachesJoint(
      sampleWps(),
      sampleJoint({ baseMetalRight: 'SA-240 304L' }),
      'SMAW',
    );
    expect(findings.map((item) => item.message)).toContain('the procedure does not offer P-No 8');
  });

  it('has to cover the thickness', () => {
    const findings = procedureReachesJoint(
      sampleWps({ baseMetalThickness: Interval.closed(inches('0.0625'), inches('0.25')) }),
      sampleJoint(),
      'SMAW',
    );
    expect(findings.map((item) => item.code)).toContain('assign.thickness');
  });

  it('has to be written for the same kind of weld', () => {
    const findings = procedureReachesJoint(
      sampleWps({ weldType: 'fillet' }),
      sampleJoint(),
      'SMAW',
    );
    expect(findings.map((item) => item.code)).toContain('assign.weld_type');
  });

  it('has to offer the process being asked for', () => {
    const findings = procedureReachesJoint(sampleWps(), sampleJoint(), 'GTAW');
    expect(findings.map((item) => item.code)).toContain('assign.process');
  });
});

describe('the welder', () => {
  it('has to hold a coupon that reaches the joint', () => {
    const answer = assess(question({ joint: sampleJoint({ position: 'overhead' }) }));
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.code)).toContain('register.out_of_scope');
    expect(answer.findings.map((item) => item.code)).not.toContain('assign.position');
  });

  it('has to have welded a coupon without backing to take an open root joint', () => {
    const answer = assess(question({ entries: [entry({ qualification: sampleQualification() })] }));
    expect(answer.allowed).toBe(false);
    expect(reasonsRefused(answer).join(' ')).toMatch(/welded onto backing and the joint has none/);
  });

  it('has to be in continuity', () => {
    const answer = assess(
      question({ entries: [entry({ usageDates: [] })], on: date('2024-09-01') }),
    );
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.code)).toContain('continuity.lapsed');
  });

  it('has to be on the books', () => {
    const answer = assess(
      question({ welder: sampleWelder({ employedUntil: date('2024-06-30') }) }),
    );
    expect(answer.findings.map((item) => item.code)).toContain('register.not_employed');
  });
});

describe('the consumable', () => {
  it('has to be on the standing list for the pair of metals', () => {
    const answer = assess(question({ consumable: 'ER308L' }));
    expect(answer.allowed).toBe(false);
    expect(reasonsRefused(answer)[0]).toMatch(/not on the standing list/);
  });

  it('takes the third alloy on a dissimilar joint', () => {
    const dissimilar = sampleJoint({ baseMetalRight: 'SA-240 304L' });
    const answer = assess(question({ joint: dissimilar, consumable: 'E309L-16' }));
    expect(answer.findings.map((item) => item.code)).not.toContain('assign.consumable');
  });
});

describe('building the joint requirement', () => {
  it('reads backing off the construction type', () => {
    expect(jointRequirement(sampleJoint({ type: 2 }), 'SMAW', 4, 'uphill').backing).toBe(true);
    expect(jointRequirement(sampleJoint({ type: 1 }), 'SMAW', 4, 'uphill').backing).toBe(false);
  });

  it('carries the pipe diameter through and leaves it out for plate', () => {
    expect(jointRequirement(sampleJoint(), 'SMAW', 4, 'uphill').outsideDiameter).toBeUndefined();
    expect(
      jointRequirement(
        sampleJoint({ productForm: 'pipe', outsideDiameter: inches('6') }),
        'SMAW',
        4,
        'uphill',
      ).outsideDiameter?.toFraction(),
    ).toBe('6');
  });
});

describe('several things wrong at once', () => {
  it('reports all of them rather than the first', () => {
    const answer = assess(
      question({
        joint: sampleJoint({ position: 'overhead', baseMetalRight: 'SA-240 304L' }),
        consumable: 'ER308L',
        records: [],
      }),
    );
    const codes = answer.findings.map((item) => item.code);
    expect(codes).toContain('support.no_records');
    expect(codes).toContain('assign.base_metal');
    expect(codes).toContain('register.out_of_scope');
    expect(codes).toContain('assign.consumable');
  });
});
