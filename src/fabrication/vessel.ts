import { type Decimal, decimal } from '../core/decimal.js';
import { blocking, deficiency, advisory, type Finding, ValidationError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import { type Temperature } from '../core/temperature.js';
import type { Length } from '../core/units.js';
import { baseMetal, curveFor } from '../materials/baseMetal.js';
import { assessToughness, type ExemptionCurve } from '../codes/toughness.js';
import type { Joint } from './joint.js';

/**
 * The vessel, and the design conditions the whole job hangs off.
 *
 * Almost nothing in this system reads the vessel record directly and that is
 * misleading, because the two fields on it decide an enormous amount. The
 * minimum design metal temperature decides whether the job needs notch
 * toughness, which decides whether five supplementary variables are essential,
 * which decides whether any of the shop's procedures still cover the work. The
 * service decides how much radiography every butt joint gets.
 *
 * Both are set by somebody in a design office months before a plate is cut,
 * they are written on a drawing, and getting them into this record wrongly is
 * the single most expensive mistake available on a job.
 */

export type Service = 'general' | 'lethal' | 'steam' | 'sour';

export interface Vessel {
  readonly tag: string;
  readonly description: string;
  readonly customer: string;
  readonly service: Service;
  /** Minimum design metal temperature the vessel is stamped for. */
  readonly minimumDesignMetalTemperature: Temperature;
  readonly designPressurePsi: Decimal;
  readonly designTemperature: Temperature;
  readonly orderedOn: PlainDate;
  /** Heats supplied normalised, which moves them onto a colder curve. */
  readonly normalisedHeats: readonly string[];
}

export function isLethal(vessel: Vessel): boolean {
  return vessel.service === 'lethal';
}

export function isSour(vessel: Vessel): boolean {
  return vessel.service === 'sour';
}

export function curveForJoint(vessel: Vessel, joint: Joint): ExemptionCurve {
  const normalised =
    vessel.normalisedHeats.includes(joint.heatLeft) &&
    vessel.normalisedHeats.includes(joint.heatRight);
  return curveFor(joint.baseMetalLeft, normalised);
}

/**
 * Whether a joint on this vessel needs notch toughness, which is the answer
 * half the qualification rules key on.
 */
export function toughnessRequiredFor(vessel: Vessel, joint: Joint): boolean {
  return assessToughness({
    curve: curveForJoint(vessel, joint),
    governingThickness: joint.thickness,
    minimumDesignMetalTemperature: vessel.minimumDesignMetalTemperature,
  }).required;
}

export function reviewVessel(vessel: Vessel): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = vessel.tag;
  if (vessel.tag.trim() === '') {
    findings.push(blocking('vessel.no_tag', 'the vessel has no tag number', {}));
  }
  if (!vessel.designPressurePsi.isPositive()) {
    findings.push(
      blocking('vessel.no_pressure', 'the vessel records no design pressure', { subject }),
    );
  }
  if (vessel.minimumDesignMetalTemperature.isAbove(vessel.designTemperature)) {
    findings.push(
      blocking(
        'vessel.temperatures_crossed',
        'the minimum design metal temperature is above the design temperature',
        { subject },
      ),
    );
  }
  if (vessel.service === 'lethal') {
    findings.push(
      advisory(
        'vessel.lethal',
        'lethal service, so every butt joint is fully radiographed whatever the drawing says',
        { clause: 'UW-11', subject },
      ),
    );
  }
  if (vessel.service === 'sour') {
    findings.push(
      advisory(
        'vessel.sour',
        'wet sour service, so every procedure needs a hardness survey behind it',
        { subject },
      ),
    );
  }
  if (vessel.designPressurePsi.greaterThan(decimal('3000'))) {
    findings.push(
      deficiency(
        'vessel.high_pressure',
        'over three thousand pounds, so check whether the construction code is still the right one',
        { subject },
      ),
    );
  }
  return findings;
}

/**
 * Faults where the vessel and one of its joints disagree. These are the
 * expensive ones and none of them is visible from either record alone.
 */
export function reviewJointAgainstVessel(vessel: Vessel, joint: Joint): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = joint.id;
  if (joint.vessel !== vessel.tag) {
    throw new ValidationError('joint', `${joint.id} does not belong to ${vessel.tag}`, {
      joint: joint.id,
      vessel: vessel.tag,
    });
  }
  if (toughnessRequiredFor(vessel, joint)) {
    findings.push(
      deficiency(
        'vessel.toughness_required',
        `${joint.thickness.toFraction()} on curve ${curveForJoint(vessel, joint)} at ${vessel.minimumDesignMetalTemperature.toString()} needs notch toughness, so the procedure has to be qualified for it`,
        { clause: 'UCS-66', subject },
      ),
    );
  }
  if (isLethal(vessel) && joint.radiography !== 'full') {
    findings.push(
      blocking(
        'vessel.lethal_radiography',
        `${joint.id} is marked for ${joint.radiography} radiography on a lethal service vessel`,
        { clause: 'UW-11', subject },
      ),
    );
  }
  if (isSour(vessel) && baseMetal(joint.baseMetalLeft).pNumber === '1') {
    findings.push(
      deficiency(
        'vessel.sour_hardness',
        'carbon steel in wet sour service needs the hardness survey and the two hundred and forty eight limit',
        { subject },
      ),
    );
  }
  return findings;
}

export function governingThickness(joints: readonly Joint[]): Length | undefined {
  return joints.reduce<Length | undefined>(
    (thickest, joint) =>
      thickest === undefined || joint.thickness.greaterThan(thickest) ? joint.thickness : thickest,
    undefined,
  );
}

export function describeVessel(vessel: Vessel): string {
  return `${vessel.tag} for ${vessel.customer}, ${vessel.service} service, ${vessel.designPressurePsi.toString()} psi at ${vessel.designTemperature.toString()}, MDMT ${vessel.minimumDesignMetalTemperature.toString()}`;
}
