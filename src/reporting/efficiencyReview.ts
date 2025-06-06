import { type Decimal, decimal } from '../core/decimal.js';
import { blocking, deficiency, type Finding } from '../core/errors.js';
import {
  bestEfficiency,
  jointEfficiency,
  type Joint,
  type RadiographyLevel,
} from '../fabrication/joint.js';
import { baseMetal } from '../materials/baseMetal.js';
import { volumetricExtent } from '../nde/requirement.js';

/**
 * What the examination level is actually buying, joint by joint.
 *
 * The efficiency is a number in a table until somebody notices it is a
 * multiplier on the allowable stress, and therefore on the shell thickness the
 * designer sized. A joint drawn as fully radiographed and welded as spot has
 * an efficiency of 0.85 rather than 1.0, which means the shell needed to be
 * about eighteen percent thicker than it is.
 *
 * Nobody in the shop is going to redo the pressure calculation. What they can
 * do is be told which joints are not carrying the efficiency the design
 * assumed, in time to buy the extra film rather than the extra plate.
 */

export interface EfficiencyRow {
  readonly joint: Joint;
  readonly designed: number;
  readonly achieved: number | undefined;
  readonly examinationApplied: RadiographyLevel;
  readonly shortfall: Decimal;
}

/**
 * The efficiency a joint would carry if it were examined as far as its
 * construction allows, which is what a designer sizes against.
 */
export function designedEfficiency(joint: Joint): number {
  return bestEfficiency(joint.type);
}

export function reviewJointEfficiency(joint: Joint, lethalService = false): EfficiencyRow {
  const applied = volumetricExtent({ joint, lethalService, repair: false });
  const achieved = jointEfficiency(joint.type, applied);
  const designed = designedEfficiency(joint);
  const shortfall =
    achieved === undefined
      ? decimal('1')
      : decimal(String(designed))
          .subtract(decimal(String(achieved)))
          .normalized();
  return { joint, designed, achieved, examinationApplied: applied, shortfall };
}

export function reviewEfficiencies(
  joints: readonly Joint[],
  lethalService = false,
): readonly EfficiencyRow[] {
  return joints
    .map((joint) => reviewJointEfficiency(joint, lethalService))
    .sort((left, right) => right.shortfall.compare(left.shortfall));
}

/**
 * How much thicker the section would have to be to carry the same pressure at
 * the efficiency it actually has. A plain ratio, rounded to a tenth of a
 * percent, and it is a prompt to talk to the designer rather than an answer.
 */
export function thicknessPenaltyPercent(row: EfficiencyRow): Decimal | undefined {
  if (row.achieved === undefined || row.achieved === 0) {
    return undefined;
  }
  const ratio = decimal(String(row.designed)).divide(decimal(String(row.achieved)), 4);
  return ratio.subtract(decimal('1')).multiply(decimal('100')).round(1, 'half-up').normalized();
}

export function efficiencyFindings(rows: readonly EfficiencyRow[]): readonly Finding[] {
  const findings: Finding[] = [];
  for (const row of rows) {
    const subject = row.joint.id;
    if (row.achieved === undefined) {
      findings.push(
        blocking(
          'efficiency.not_permitted',
          `a type ${String(row.joint.type)} joint cannot be credited with ${row.examinationApplied} radiography, so it carries no efficiency at all`,
          { clause: 'UW-12', subject },
        ),
      );
      continue;
    }
    if (row.shortfall.isZero()) {
      continue;
    }
    const penalty = thicknessPenaltyPercent(row);
    findings.push(
      deficiency(
        'efficiency.below_design',
        `${row.achieved.toFixed(2)} against ${row.designed.toFixed(2)} available, which is about ${penalty?.toString() ?? ''} percent more section for the same pressure`,
        { clause: 'UW-12', subject },
      ),
    );
  }
  return findings;
}

/** Joints where buying more film would move the efficiency and joints where it would not. */
export function worthExamining(rows: readonly EfficiencyRow[]): {
  worth: readonly EfficiencyRow[];
  settled: readonly EfficiencyRow[];
} {
  const worth: EfficiencyRow[] = [];
  const settled: EfficiencyRow[] = [];
  for (const row of rows) {
    if (row.achieved !== undefined && row.shortfall.isPositive()) {
      worth.push(row);
    } else {
      settled.push(row);
    }
  }
  return { worth, settled };
}

export function describeRow(row: EfficiencyRow): string {
  const metal = baseMetal(row.joint.baseMetalLeft).designation;
  const achieved = row.achieved === undefined ? 'not permitted' : row.achieved.toFixed(2);
  return `${row.joint.id} ${metal} type ${String(row.joint.type)}: ${achieved} of ${row.designed.toFixed(2)}`;
}
