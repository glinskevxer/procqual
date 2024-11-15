import type { ProductForm, ProductionPosition, WeldType } from '../codes/position.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import type { Length } from '../core/units.js';
import { baseMetal } from '../materials/baseMetal.js';

/**
 * Joints on a vessel, and the two facts about each one that everything else
 * reads.
 *
 * The category says where the joint sits in the vessel: a longitudinal seam in
 * a shell course, a circumferential seam, a nozzle attachment. The type says
 * how it is made: welded from both sides, welded from one side onto a backing
 * strip left in place, and so on.
 *
 * Neither of those is a quality judgement on its own. Together with how much
 * radiography the joint gets they decide the joint efficiency, which goes
 * straight into the thickness calculation for the whole vessel. A joint
 * downgraded from full radiography to spot on a Friday afternoon makes the
 * shell too thin, and the only place that shows up is this table.
 */

export type JointCategory = 'A' | 'B' | 'C' | 'D';

export type RadiographyLevel = 'full' | 'spot' | 'none';

/** Construction types, in the order the code lists them. */
export const JOINT_TYPES = [1, 2, 3, 4, 5, 6, 7] as const;

export type JointType = (typeof JOINT_TYPES)[number];

export interface JointTypeFacts {
  readonly type: JointType;
  readonly description: string;
  readonly weldedBothSides: boolean;
  readonly backingRemoved: boolean;
  /** Categories this construction may be used on at all. */
  readonly categories: readonly JointCategory[];
}

const TYPE_FACTS: Readonly<Record<JointType, JointTypeFacts>> = {
  1: {
    type: 1,
    description: 'butt joint welded from both sides',
    weldedBothSides: true,
    backingRemoved: true,
    categories: ['A', 'B', 'C', 'D'],
  },
  2: {
    type: 2,
    description: 'single welded butt joint with a backing strip left in place',
    weldedBothSides: false,
    backingRemoved: false,
    categories: ['A', 'B', 'C', 'D'],
  },
  3: {
    type: 3,
    description: 'single welded butt joint with no backing strip',
    weldedBothSides: false,
    backingRemoved: true,
    categories: ['A', 'B'],
  },
  4: {
    type: 4,
    description: 'double full fillet lap joint',
    weldedBothSides: true,
    backingRemoved: true,
    categories: ['B', 'C'],
  },
  5: {
    type: 5,
    description: 'single full fillet lap joint with plug welds',
    weldedBothSides: false,
    backingRemoved: true,
    categories: ['B', 'C'],
  },
  6: {
    type: 6,
    description: 'single full fillet lap joint without plug welds',
    weldedBothSides: false,
    backingRemoved: true,
    categories: ['A', 'B'],
  },
  7: {
    type: 7,
    description: 'corner joint, full penetration',
    weldedBothSides: false,
    backingRemoved: true,
    categories: ['C', 'D'],
  },
};

/**
 * Joint efficiency by construction type and how much radiography the joint
 * actually received. The blank entries are combinations the code does not
 * permit at all, which is a different answer from an efficiency of zero.
 */
const EFFICIENCY: Readonly<Record<JointType, Readonly<Record<RadiographyLevel, number | null>>>> = {
  1: { full: 1.0, spot: 0.85, none: 0.7 },
  2: { full: 0.9, spot: 0.8, none: 0.65 },
  3: { full: null, spot: null, none: 0.6 },
  4: { full: null, spot: null, none: 0.55 },
  5: { full: null, spot: null, none: 0.5 },
  6: { full: null, spot: null, none: 0.45 },
  7: { full: null, spot: null, none: 0.45 },
};

export interface Joint {
  readonly id: string;
  readonly vessel: string;
  readonly description: string;
  readonly category: JointCategory;
  readonly type: JointType;
  readonly weldType: WeldType;
  readonly productForm: ProductForm;
  readonly position: ProductionPosition;
  readonly thickness: Length;
  readonly lengthOfWeld: Length;
  readonly outsideDiameter?: Length | undefined;
  readonly baseMetalLeft: string;
  readonly baseMetalRight: string;
  readonly heatLeft: string;
  readonly heatRight: string;
  readonly procedure: DocumentNumber;
  readonly radiography: RadiographyLevel;
}

export function jointTypeFacts(type: JointType): JointTypeFacts {
  const facts = TYPE_FACTS[type];
  if (facts === undefined) {
    throw new ValidationError('type', `not a joint construction type: ${type}`, { type });
  }
  return facts;
}

export function isJointType(value: number): value is JointType {
  return (JOINT_TYPES as readonly number[]).includes(value);
}

export function parseJointCategory(value: string): JointCategory {
  const upper = value.trim().toUpperCase();
  if (upper !== 'A' && upper !== 'B' && upper !== 'C' && upper !== 'D') {
    throw new ValidationError('category', `not a joint category: ${value}`, { value });
  }
  return upper;
}

export function categoryAllows(type: JointType, category: JointCategory): boolean {
  return jointTypeFacts(type).categories.includes(category);
}

/**
 * The efficiency, or undefined when the code does not permit that construction
 * to be examined that way at all.
 */
export function jointEfficiency(
  type: JointType,
  radiography: RadiographyLevel,
): number | undefined {
  return EFFICIENCY[type][radiography] ?? undefined;
}

/**
 * The best efficiency a construction can reach, which is what a designer sizes
 * the shell against before anyone decides how much radiography to buy.
 */
export function bestEfficiency(type: JointType): number {
  const row = EFFICIENCY[type];
  return Math.max(...(['full', 'spot', 'none'] as const).map((level) => row[level] ?? 0));
}

export function reviewJoint(joint: Joint): readonly Finding[] {
  const findings: Finding[] = [];
  if (!categoryAllows(joint.type, joint.category)) {
    findings.push(
      blocking(
        'joint.type_not_allowed',
        `a type ${joint.type} joint is not permitted on category ${joint.category}`,
        { clause: 'UW-12', subject: joint.id },
      ),
    );
  }
  if (jointEfficiency(joint.type, joint.radiography) === undefined) {
    findings.push(
      blocking(
        'joint.examination_not_permitted',
        `a type ${joint.type} joint cannot be credited with ${joint.radiography} radiography`,
        { clause: 'UW-12', subject: joint.id },
      ),
    );
  }
  if (!joint.thickness.toInches().isPositive()) {
    findings.push(
      blocking('joint.no_thickness', 'the joint records no thickness', { subject: joint.id }),
    );
  }
  if (joint.productForm === 'pipe' && joint.outsideDiameter === undefined) {
    findings.push(
      blocking('joint.no_diameter', 'a pipe joint has to record its outside diameter', {
        subject: joint.id,
      }),
    );
  }
  if (baseMetal(joint.baseMetalLeft).pNumber !== baseMetal(joint.baseMetalRight).pNumber) {
    findings.push(
      deficiency(
        'joint.dissimilar',
        'the joint puts two base metal families together, so check the filler against the standing answer for that pair',
        { subject: joint.id },
      ),
    );
  }
  if (joint.heatLeft.trim() === '' || joint.heatRight.trim() === '') {
    findings.push(
      blocking('joint.untraceable', 'the joint does not name a heat on both sides', {
        subject: joint.id,
      }),
    );
  }
  return findings;
}

export function describeJoint(joint: Joint): string {
  const efficiency = jointEfficiency(joint.type, joint.radiography);
  return `${joint.id} category ${joint.category} type ${joint.type}, ${joint.radiography} radiography, efficiency ${efficiency === undefined ? 'not permitted' : efficiency.toFixed(2)}`;
}
