import type { ProcessCode, TransferMode } from '../codes/process.js';
import type { Progression, TestPosition } from '../codes/position.js';
import { Decimal } from '../core/decimal.js';
import { ValidationError } from '../core/errors.js';
import { Temperature } from '../core/temperature.js';
import { Length } from '../core/units.js';
import { allVariables } from '../codes/essentialVariable.js';

/**
 * The recorded state of every welding variable for one pass of one process.
 *
 * The shape mirrors the register, key for key, and the reader below is what
 * ties the two together. Without it the register is a table of clause numbers
 * that nothing consults, and comparing two procedures means writing the same
 * long list of field comparisons out by hand and forgetting one.
 */

export type CurrentType = 'AC' | 'DCEN' | 'DCEP';

export interface JointVariables {
  readonly grooveDesign: string;
  readonly backing: boolean;
  readonly retainers: boolean;
}

export interface BaseMetalVariables {
  readonly pNumber: string;
  readonly groupNumber: number;
  readonly thickness: Length;
}

export interface FillerVariables {
  readonly fNumber: number;
  readonly aNumber: number | undefined;
  readonly classification: string;
  readonly diameter: Length;
  readonly depositThickness: Length;
  readonly flux?: string;
  readonly supplementalPowder?: boolean;
}

export interface PositionVariables {
  readonly position: TestPosition;
  readonly verticalProgression: Progression;
}

export interface PreheatVariables {
  readonly minimum: Temperature;
  readonly maintained: boolean;
  readonly interpassMaximum: Temperature;
}

export interface PwhtVariables {
  readonly applied: boolean;
  readonly temperature?: Temperature;
  readonly holdingHours?: Decimal;
}

export interface GasVariables {
  readonly shieldingComposition?: string;
  readonly shieldingFlowRate?: Decimal;
  readonly backingGas?: string;
}

export interface ElectricalVariables {
  readonly currentType: CurrentType;
  readonly transferMode?: TransferMode;
  readonly heatInputMaximum?: Decimal;
  readonly amperageLow: Decimal;
  readonly amperageHigh: Decimal;
}

export interface TechniqueVariables {
  readonly beadType: 'stringer' | 'weave';
  readonly passesPerSide: 'single' | 'multiple';
  readonly peening: boolean;
  readonly electrodeSpacing?: Decimal;
  readonly closedChamber?: boolean;
}

export interface WeldingVariables {
  readonly process: ProcessCode;
  readonly joint: JointVariables;
  readonly baseMetal: BaseMetalVariables;
  readonly filler: FillerVariables;
  readonly position: PositionVariables;
  readonly preheat: PreheatVariables;
  readonly pwht: PwhtVariables;
  readonly gas: GasVariables;
  readonly electrical: ElectricalVariables;
  readonly technique: TechniqueVariables;
}

type Reader = (variables: WeldingVariables) => unknown;

/**
 * One entry for every key in the register. The test that walks the register
 * and asks for each key in turn is what keeps this honest.
 */
const READERS: Readonly<Record<string, Reader>> = {
  'joint.grooveDesign': (v) => v.joint.grooveDesign,
  'joint.backing': (v) => v.joint.backing,
  'joint.retainers': (v) => v.joint.retainers,
  'baseMetal.pNumber': (v) => v.baseMetal.pNumber,
  'baseMetal.groupNumber': (v) => v.baseMetal.groupNumber,
  'baseMetal.thickness': (v) => v.baseMetal.thickness,
  'baseMetal.thicknessForToughness': (v) => v.baseMetal.thickness,
  'filler.fNumber': (v) => v.filler.fNumber,
  'filler.aNumber': (v) => v.filler.aNumber,
  'filler.diameter': (v) => v.filler.diameter,
  'filler.depositThickness': (v) => v.filler.depositThickness,
  'filler.supplementalPowder': (v) => v.filler.supplementalPowder ?? false,
  'filler.flux': (v) => v.filler.flux,
  'position.groovePosition': (v) => v.position.position,
  'position.verticalProgression': (v) => v.position.verticalProgression,
  'position.positionForToughness': (v) => v.position.position,
  'preheat.minimum': (v) => v.preheat.minimum,
  'preheat.maintenance': (v) => v.preheat.maintained,
  'preheat.interpassMaximum': (v) => v.preheat.interpassMaximum,
  'pwht.condition': (v) => (v.pwht.applied ? v.pwht.temperature ?? 'applied' : 'none'),
  'pwht.holdingTime': (v) => v.pwht.holdingHours,
  'gas.shieldingComposition': (v) => v.gas.shieldingComposition,
  'gas.shieldingFlowRate': (v) => v.gas.shieldingFlowRate,
  'gas.backing': (v) => v.gas.backingGas !== undefined,
  'electrical.currentPolarity': (v) => v.electrical.currentType,
  'electrical.transferMode': (v) => v.electrical.transferMode,
  'electrical.heatInput': (v) => v.electrical.heatInputMaximum,
  'electrical.amperageRange': (v) =>
    `${v.electrical.amperageLow.toString()}-${v.electrical.amperageHigh.toString()}`,
  'technique.stringOrWeave': (v) => v.technique.beadType,
  'technique.multipleToSingle': (v) => v.technique.passesPerSide,
  'technique.peening': (v) => v.technique.peening,
  'technique.electrodeSpacing': (v) => v.technique.electrodeSpacing,
  'technique.closedToOutChamber': (v) => v.technique.closedChamber ?? false,
};

export function readVariable(variables: WeldingVariables, key: string): unknown {
  const reader = READERS[key];
  if (reader === undefined) {
    throw new ValidationError('variable', `no reader for welding variable ${key}`, { key });
  }
  return reader(variables);
}

export function readableKeys(): readonly string[] {
  return Object.keys(READERS);
}

/** Every register key that nothing here can read, which should always be empty. */
export function unreadableRegisterKeys(): readonly string[] {
  return allVariables()
    .map((definition) => definition.key)
    .filter((key) => READERS[key] === undefined);
}

/**
 * Compare two recorded values of the same variable.
 *
 * Domain values know how to compare themselves and plain values do not, so
 * this is one place rather than thirty. An undefined on one side and a value
 * on the other is a change, which matters because adding a backing gas is
 * exactly as essential as taking one away.
 */
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  if (left instanceof Length && right instanceof Length) {
    return left.equals(right);
  }
  if (left instanceof Temperature && right instanceof Temperature) {
    return left.equals(right);
  }
  if (left instanceof Decimal && right instanceof Decimal) {
    return left.equals(right);
  }
  return left === right;
}

export function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'none';
  }
  if (value instanceof Length || value instanceof Temperature || value instanceof Decimal) {
    return value.toString();
  }
  return String(value);
}
