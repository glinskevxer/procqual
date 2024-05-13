import { fNumbersQualifiedBy } from '../codes/fnumber.js';
import { isAboveTransformation } from '../codes/heatTreatment.js';
import {
  PRODUCTION_POSITIONS,
  positionsQualifiedBy,
  type ProductionPosition,
} from '../codes/position.js';
import { groupsQualifiedBy, pNumbersQualifiedBy } from '../codes/pnumber.js';
import type { ProcessCode } from '../codes/process.js';
import { qualifiedBaseMetalRange, qualifiedDepositRange } from '../codes/thicknessRange.js';
import type { Decimal } from '../core/decimal.js';
import { Interval } from '../core/interval.js';
import type { Temperature } from '../core/temperature.js';
import type { Length } from '../core/units.js';
import type { ProcedureQualificationRecord } from './pqr.js';
import type { Progression, WeldingVariables } from './variables.js';

/**
 * What a record actually qualifies, worked out one process at a time.
 *
 * This is where most of the tables in `codes` finally meet. Three of the
 * results depend on answers that came from somewhere else entirely:
 *
 *   the base metal ceiling depends on whether the coupon's own heat treatment
 *   went past the transformation temperature, which needs the P number to know
 *   where that temperature is
 *
 *   the group numbers depend on whether the coupon was welded for a toughness
 *   job, and collapse to the coupon's own group when it was
 *
 *   the positions depend on the same toughness answer. For ordinary work
 *   position is nonessential and a flat coupon qualifies overhead work, which
 *   surprises people. Once toughness is wanted the position of the coupon
 *   starts to count and the qualification narrows to what the coupon proved.
 */

export interface QualifiedScope {
  readonly process: ProcessCode;
  readonly pNumbers: readonly string[];
  readonly groupNumbers: readonly number[];
  readonly fNumbers: readonly number[];
  readonly aNumber: number | undefined;
  readonly baseMetalThickness: Interval<Length>;
  readonly depositThickness: Interval<Length>;
  readonly positions: readonly ProductionPosition[];
  readonly progression: Progression;
  readonly preheatMinimum: Temperature;
  readonly interpassMaximum: Temperature;
  readonly heatTreatment: 'none' | 'below-transformation' | 'above-transformation';
  readonly heatInputCap: Decimal | undefined;
}

export function heatTreatmentCondition(
  layer: WeldingVariables,
  pNumber: string,
): QualifiedScope['heatTreatment'] {
  if (!layer.pwht.applied) {
    return 'none';
  }
  const temperature = layer.pwht.temperature;
  if (temperature === undefined) {
    return 'below-transformation';
  }
  return isAboveTransformation(pNumber, temperature)
    ? 'above-transformation'
    : 'below-transformation';
}

export function scopeForLayer(
  record: ProcedureQualificationRecord,
  layer: WeldingVariables,
): QualifiedScope {
  const pNumber = layer.baseMetal.pNumber;
  const heatTreatment = heatTreatmentCondition(layer, pNumber);
  const conditions = {
    couponThickness: record.couponThickness,
    depositThickness: layer.filler.depositThickness,
    process: layer.process,
    transferMode: layer.electrical.transferMode,
    heatTreatedAboveTransformation: heatTreatment === 'above-transformation',
  };
  return {
    process: layer.process,
    pNumbers: pNumbersQualifiedBy(pNumber),
    groupNumbers: groupsQualifiedBy(pNumber, layer.baseMetal.groupNumber, record.toughnessRequired),
    fNumbers: fNumbersQualifiedBy(layer.filler.fNumber, layer.process),
    aNumber: layer.filler.aNumber,
    baseMetalThickness: qualifiedBaseMetalRange(conditions),
    depositThickness: qualifiedDepositRange(conditions),
    positions: qualifiedPositions(record, layer),
    progression: layer.position.verticalProgression,
    preheatMinimum: layer.preheat.minimum,
    interpassMaximum: layer.preheat.interpassMaximum,
    heatTreatment,
    heatInputCap: record.toughnessRequired ? layer.electrical.heatInputMaximum : undefined,
  };
}

/**
 * For an ordinary job the position of the coupon buys nothing and costs
 * nothing, because position is a nonessential variable for a procedure. Once
 * the job wants notch toughness it becomes essential and the qualification
 * narrows to what the coupon actually proved.
 */
export function qualifiedPositions(
  record: ProcedureQualificationRecord,
  layer: WeldingVariables,
): readonly ProductionPosition[] {
  if (!record.toughnessRequired) {
    return PRODUCTION_POSITIONS;
  }
  return positionsQualifiedBy(layer.position.position, record.weldType);
}

export function scopesFor(record: ProcedureQualificationRecord): readonly QualifiedScope[] {
  return record.layers.map((layer) => scopeForLayer(record, layer));
}

export function scopeForProcess(
  record: ProcedureQualificationRecord,
  process: ProcessCode,
): QualifiedScope | undefined {
  return scopesFor(record).find((scope) => scope.process === process);
}

/**
 * The base metal thickness the whole record covers, which is where all of its
 * processes agree. A record whose processes disagree covers only the overlap,
 * because a production joint has to be welded by all of them.
 */
export function combinedBaseMetalThickness(record: ProcedureQualificationRecord): Interval<Length> {
  const scopes = scopesFor(record);
  const first = scopes[0];
  if (first === undefined) {
    return Interval.unbounded();
  }
  return scopes
    .slice(1)
    .reduce(
      (running, scope) => running.intersect(scope.baseMetalThickness),
      first.baseMetalThickness,
    );
}

export function describeScope(scope: QualifiedScope): string {
  const positions = scope.positions.join(', ');
  return [
    `${scope.process}`,
    `P-No ${scope.pNumbers.join('/')} groups ${scope.groupNumbers.join('/')}`,
    `F-No ${scope.fNumbers.join('/')}`,
    `base metal ${scope.baseMetalThickness.toString()}`,
    `deposit ${scope.depositThickness.toString()}`,
    `positions ${positions}`,
  ].join('; ');
}
