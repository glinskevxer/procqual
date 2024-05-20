import type { ProductionPosition, ProductForm, WeldType } from '../codes/position.js';
import type { ProcessCode } from '../codes/process.js';
import type { Decimal } from '../core/decimal.js';
import { blocking, deficiency, type Finding } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import type { Interval } from '../core/interval.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Temperature } from '../core/temperature.js';
import type { Length } from '../core/units.js';
import type { Progression } from './variables.js';

/**
 * A welding procedure specification: the instruction a welder is handed.
 *
 * Where a qualification record says what was done once, a procedure says what
 * may be done from now on. It claims ranges, and the claim is only worth
 * anything if a record behind it covers every part of it. Nothing here checks
 * that, deliberately. A procedure is allowed to exist as a draft claiming more
 * than it can support, because that is how a welding engineer works out which
 * coupon to weld next.
 */

export interface ProcedureClaim {
  readonly process: ProcessCode;
  readonly fNumbers: readonly number[];
  readonly aNumber: number | undefined;
  readonly depositThickness: Interval<Length>;
  readonly progression: Progression;
  readonly preheatMinimum: Temperature;
  readonly interpassMaximum: Temperature;
  readonly heatInputCap?: Decimal;
}

export type PwhtClaim = 'none' | 'below-transformation' | 'above-transformation';

export interface WeldingProcedureSpecification {
  readonly number: DocumentNumber;
  readonly title: string;
  readonly issuedOn: PlainDate;
  readonly supportedBy: readonly string[];
  readonly weldType: WeldType;
  readonly productForm: ProductForm;
  readonly pNumbers: readonly string[];
  readonly groupNumbers: readonly number[];
  readonly baseMetalThickness: Interval<Length>;
  readonly positions: readonly ProductionPosition[];
  readonly layers: readonly ProcedureClaim[];
  readonly pwht: PwhtClaim;
  /** The procedure is offered for work that needs notch toughness. */
  readonly toughnessQualified: boolean;
  readonly withdrawnOn?: PlainDate;
}

export function processesOf(wps: WeldingProcedureSpecification): readonly ProcessCode[] {
  return wps.layers.map((layer) => layer.process);
}

export function isWithdrawn(wps: WeldingProcedureSpecification, on: PlainDate): boolean {
  return wps.withdrawnOn?.isOnOrBefore(on) === true;
}

export function isInForce(wps: WeldingProcedureSpecification, on: PlainDate): boolean {
  return wps.issuedOn.isOnOrBefore(on) && !isWithdrawn(wps, on);
}

export function claimFor(
  wps: WeldingProcedureSpecification,
  process: ProcessCode,
): ProcedureClaim | undefined {
  return wps.layers.find((layer) => layer.process === process);
}

/**
 * Faults in the procedure as written, before anyone asks whether a record
 * supports it. A procedure that contradicts itself cannot be supported by
 * anything.
 */
export function reviewProcedure(wps: WeldingProcedureSpecification): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = wps.number.toString();
  if (wps.layers.length === 0) {
    findings.push(
      blocking('wps.no_process', 'the procedure names no welding process', { subject }),
    );
  }
  const seen = new Set<ProcessCode>();
  for (const layer of wps.layers) {
    if (seen.has(layer.process)) {
      findings.push(
        blocking('wps.duplicate_process', `${layer.process} is claimed twice`, { subject }),
      );
    }
    seen.add(layer.process);
    if (layer.fNumbers.length === 0) {
      findings.push(
        blocking('wps.no_filler_group', `${layer.process} claims no filler metal group`, {
          subject,
        }),
      );
    }
    if (layer.preheatMinimum.isAbove(layer.interpassMaximum)) {
      findings.push(
        blocking(
          'wps.preheat_above_interpass',
          `${layer.process} asks for a preheat above its own interpass maximum`,
          { subject },
        ),
      );
    }
  }
  if (wps.pNumbers.length === 0) {
    findings.push(blocking('wps.no_base_metal', 'the procedure claims no base metal', { subject }));
  }
  if (wps.positions.length === 0) {
    findings.push(
      blocking('wps.no_position', 'the procedure claims no welding position', { subject }),
    );
  }
  if (wps.supportedBy.length === 0) {
    findings.push(
      deficiency('wps.unsupported', 'the procedure names no qualification record', { subject }),
    );
  }
  if (wps.baseMetalThickness.isEmpty()) {
    findings.push(
      blocking('wps.empty_thickness_range', 'the base metal thickness range is empty', { subject }),
    );
  }
  if (wps.withdrawnOn?.isBefore(wps.issuedOn) === true) {
    findings.push(
      blocking('wps.withdrawn_before_issue', 'the procedure is withdrawn before it was issued', {
        subject,
      }),
    );
  }
  return findings;
}

export function describeProcedure(wps: WeldingProcedureSpecification): string {
  return [
    wps.number.toString(),
    wps.title,
    `${processesOf(wps).join(' + ')}`,
    `P-No ${wps.pNumbers.join('/')}`,
    `${wps.baseMetalThickness.toString()}`,
    wps.positions.join(', '),
  ].join(' | ');
}
