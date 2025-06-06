import { describe, expect, it } from 'vitest';

import { inches } from '../../../src/core/units.js';
import {
  describeRow,
  designedEfficiency,
  efficiencyFindings,
  reviewEfficiencies,
  reviewJointEfficiency,
  thicknessPenaltyPercent,
  worthExamining,
} from '../../../src/reporting/efficiencyReview.js';
import { sampleJoint } from '../../support/joints.js';

describe('what a construction could carry', () => {
  it('is the best its type can reach', () => {
    expect(designedEfficiency(sampleJoint())).toBe(1);
    expect(designedEfficiency(sampleJoint({ type: 2 }))).toBe(0.9);
    expect(designedEfficiency(sampleJoint({ type: 3 }))).toBe(0.6);
  });
});

describe('one joint', () => {
  it('carries everything when it is fully radiographed', () => {
    const row = reviewJointEfficiency(sampleJoint());
    expect(row.achieved).toBe(1);
    expect(row.shortfall.toString()).toBe('0');
    expect(efficiencyFindings([row])).toEqual([]);
  });

  it('falls short when the examination was cut back', () => {
    const row = reviewJointEfficiency(sampleJoint({ radiography: 'spot' }));
    expect(row.achieved).toBe(0.85);
    expect(row.shortfall.toString()).toBe('0.15');
    expect(thicknessPenaltyPercent(row)?.toString()).toBe('17.7');
  });

  it('says how much more section that costs', () => {
    const findings = efficiencyFindings([
      reviewJointEfficiency(sampleJoint({ radiography: 'none' })),
    ]);
    expect(findings[0]?.message).toContain('0.70 against 1.00 available');
    expect(findings[0]?.message).toContain('about 42.9 percent more section');
  });

  it('reads the level the code forces rather than the one on the drawing', () => {
    const thick = sampleJoint({ thickness: inches('2'), radiography: 'spot' });
    const row = reviewJointEfficiency(thick);
    expect(row.examinationApplied).toBe('full');
    expect(row.achieved).toBe(1);
  });

  it('reads lethal service the same way', () => {
    const row = reviewJointEfficiency(sampleJoint({ radiography: 'none' }), true);
    expect(row.examinationApplied).toBe('full');
    expect(row.shortfall.toString()).toBe('0');
  });

  it('blocks a construction that carries no efficiency at all', () => {
    const row = reviewJointEfficiency(sampleJoint({ type: 3, radiography: 'full' }));
    expect(row.achieved).toBeUndefined();
    expect(thicknessPenaltyPercent(row)).toBeUndefined();
    expect(efficiencyFindings([row])[0]?.severity).toBe('blocking');
  });

  it('reads back in one line', () => {
    expect(describeRow(reviewJointEfficiency(sampleJoint({ radiography: 'spot' })))).toBe(
      'J-14 SA-516 Gr 70 type 1: 0.85 of 1.00',
    );
  });
});

describe('a whole vessel', () => {
  const joints = [
    sampleJoint(),
    sampleJoint({ id: 'J-15', radiography: 'spot' }),
    sampleJoint({ id: 'J-16', radiography: 'none' }),
  ];

  it('sorts by how much is being given away', () => {
    expect(reviewEfficiencies(joints).map((row) => row.joint.id)).toEqual(['J-16', 'J-15', 'J-14']);
  });

  it('separates the joints worth buying film for from the ones that are settled', () => {
    const { worth, settled } = worthExamining(reviewEfficiencies(joints));
    expect(worth.map((row) => row.joint.id)).toEqual(['J-16', 'J-15']);
    expect(settled.map((row) => row.joint.id)).toEqual(['J-14']);
  });

  it('puts a joint with no efficiency at all in the settled list rather than the worth one', () => {
    const impossible = [sampleJoint({ type: 3, radiography: 'full' })];
    const { worth, settled } = worthExamining(reviewEfficiencies(impossible));
    expect(worth).toEqual([]);
    expect(settled).toHaveLength(1);
  });
});
