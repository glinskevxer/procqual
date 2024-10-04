import { PROCESS_CODES } from '../codes/process.js';
import { TEST_POSITIONS } from '../codes/position.js';
import { PRODUCTION_POSITIONS } from '../codes/position.js';
import type { WeldingVariables } from '../qualification/variables.js';
import type { ProcedureClaim, WeldingProcedureSpecification } from '../qualification/wps.js';
import {
  encodeDate,
  encodeDecimal,
  encodeDocumentNumber,
  encodeInterval,
  encodeLength,
  encodeTemperature,
  readers,
  type Encoded,
} from './codec.js';

/**
 * Encoding the two big records.
 *
 * A set of welding variables is thirty odd fields spread over ten groups, and
 * writing it out by hand in each direction is exactly the kind of code that
 * grows a bug the day somebody adds a field to one half and not the other. The
 * round trip test is the thing that keeps this honest, and it is deliberately
 * written against a fully populated record rather than a minimal one.
 *
 * Optional fields go out as null rather than being left off. A field that is
 * missing and a field that is absent look identical in json otherwise, and
 * they are not the same thing: no backing gas is a recorded fact, and nobody
 * writing the field down is a gap in the record.
 */

export function encodeVariables(variables: WeldingVariables): Encoded {
  return {
    process: variables.process,
    joint: {
      grooveDesign: variables.joint.grooveDesign,
      backing: variables.joint.backing,
      retainers: variables.joint.retainers,
    },
    baseMetal: {
      pNumber: variables.baseMetal.pNumber,
      groupNumber: variables.baseMetal.groupNumber,
      thickness: encodeLength(variables.baseMetal.thickness),
    },
    filler: {
      fNumber: variables.filler.fNumber,
      aNumber: variables.filler.aNumber ?? null,
      classification: variables.filler.classification,
      diameter: encodeLength(variables.filler.diameter),
      depositThickness: encodeLength(variables.filler.depositThickness),
      flux: variables.filler.flux ?? null,
      supplementalPowder: variables.filler.supplementalPowder ?? null,
    },
    position: {
      position: variables.position.position,
      verticalProgression: variables.position.verticalProgression,
    },
    preheat: {
      minimum: encodeTemperature(variables.preheat.minimum),
      maintained: variables.preheat.maintained,
      interpassMaximum: encodeTemperature(variables.preheat.interpassMaximum),
    },
    pwht: {
      applied: variables.pwht.applied,
      temperature:
        variables.pwht.temperature === undefined
          ? null
          : encodeTemperature(variables.pwht.temperature),
      holdingHours:
        variables.pwht.holdingHours === undefined
          ? null
          : encodeDecimal(variables.pwht.holdingHours),
    },
    gas: {
      shieldingComposition: variables.gas.shieldingComposition ?? null,
      shieldingFlowRate:
        variables.gas.shieldingFlowRate === undefined
          ? null
          : encodeDecimal(variables.gas.shieldingFlowRate),
      backingGas: variables.gas.backingGas ?? null,
    },
    electrical: {
      currentType: variables.electrical.currentType,
      transferMode: variables.electrical.transferMode ?? null,
      heatInputMaximum:
        variables.electrical.heatInputMaximum === undefined
          ? null
          : encodeDecimal(variables.electrical.heatInputMaximum),
      amperageLow: encodeDecimal(variables.electrical.amperageLow),
      amperageHigh: encodeDecimal(variables.electrical.amperageHigh),
    },
    technique: {
      beadType: variables.technique.beadType,
      passesPerSide: variables.technique.passesPerSide,
      peening: variables.technique.peening,
      electrodeSpacing:
        variables.technique.electrodeSpacing === undefined
          ? null
          : encodeDecimal(variables.technique.electrodeSpacing),
      closedChamber: variables.technique.closedChamber ?? null,
    },
  };
}

export const variablesReader = readers.record({
  process: readers.oneOf(PROCESS_CODES),
  joint: readers.record({
    grooveDesign: readers.text,
    backing: readers.boolean,
    retainers: readers.boolean,
  }),
  baseMetal: readers.record({
    pNumber: readers.text,
    groupNumber: readers.integer,
    thickness: readers.length,
  }),
  filler: readers.record({
    fNumber: readers.integer,
    aNumber: readers.optional(readers.integer),
    classification: readers.text,
    diameter: readers.length,
    depositThickness: readers.length,
    flux: readers.optional(readers.text),
    supplementalPowder: readers.optional(readers.boolean),
  }),
  position: readers.record({
    position: readers.oneOf(TEST_POSITIONS),
    verticalProgression: readers.oneOf(['uphill', 'downhill', 'not-applicable'] as const),
  }),
  preheat: readers.record({
    minimum: readers.temperature,
    maintained: readers.boolean,
    interpassMaximum: readers.temperature,
  }),
  pwht: readers.record({
    applied: readers.boolean,
    temperature: readers.optional(readers.temperature),
    holdingHours: readers.optional(readers.decimal),
  }),
  gas: readers.record({
    shieldingComposition: readers.optional(readers.text),
    shieldingFlowRate: readers.optional(readers.decimal),
    backingGas: readers.optional(readers.text),
  }),
  electrical: readers.record({
    currentType: readers.oneOf(['AC', 'DCEN', 'DCEP'] as const),
    transferMode: readers.optional(
      readers.oneOf(['spray', 'globular', 'pulsed', 'short-circuiting'] as const),
    ),
    heatInputMaximum: readers.optional(readers.decimal),
    amperageLow: readers.decimal,
    amperageHigh: readers.decimal,
  }),
  technique: readers.record({
    beadType: readers.oneOf(['stringer', 'weave'] as const),
    passesPerSide: readers.oneOf(['single', 'multiple'] as const),
    peening: readers.boolean,
    electrodeSpacing: readers.optional(readers.decimal),
    closedChamber: readers.optional(readers.boolean),
  }),
});

export function encodeClaim(claim: ProcedureClaim): Encoded {
  return {
    process: claim.process,
    fNumbers: [...claim.fNumbers],
    aNumber: claim.aNumber ?? null,
    depositThickness: encodeInterval(claim.depositThickness),
    progression: claim.progression,
    preheatMinimum: encodeTemperature(claim.preheatMinimum),
    interpassMaximum: encodeTemperature(claim.interpassMaximum),
    heatInputCap: claim.heatInputCap === undefined ? null : encodeDecimal(claim.heatInputCap),
  };
}

export const claimReader = readers.record({
  process: readers.oneOf(PROCESS_CODES),
  fNumbers: readers.array(readers.integer),
  aNumber: readers.optional(readers.integer),
  depositThickness: readers.interval,
  progression: readers.oneOf(['uphill', 'downhill', 'not-applicable'] as const),
  preheatMinimum: readers.temperature,
  interpassMaximum: readers.temperature,
  heatInputCap: readers.optional(readers.decimal),
});

export function encodeProcedure(wps: WeldingProcedureSpecification): Encoded {
  return {
    number: encodeDocumentNumber(wps.number),
    title: wps.title,
    issuedOn: encodeDate(wps.issuedOn),
    supportedBy: [...wps.supportedBy],
    weldType: wps.weldType,
    productForm: wps.productForm,
    pNumbers: [...wps.pNumbers],
    groupNumbers: [...wps.groupNumbers],
    baseMetalThickness: encodeInterval(wps.baseMetalThickness),
    positions: [...wps.positions],
    layers: wps.layers.map((layer) => encodeClaim(layer)),
    pwht: wps.pwht,
    toughnessQualified: wps.toughnessQualified,
    withdrawnOn: wps.withdrawnOn === undefined ? null : encodeDate(wps.withdrawnOn),
  };
}

export const procedureReader = readers.record({
  number: readers.documentNumber,
  title: readers.text,
  issuedOn: readers.date,
  supportedBy: readers.array(readers.text),
  weldType: readers.oneOf(['groove', 'fillet'] as const),
  productForm: readers.oneOf(['plate', 'pipe'] as const),
  pNumbers: readers.array(readers.text),
  groupNumbers: readers.array(readers.integer),
  baseMetalThickness: readers.interval,
  positions: readers.array(readers.oneOf(PRODUCTION_POSITIONS)),
  layers: readers.array(claimReader),
  pwht: readers.oneOf(['none', 'below-transformation', 'above-transformation'] as const),
  toughnessQualified: readers.boolean,
  withdrawnOn: readers.optional(readers.date),
});
