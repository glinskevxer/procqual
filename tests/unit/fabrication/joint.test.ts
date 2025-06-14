import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  bestEfficiency,
  categoryAllows,
  describeJoint,
  isJointType,
  jointEfficiency,
  jointTypeFacts,
  JOINT_TYPES,
  parseJointCategory,
  parseJointType,
  parseRadiographyLevel,
  reviewJoint,
} from '../../../src/fabrication/joint.js';
import { sampleJoint } from '../../support/joints.js';

describe('categories and types', () => {
  it('parses a category letter', () => {
    expect(parseJointCategory(' b ')).toBe('B');
    expect(() => parseJointCategory('E')).toThrow(ValidationError);
  });

  it('describes every construction type', () => {
    for (const type of JOINT_TYPES) {
      expect(jointTypeFacts(type).description.length).toBeGreaterThan(0);
      expect(isJointType(type)).toBe(true);
    }
    expect(isJointType(8)).toBe(false);
    expect(() => jointTypeFacts(8 as never)).toThrow(ValidationError);
  });

  it('knows which constructions each category will take', () => {
    expect(categoryAllows(1, 'A')).toBe(true);
    expect(categoryAllows(3, 'C')).toBe(false);
    expect(categoryAllows(7, 'D')).toBe(true);
    expect(categoryAllows(7, 'A')).toBe(false);
  });
});

describe('reading a level and a type off a form', () => {
  it('reads an examination level in any case', () => {
    expect(parseRadiographyLevel('FULL')).toBe('full');
    expect(parseRadiographyLevel(' spot ')).toBe('spot');
    expect(() => parseRadiographyLevel('partial')).toThrow(/not an examination level/);
  });

  it('reads a construction type from a number or a string', () => {
    expect(parseJointType('1')).toBe(1);
    expect(parseJointType(7)).toBe(7);
    expect(() => parseJointType('8')).toThrow(/not a joint construction type/);
    expect(() => parseJointType('butt')).toThrow(ValidationError);
  });
});

describe('joint efficiency', () => {
  it('rewards a double welded butt joint fully radiographed', () => {
    expect(jointEfficiency(1, 'full')).toBe(1);
  });

  it('drops it as the examination drops', () => {
    expect(jointEfficiency(1, 'spot')).toBe(0.85);
    expect(jointEfficiency(1, 'none')).toBe(0.7);
  });

  it('never lets a single welded joint reach the same figure', () => {
    expect(jointEfficiency(2, 'full')).toBeLessThan(jointEfficiency(1, 'full') ?? 0);
  });

  it('reports nothing at all for a construction that cannot be credited that way', () => {
    expect(jointEfficiency(3, 'full')).toBeUndefined();
    expect(jointEfficiency(4, 'spot')).toBeUndefined();
    expect(jointEfficiency(3, 'none')).toBe(0.6);
  });

  it('reports the best a construction can reach', () => {
    expect(bestEfficiency(1)).toBe(1);
    expect(bestEfficiency(3)).toBe(0.6);
    expect(bestEfficiency(7)).toBe(0.45);
  });

  it('never rates a later type above an earlier one at its best', () => {
    for (let index = 1; index < JOINT_TYPES.length; index += 1) {
      const earlier = JOINT_TYPES[index - 1]!;
      const later = JOINT_TYPES[index]!;
      expect(bestEfficiency(later)).toBeLessThanOrEqual(bestEfficiency(earlier));
    }
  });
});

describe('reviewing a joint', () => {
  it('passes a clean one', () => {
    expect(reviewJoint(sampleJoint())).toEqual([]);
  });

  it('refuses a construction the category will not take', () => {
    const findings = reviewJoint(sampleJoint({ category: 'C', type: 3 }));
    expect(findings.map((item) => item.code)).toContain('joint.type_not_allowed');
  });

  it('refuses radiography credit the construction cannot carry', () => {
    const findings = reviewJoint(sampleJoint({ type: 3, radiography: 'full' }));
    expect(findings.map((item) => item.code)).toContain('joint.examination_not_permitted');
  });

  it('wants a thickness and a diameter where one applies', () => {
    expect(reviewJoint(sampleJoint({ thickness: inches('0') })).map((item) => item.code)).toContain(
      'joint.no_thickness',
    );
    expect(reviewJoint(sampleJoint({ productForm: 'pipe' })).map((item) => item.code)).toContain(
      'joint.no_diameter',
    );
  });

  it('notes a joint between two families without blocking it', () => {
    const findings = reviewJoint(sampleJoint({ baseMetalRight: 'SA-240 304L' }));
    const note = findings.find((item) => item.code === 'joint.dissimilar');
    expect(note?.severity).toBe('deficiency');
  });

  it('refuses a joint with no heat on one side', () => {
    expect(reviewJoint(sampleJoint({ heatRight: '  ' })).map((item) => item.code)).toContain(
      'joint.untraceable',
    );
  });
});

describe('describing a joint', () => {
  it('puts the efficiency on the line', () => {
    expect(describeJoint(sampleJoint())).toBe(
      'J-14 category A type 1, full radiography, efficiency 1.00',
    );
  });

  it('says so when the combination is not permitted', () => {
    expect(describeJoint(sampleJoint({ type: 4, category: 'B', radiography: 'spot' }))).toContain(
      'not permitted',
    );
  });
});
