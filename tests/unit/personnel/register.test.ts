import { describe, expect, it } from 'vitest';

import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  assessEntry,
  canWeld,
  eligibleWelders,
  processesHeld,
  type RegisterEntry,
} from '../../../src/personnel/register.js';
import type { JointRequirement } from '../../../src/personnel/scope.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';

const joint = (overrides: Partial<JointRequirement> = {}): JointRequirement => ({
  process: 'SMAW',
  weldType: 'groove',
  productForm: 'plate',
  position: 'vertical',
  progression: 'uphill',
  fNumber: 4,
  pNumber: '1',
  depositThickness: inches('1/2'),
  backing: true,
  ...overrides,
});

const entry = (overrides: Partial<RegisterEntry> = {}): RegisterEntry => ({
  qualification: sampleQualification(),
  couponPNumber: '1',
  usageDates: [date('2024-05-02')],
  ...overrides,
});

const today = date('2024-06-01');

describe('the plain answer', () => {
  it('lets a current welder with a wide enough coupon on the joint', () => {
    const answer = canWeld({
      welder: sampleWelder(),
      entries: [entry()],
      joint: joint(),
      on: today,
    });
    expect(answer.allowed).toBe(true);
    expect(answer.used?.number.toString()).toBe('WPQ-0231');
    expect(answer.findings).toEqual([]);
  });
});

describe('the three ways it says no', () => {
  it('refuses a welder who has left', () => {
    const answer = canWeld({
      welder: sampleWelder({ employedUntil: date('2024-05-01') }),
      entries: [entry()],
      joint: joint(),
      on: today,
    });
    expect(answer.findings.map((item) => item.code)).toEqual(['register.not_employed']);
  });

  it('refuses a welder with no coupon at all', () => {
    const answer = canWeld({
      welder: sampleWelder({ stencil: 'W-999' }),
      entries: [entry()],
      joint: joint(),
      on: today,
    });
    expect(answer.findings.map((item) => item.code)).toEqual(['register.no_qualification']);
  });

  it('refuses a welder whose clock has run out', () => {
    const answer = canWeld({
      welder: sampleWelder(),
      entries: [entry({ usageDates: [] })],
      joint: joint(),
      on: date('2024-09-01'),
    });
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.code)).toContain('continuity.lapsed');
  });

  it('refuses a welder whose coupon does not reach the joint', () => {
    const answer = canWeld({
      welder: sampleWelder(),
      entries: [entry()],
      joint: joint({ position: 'overhead' }),
      on: today,
    });
    expect(answer.allowed).toBe(false);
    expect(answer.findings[0]?.message).toMatch(/^position:/);
  });
});

describe('several coupons', () => {
  const gtaw = sampleQualification({
    number: DocumentNumber.parse('WPQ-0232'),
    process: 'GTAW',
    fNumber: 6,
    position: '6G',
    productForm: 'pipe',
    outsideDiameter: inches('6'),
  });

  it('takes whichever coupon covers the joint', () => {
    const answer = canWeld({
      welder: sampleWelder(),
      entries: [entry(), entry({ qualification: gtaw })],
      joint: joint({ process: 'GTAW', fNumber: 6, position: 'overhead' }),
      on: today,
    });
    expect(answer.allowed).toBe(true);
    expect(answer.used?.number.toString()).toBe('WPQ-0232');
  });

  it('reports the nearest miss when none of them covers it', () => {
    const answer = canWeld({
      welder: sampleWelder(),
      entries: [entry(), entry({ qualification: gtaw })],
      joint: joint({ position: 'overhead' }),
      on: today,
    });
    expect(answer.allowed).toBe(false);
    expect(answer.findings.map((item) => item.subject?.includes('WPQ-0231'))).toContain(true);
  });

  it('assesses each coupon on its own', () => {
    const assessment = assessEntry(entry(), joint({ position: 'overhead' }), today);
    expect(assessment.allowed).toBe(false);
    expect(assessment.misses).toHaveLength(1);
    expect(assessment.continuity.state).toBe('current');
  });
});

describe('finding somebody for a joint', () => {
  const welders = [
    sampleWelder({ stencil: 'W-118' }),
    sampleWelder({ stencil: 'W-205', name: 'T Naylor' }),
    sampleWelder({ stencil: 'W-090', name: 'D Cope' }),
  ];
  const entries = [
    entry(),
    entry({
      qualification: sampleQualification({
        stencil: 'W-205',
        position: '6G',
        productForm: 'pipe',
        outsideDiameter: inches('6'),
      }),
    }),
    entry({
      qualification: sampleQualification({ stencil: 'W-090', position: '1G' }),
    }),
  ];

  it('lists everyone who can run it, in stencil order', () => {
    const found = eligibleWelders(welders, entries, joint(), today);
    expect(found.map((welder) => welder.stencil)).toEqual(['W-118', 'W-205']);
  });

  it('finds nobody for a joint none of them reaches', () => {
    expect(eligibleWelders(welders, entries, joint({ process: 'SAW' }), today)).toEqual([]);
  });

  it('lists the processes a welder currently holds', () => {
    const held = processesHeld(
      [entry(), entry({ qualification: sampleQualification({ process: 'GTAW', fNumber: 6 }) })],
      'W-118',
      today,
    );
    expect(held).toEqual(['GTAW', 'SMAW']);
  });

  it('leaves a lapsed process off the held list', () => {
    const held = processesHeld([entry({ usageDates: [] })], 'W-118', date('2024-09-01'));
    expect(held).toEqual([]);
  });
});
