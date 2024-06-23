import { fNumbersQualifiedBy } from '../codes/fnumber.js';
import {
  coversProductForm,
  positionsQualifiedBy,
  progressionCovers,
  type ProductForm,
  type ProductionPosition,
  type Progression,
  type WeldType,
} from '../codes/position.js';
import {
  coversThickness,
  qualifiedDepositThickness,
  qualifiedDiameter,
  type PerformanceCoupon,
} from '../codes/performanceRange.js';
import type { ProcessCode } from '../codes/process.js';
import type { Interval } from '../core/interval.js';
import type { Length } from '../core/units.js';
import type { PerformanceQualification } from './welder.js';

/**
 * What a welder's coupon lets them weld.
 *
 * Base metal almost falls out of the question here. For a welder the ferrous
 * and nickel families are one big group, because the skill of laying metal
 * into a joint does not change much between them. That is the opposite of the
 * procedure rules, and running the two together is how a shop ends up with a
 * welder register that is far more restrictive than it needs to be.
 *
 * What does matter is backing. A coupon welded onto backing proves nothing
 * about holding a root open over an air gap, so it qualifies backed joints
 * only. A coupon welded without backing qualifies both, and that asymmetry
 * catches out every shop that tries to save a coupon.
 */

/** Base metal families that are one group as far as a welder is concerned. */
const PERFORMANCE_GROUP: readonly string[] = [
  '1',
  '3',
  '4',
  '5A',
  '5B',
  '5C',
  '9A',
  '9B',
  '11A',
  '15E',
  '41',
  '42',
  '43',
  '45',
  '6',
  '7',
  '8',
  '10H',
];

const ALUMINIUM_GROUP: readonly string[] = ['21', '22', '23'];

export interface PerformanceScope {
  readonly process: ProcessCode;
  readonly pNumbers: readonly string[];
  readonly fNumbers: readonly number[];
  readonly positions: readonly ProductionPosition[];
  readonly filletPositions: readonly ProductionPosition[];
  readonly depositThickness: Interval<Length>;
  readonly diameter: Interval<Length>;
  readonly backedJointsOnly: boolean;
  readonly progression: Progression;
}

export function couponOf(qualification: PerformanceQualification): PerformanceCoupon {
  return {
    depositThickness: qualification.depositThickness,
    layers: qualification.layers,
    productForm: qualification.productForm,
    outsideDiameter: qualification.outsideDiameter,
  };
}

export function performanceBaseMetals(pNumber: string): readonly string[] {
  if (ALUMINIUM_GROUP.includes(pNumber)) {
    return ALUMINIUM_GROUP;
  }
  return PERFORMANCE_GROUP.includes(pNumber) ? PERFORMANCE_GROUP : [pNumber];
}

export function scopeOf(
  qualification: PerformanceQualification,
  couponPNumber: string,
): PerformanceScope {
  const coupon = couponOf(qualification);
  return {
    process: qualification.process,
    pNumbers: performanceBaseMetals(couponPNumber),
    fNumbers: fNumbersQualifiedBy(qualification.fNumber, qualification.process),
    positions: positionsQualifiedBy(qualification.position, qualification.weldType),
    filletPositions: positionsQualifiedBy(qualification.position, 'fillet'),
    depositThickness: qualifiedDepositThickness(coupon),
    diameter: qualifiedDiameter(coupon),
    backedJointsOnly: qualification.backing,
    progression: qualification.verticalProgression,
  };
}

export interface JointRequirement {
  readonly process: ProcessCode;
  readonly weldType: WeldType;
  readonly productForm: ProductForm;
  readonly position: ProductionPosition;
  readonly progression: Progression;
  readonly fNumber: number;
  readonly pNumber: string;
  readonly depositThickness: Length;
  readonly backing: boolean;
  readonly outsideDiameter?: Length;
}

export interface ScopeMiss {
  readonly field: string;
  readonly detail: string;
}

/**
 * Everything about the joint the coupon does not reach, rather than the first
 * thing. A coordinator who has to move a welder wants the whole list.
 */
export function scopeMisses(
  qualification: PerformanceQualification,
  couponPNumber: string,
  joint: JointRequirement,
): readonly ScopeMiss[] {
  const scope = scopeOf(qualification, couponPNumber);
  const misses: ScopeMiss[] = [];

  if (scope.process !== joint.process) {
    misses.push({
      field: 'process',
      detail: `qualified on ${scope.process} and the joint is ${joint.process}`,
    });
  }
  if (!scope.pNumbers.includes(joint.pNumber)) {
    misses.push({
      field: 'base metal',
      detail: `P-No ${joint.pNumber} is outside the group the coupon covers`,
    });
  }
  if (!scope.fNumbers.includes(joint.fNumber)) {
    misses.push({
      field: 'filler',
      detail: `F-No ${joint.fNumber} is outside F-No ${scope.fNumbers.join('/')}`,
    });
  }
  const positions = joint.weldType === 'fillet' ? scope.filletPositions : scope.positions;
  if (!positions.includes(joint.position)) {
    misses.push({
      field: 'position',
      detail: `the ${joint.position} position is outside ${positions.join(', ') || 'nothing'}`,
    });
  }
  if (!progressionCovers(scope.progression, joint.progression, joint.position)) {
    misses.push({
      field: 'progression',
      detail: `qualified ${scope.progression} and the joint is ${joint.progression}`,
    });
  }
  if (!coversProductForm(qualification.productForm, joint.productForm)) {
    if (
      !(
        joint.productForm === 'pipe' &&
        joint.outsideDiameter !== undefined &&
        scope.diameter.contains(joint.outsideDiameter)
      )
    ) {
      misses.push({
        field: 'product form',
        detail: `qualified on ${qualification.productForm} and the joint is ${joint.productForm}`,
      });
    }
  } else if (
    joint.productForm === 'pipe' &&
    qualification.productForm === 'pipe' &&
    joint.outsideDiameter !== undefined &&
    !scope.diameter.contains(joint.outsideDiameter)
  ) {
    misses.push({
      field: 'diameter',
      detail: `${joint.outsideDiameter.toFraction()} inch pipe is outside ${scope.diameter.toString()}`,
    });
  }
  if (!coversThickness(couponOf(qualification), joint.depositThickness)) {
    misses.push({
      field: 'thickness',
      detail: `${joint.depositThickness.toFraction()} of deposit is outside ${scope.depositThickness.toString()}`,
    });
  }
  if (scope.backedJointsOnly && !joint.backing) {
    misses.push({
      field: 'backing',
      detail: 'the coupon was welded onto backing and the joint has none',
    });
  }
  return misses;
}

export function scopeCovers(
  qualification: PerformanceQualification,
  couponPNumber: string,
  joint: JointRequirement,
): boolean {
  return scopeMisses(qualification, couponPNumber, joint).length === 0;
}
