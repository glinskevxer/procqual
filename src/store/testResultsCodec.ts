import { encodeDecimal, encodeLength, encodeTemperature, readers, type Encoded } from './codec.js';
import type { BendSpecimen, Discontinuity } from '../qualification/bend.js';
import type { HardnessReading, HardnessSurvey } from '../qualification/hardness.js';
import type { ImpactSet, ImpactSpecimen } from '../qualification/impact.js';
import type { CouponTests } from '../qualification/pqr.js';
import type { TensileSpecimen } from '../qualification/tensile.js';

/**
 * The laboratory results off a coupon.
 *
 * These are kept in the journal in full rather than as a reference to a
 * laboratory report, and that is a deliberate choice with a cost. It makes the
 * journal much larger. It also means the record can be re-graded years later
 * against the criteria that were in force at the time, which is exactly the
 * question that comes up when a code edition changes and somebody asks whether
 * the old procedures still stand. A reference to a report in a filing cabinet
 * cannot answer that.
 */

function encodeDiscontinuity(item: Discontinuity): Encoded {
  return {
    location: item.location,
    size: encodeLength(item.size),
    fusionRelated: item.fusionRelated,
  };
}

export function encodeTensile(specimen: TensileSpecimen): Encoded {
  return {
    id: specimen.id,
    width: encodeLength(specimen.width),
    thickness: encodeLength(specimen.thickness),
    ultimateLoadPounds: encodeDecimal(specimen.ultimateLoadPounds),
    failureLocation: specimen.failureLocation,
  };
}

export function encodeBend(specimen: BendSpecimen): Encoded {
  return {
    id: specimen.id,
    type: specimen.type,
    discontinuities: specimen.discontinuities.map((item) => encodeDiscontinuity(item)),
  };
}

export function encodeImpactSpecimen(specimen: ImpactSpecimen): Encoded {
  return {
    id: specimen.id,
    energyFootPounds: encodeDecimal(specimen.energyFootPounds),
    lateralExpansion: encodeLength(specimen.lateralExpansion),
    shearPercent: specimen.shearPercent ?? null,
  };
}

export function encodeImpactSet(set: ImpactSet): Encoded {
  return {
    location: set.location,
    testTemperature: encodeTemperature(set.testTemperature),
    width: set.width,
    specimens: set.specimens.map((specimen) => encodeImpactSpecimen(specimen)),
  };
}

function encodeHardnessReading(reading: HardnessReading): Encoded {
  return {
    zone: reading.zone,
    value: encodeDecimal(reading.value),
    offsetMillimetres:
      reading.offsetMillimetres === undefined ? null : encodeDecimal(reading.offsetMillimetres),
  };
}

export function encodeHardnessSurvey(survey: HardnessSurvey): Encoded {
  return {
    id: survey.id,
    scale: survey.scale,
    readings: survey.readings.map((reading) => encodeHardnessReading(reading)),
  };
}

export function encodeTests(tests: CouponTests): Encoded {
  return {
    tensile: tests.tensile.map((specimen) => encodeTensile(specimen)),
    bends: tests.bends.map((specimen) => encodeBend(specimen)),
    impacts: tests.impacts.map((set) => encodeImpactSet(set)),
    hardness: tests.hardness.map((survey) => encodeHardnessSurvey(survey)),
  };
}

const discontinuityReader = readers.record({
  location: readers.oneOf(['weld', 'heat-affected-zone', 'corner', 'base-metal'] as const),
  size: readers.length,
  fusionRelated: readers.boolean,
});

export const tensileReader = readers.record({
  id: readers.text,
  width: readers.length,
  thickness: readers.length,
  ultimateLoadPounds: readers.decimal,
  failureLocation: readers.oneOf([
    'weld',
    'fusion-line',
    'heat-affected-zone',
    'base-metal',
  ] as const),
});

export const bendReader = readers.record({
  id: readers.text,
  type: readers.oneOf(['face', 'root', 'side'] as const),
  discontinuities: readers.array(discontinuityReader),
});

export const impactSpecimenReader = readers.record({
  id: readers.text,
  energyFootPounds: readers.decimal,
  lateralExpansion: readers.length,
  shearPercent: readers.optional(readers.integer),
});

export const impactSetReader = readers.record({
  location: readers.oneOf(['weld', 'heat-affected-zone', 'base-metal'] as const),
  testTemperature: readers.temperature,
  width: readers.oneOf(['10', '7.5', '5', '2.5'] as const),
  specimens: readers.array(impactSpecimenReader),
});

const hardnessReadingReader = readers.record({
  zone: readers.oneOf(['parent', 'heat-affected-zone', 'weld'] as const),
  value: readers.decimal,
  offsetMillimetres: readers.optional(readers.decimal),
});

export const hardnessSurveyReader = readers.record({
  id: readers.text,
  scale: readers.oneOf(['HV10', 'HRC', 'HB'] as const),
  readings: readers.array(hardnessReadingReader),
});

export const testsReader = readers.record({
  tensile: readers.array(tensileReader),
  bends: readers.array(bendReader),
  impacts: readers.array(impactSetReader),
  hardness: readers.array(hardnessSurveyReader),
});
