import type { ProductForm, WeldType } from '../codes/position.js';
import type { ProcessCode } from '../codes/process.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import type { PlainDate } from '../core/plainDate.js';
import { Length } from '../core/units.js';
import { baseMetal, governingTensileKsi } from '../materials/baseMetal.js';
import type { BendSpecimen } from './bend.js';
import type { HardnessSurvey } from './hardness.js';
import type { ImpactSet } from './impact.js';
import type { TensileSpecimen } from './tensile.js';
import type { WeldingVariables } from './variables.js';

/**
 * A procedure qualification record: what was actually welded and what the
 * laboratory found when it was cut up.
 *
 * A record is a statement of fact and nothing else. It says a coupon of this
 * material was welded these ways on this day and these are the numbers that
 * came back. It does not say what production work that covers, because that is
 * a derived question with rules of its own, and running the two together is
 * how a record ends up quietly edited to make a job fit.
 *
 * A coupon can carry more than one process. Root runs go in with tungsten and
 * the fill goes in with covered electrode all the time, and each process gets
 * its own row of variables and its own deposit thickness, which is what makes
 * the ranges come out differently for the two of them off one coupon.
 */

export interface CouponTests {
  readonly tensile: readonly TensileSpecimen[];
  readonly bends: readonly BendSpecimen[];
  readonly impacts: readonly ImpactSet[];
  readonly hardness: readonly HardnessSurvey[];
}

export interface ProcedureQualificationRecord {
  readonly number: DocumentNumber;
  readonly weldedOn: PlainDate;
  /** Stencil of the welder who ran the coupon, for the traceability file. */
  readonly weldedBy: string;
  readonly weldType: WeldType;
  readonly productForm: ProductForm;
  readonly baseMetalLeft: string;
  readonly baseMetalRight: string;
  readonly heatLeft: string;
  readonly heatRight: string;
  readonly couponThickness: Length;
  readonly outsideDiameter?: Length;
  /** One entry per process used on the coupon, in the order they were run. */
  readonly layers: readonly WeldingVariables[];
  /** The construction code called for notch toughness on the coupon. */
  readonly toughnessRequired: boolean;
  readonly tests: CouponTests;
  readonly witnessedBy?: string;
  readonly certifiedOn?: PlainDate;
}

export function processesUsed(record: ProcedureQualificationRecord): readonly ProcessCode[] {
  return record.layers.map((layer) => layer.process);
}

export function layerFor(
  record: ProcedureQualificationRecord,
  process: ProcessCode,
): WeldingVariables {
  const layer = record.layers.find((candidate) => candidate.process === process);
  if (layer === undefined) {
    throw new ValidationError('process', `${record.number.toString()} does not record ${process}`, {
      process,
      recorded: processesUsed(record),
    });
  }
  return layer;
}

export function totalDeposit(record: ProcedureQualificationRecord): Length {
  return record.layers.reduce(
    (running, layer) => running.add(layer.filler.depositThickness),
    Length.zero(),
  );
}

export function governingTensile(record: ProcedureQualificationRecord): number {
  return governingTensileKsi(record.baseMetalLeft, record.baseMetalRight);
}

export function isDissimilarJoint(record: ProcedureQualificationRecord): boolean {
  return baseMetal(record.baseMetalLeft).pNumber !== baseMetal(record.baseMetalRight).pNumber;
}

/**
 * Checks that the record is internally consistent, before anyone asks what it
 * qualifies. These are transcription faults, not welding faults.
 */
export function reviewRecord(record: ProcedureQualificationRecord): readonly Finding[] {
  const findings: Finding[] = [];
  if (record.layers.length === 0) {
    findings.push(
      blocking('pqr.no_layers', 'the record names no welding process at all', {
        subject: record.number.toString(),
      }),
    );
    return findings;
  }
  const seen = new Set<ProcessCode>();
  for (const layer of record.layers) {
    if (seen.has(layer.process)) {
      findings.push(
        blocking(
          'pqr.duplicate_process',
          `${layer.process} appears twice, so the deposit thickness for it is ambiguous`,
          { subject: record.number.toString() },
        ),
      );
    }
    seen.add(layer.process);
  }
  const deposit = totalDeposit(record);
  if (deposit.greaterThan(record.couponThickness)) {
    findings.push(
      blocking(
        'pqr.deposit_exceeds_coupon',
        `the deposits add up to ${deposit.toFraction()} on a coupon ${record.couponThickness.toFraction()} thick`,
        { subject: record.number.toString() },
      ),
    );
  }
  for (const layer of record.layers) {
    if (layer.baseMetal.thickness.equals(Length.zero())) {
      findings.push(
        blocking(
          'pqr.no_base_metal_thickness',
          `${layer.process} records no base metal thickness`,
          {
            subject: record.number.toString(),
          },
        ),
      );
    }
    if (!layer.baseMetal.thickness.equals(record.couponThickness)) {
      findings.push(
        blocking(
          'pqr.thickness_disagrees',
          `${layer.process} records the base metal as ${layer.baseMetal.thickness.toFraction()} and the coupon is ${record.couponThickness.toFraction()}`,
          { subject: record.number.toString() },
        ),
      );
    }
  }
  if (record.productForm === 'pipe' && record.outsideDiameter === undefined) {
    findings.push(
      blocking('pqr.no_diameter', 'a pipe coupon has to record its outside diameter', {
        subject: record.number.toString(),
      }),
    );
  }
  if (record.toughnessRequired && record.tests.impacts.length === 0) {
    findings.push(
      deficiency(
        'pqr.toughness_untested',
        'the coupon was welded for a toughness job and carries no impact results',
        { subject: record.number.toString() },
      ),
    );
  }
  if (record.certifiedOn?.isBefore(record.weldedOn) === true) {
    findings.push(
      blocking(
        'pqr.certified_before_welded',
        'the record is certified on a date before the coupon was welded',
        { subject: record.number.toString() },
      ),
    );
  }
  if (record.witnessedBy !== undefined && record.witnessedBy === record.weldedBy) {
    findings.push(
      blocking(
        'pqr.witnessed_by_welder',
        'the coupon cannot be witnessed by the welder who ran it',
        { subject: record.number.toString() },
      ),
    );
  }
  return findings;
}

export function isCertified(record: ProcedureQualificationRecord): boolean {
  return record.certifiedOn !== undefined && record.witnessedBy !== undefined;
}
