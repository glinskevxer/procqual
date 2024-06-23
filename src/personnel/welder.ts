import type { ProductForm, Progression, TestPosition, WeldType } from '../codes/position.js';
import type { ProcessCode } from '../codes/process.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Length } from '../core/units.js';

/**
 * Welders, and the coupons they have run.
 *
 * A welder is identified by a stencil rather than a name. Two people called
 * Jones have turned up in the same shop before now, the stencil is what gets
 * punched into the parent metal beside the weld, and it is what an inspector
 * reads off a vessel twenty years later when nobody remembers either of them.
 *
 * A performance qualification is a coupon and the tests taken from it, in the
 * same shape as a procedure record and for the same reason: it is a statement
 * of what happened, not of what it entitles anyone to do.
 */

const STENCIL = /^[A-Z]{1,3}-?\d{1,4}$/;

export interface Welder {
  readonly stencil: string;
  readonly name: string;
  readonly employedFrom: PlainDate;
  readonly employedUntil?: PlainDate;
}

export type PerformanceTestMethod = 'bend' | 'radiograph' | 'macro';

export interface PerformanceQualification {
  readonly number: DocumentNumber;
  readonly stencil: string;
  readonly weldedOn: PlainDate;
  readonly process: ProcessCode;
  readonly weldType: WeldType;
  readonly productForm: ProductForm;
  readonly position: TestPosition;
  readonly verticalProgression: Progression;
  readonly fNumber: number;
  readonly backing: boolean;
  readonly depositThickness: Length;
  readonly layers: number;
  readonly outsideDiameter?: Length;
  readonly testMethod: PerformanceTestMethod;
  readonly passed: boolean;
  readonly witnessedBy: string;
  /** Withdrawn by the quality department, separate from lapsing. */
  readonly revokedOn?: PlainDate;
  readonly revokedReason?: string;
}

export function isStencil(value: string): boolean {
  return STENCIL.test(value.trim().toUpperCase());
}

export function normaliseStencil(value: string): string {
  const upper = value.trim().toUpperCase();
  if (!isStencil(upper)) {
    throw new ValidationError('stencil', `not a welder stencil: ${value}`, { value });
  }
  return upper.includes('-') ? upper : `${upper.replace(/\d+$/, '')}-${upper.replace(/^\D+/, '')}`;
}

export function isEmployed(welder: Welder, on: PlainDate): boolean {
  if (welder.employedFrom.isAfter(on)) {
    return false;
  }
  return welder.employedUntil === undefined || welder.employedUntil.isOnOrAfter(on);
}

export function isRevoked(qualification: PerformanceQualification, on: PlainDate): boolean {
  return qualification.revokedOn?.isOnOrBefore(on) === true;
}

export function reviewQualification(
  qualification: PerformanceQualification,
  welder: Welder | undefined,
): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = qualification.number.toString();

  if (welder === undefined) {
    findings.push(
      blocking('wpq.unknown_welder', `no welder holds the stencil ${qualification.stencil}`, {
        subject,
      }),
    );
  } else if (!isEmployed(welder, qualification.weldedOn)) {
    findings.push(
      blocking(
        'wpq.not_employed',
        `${qualification.stencil} was not employed on ${qualification.weldedOn.toString()}`,
        { subject },
      ),
    );
  }

  if (qualification.layers < 1) {
    findings.push(blocking('wpq.no_layers', 'the coupon records no deposited layers', { subject }));
  }
  if (!qualification.depositThickness.toInches().isPositive()) {
    findings.push(
      blocking('wpq.no_deposit', 'the coupon records no deposited weld metal', { subject }),
    );
  }
  if (qualification.productForm === 'pipe' && qualification.outsideDiameter === undefined) {
    findings.push(
      blocking('wpq.no_diameter', 'a pipe coupon has to record its outside diameter', { subject }),
    );
  }
  if (qualification.weldType === 'fillet' && qualification.testMethod === 'radiograph') {
    findings.push(
      blocking(
        'wpq.fillet_radiographed',
        'a fillet coupon is judged on macro sections, not by radiography',
        { subject },
      ),
    );
  }
  if (qualification.testMethod === 'radiograph' && qualification.process === 'GMAW') {
    findings.push(
      deficiency(
        'wpq.short_circuit_radiography',
        'gas metal arc coupons are bend tested rather than radiographed, because radiography does not find the fusion faults this process makes',
        { clause: 'QW-304.1', subject },
      ),
    );
  }
  if (qualification.witnessedBy.trim() === '') {
    findings.push(blocking('wpq.unwitnessed', 'the coupon records no witness', { subject }));
  }
  if (qualification.revokedOn !== undefined && qualification.revokedReason === undefined) {
    findings.push(
      deficiency('wpq.revoked_without_reason', 'the revocation records no reason', { subject }),
    );
  }
  if (qualification.revokedOn?.isBefore(qualification.weldedOn) === true) {
    findings.push(
      blocking('wpq.revoked_before_welded', 'the coupon is revoked before it was welded', {
        subject,
      }),
    );
  }
  return findings;
}
