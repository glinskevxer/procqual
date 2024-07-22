import { pNumberFacts } from '../codes/pnumber.js';
import { ValidationError } from '../core/errors.js';
import { inches, type Length } from '../core/units.js';
import { baseMetal } from '../materials/baseMetal.js';
import type { Joint, RadiographyLevel } from '../fabrication/joint.js';

/**
 * What has to be examined on a joint, and by what method.
 *
 * Two separate decisions and they are decided by different things.
 *
 * How much volumetric examination is a service and thickness question. A
 * vessel in lethal service is fully radiographed whatever anyone drew on the
 * plan, and so is a joint thicker than its own family's limit, which is an
 * inch and a half on carbon steel and five eighths on the low alloys.
 *
 * Which surface method is a magnetism question, and it has nothing to do with
 * the code at all. Magnetic particle needs a magnetic material, and austenitic
 * stainless, duplex, nickel and aluminium are not. Getting that wrong means a
 * technician standing at a nozzle with a yoke that will do nothing.
 */

export type ExaminationMethod = 'RT' | 'UT' | 'MT' | 'PT' | 'VT';

export type Extent = 'full' | 'spot' | 'partial' | 'none';

export interface ExaminationDemand {
  readonly method: ExaminationMethod;
  readonly extent: Extent;
  readonly clause: string;
  readonly reason: string;
}

export interface ExaminationQuestion {
  readonly joint: Joint;
  /** The vessel holds a substance that would be lethal if it escaped. */
  readonly lethalService: boolean;
  /** The weld was gouged out and rewelded, which is examined again either way. */
  readonly repair: boolean;
  /** Ultrasonic stands in for radiography where the geometry defeats a film. */
  readonly ultrasonicInPlaceOfRadiography?: boolean;
}

/** Above this thickness the family is fully radiographed whatever the plan says. */
const FULL_RADIOGRAPHY_ABOVE: Readonly<Record<string, string>> = {
  '1': '1.5',
  '3': '0.625',
  '4': '0.625',
  '5A': '0.625',
  '5B': '0.625',
  '5C': '0.625',
  '9A': '0.625',
  '9B': '0.625',
  '10H': '0.625',
  '11A': '0.625',
  '15E': '0.625',
};

/** Families a magnetic particle yoke will not work on. */
const NON_MAGNETIC = new Set(['8', '10H', '21', '22', '23', '41', '42', '43', '45']);

export function surfaceMethodFor(pNumber: string): 'MT' | 'PT' {
  const code = pNumberFacts(pNumber).code;
  return NON_MAGNETIC.has(code) ? 'PT' : 'MT';
}

export function fullRadiographyThreshold(pNumber: string): Length | undefined {
  const limit = FULL_RADIOGRAPHY_ABOVE[pNumberFacts(pNumber).code];
  return limit === undefined ? undefined : inches(limit);
}

export function requiresFullRadiography(question: ExaminationQuestion): boolean {
  if (question.lethalService) {
    return true;
  }
  const pNumber = baseMetal(question.joint.baseMetalLeft).pNumber;
  const threshold = fullRadiographyThreshold(pNumber);
  if (threshold === undefined) {
    return false;
  }
  return question.joint.thickness.greaterThan(threshold);
}

/**
 * The volumetric examination the joint gets, which is the greater of what was
 * planned and what the code insists on.
 */
export function volumetricExtent(question: ExaminationQuestion): RadiographyLevel {
  if (requiresFullRadiography(question)) {
    return 'full';
  }
  return question.joint.radiography;
}

export function requiredExaminations(question: ExaminationQuestion): readonly ExaminationDemand[] {
  const joint = question.joint;
  const pNumber = baseMetal(joint.baseMetalLeft).pNumber;
  const demands: ExaminationDemand[] = [];

  demands.push({
    method: 'VT',
    extent: 'full',
    clause: 'UW-35',
    reason: 'every weld is looked at',
  });

  const extent = volumetricExtent(question);
  if (extent !== 'none') {
    demands.push({
      method: question.ultrasonicInPlaceOfRadiography === true ? 'UT' : 'RT',
      extent: extent === 'full' ? 'full' : 'spot',
      clause: 'UW-11',
      reason: volumetricReason(question, extent),
    });
  }

  if (joint.category === 'D' || joint.category === 'C') {
    demands.push({
      method: surfaceMethodFor(pNumber),
      extent: 'full',
      clause: 'UW-16',
      reason: `category ${joint.category} attachment welds are examined on the surface`,
    });
  } else if (pNumberFacts(pNumber).pwhtCustomary) {
    demands.push({
      method: surfaceMethodFor(pNumber),
      extent: 'full',
      clause: 'UCS-56',
      reason: 'the family is heat treated, so the surface is examined after the soak',
    });
  }

  if (question.repair) {
    demands.push({
      method: extent === 'none' ? surfaceMethodFor(pNumber) : 'RT',
      extent: 'partial',
      clause: 'UW-38',
      reason: 'the excavation and the reweld are examined by the method the original weld had',
    });
  }

  return dedupe(demands);
}

function volumetricReason(question: ExaminationQuestion, extent: RadiographyLevel): string {
  if (question.lethalService) {
    return 'lethal service, so every butt joint is fully radiographed';
  }
  if (requiresFullRadiography(question)) {
    const pNumber = baseMetal(question.joint.baseMetalLeft).pNumber;
    const threshold = fullRadiographyThreshold(pNumber);
    return `over the ${threshold?.toFraction() ?? ''} inch limit for P-No ${pNumber}`;
  }
  return extent === 'full' ? 'full radiography was specified' : 'spot radiography was specified';
}

function dedupe(demands: readonly ExaminationDemand[]): readonly ExaminationDemand[] {
  const seen = new Map<string, ExaminationDemand>();
  for (const demand of demands) {
    const key = `${demand.method}|${demand.extent}`;
    if (!seen.has(key)) {
      seen.set(key, demand);
    }
  }
  return [...seen.values()];
}

export function describeDemand(demand: ExaminationDemand): string {
  return `${demand.method} ${demand.extent} [${demand.clause}] ${demand.reason}`;
}

export function methodsRequired(question: ExaminationQuestion): readonly ExaminationMethod[] {
  const methods = requiredExaminations(question).map((demand) => demand.method);
  return [...new Set(methods)];
}

export function assertMethodApplicable(method: ExaminationMethod, pNumber: string): void {
  if (method === 'MT' && surfaceMethodFor(pNumber) === 'PT') {
    throw new ValidationError(
      'method',
      `magnetic particle will not work on P-No ${pNumberFacts(pNumber).code}, which is not magnetic`,
      { pNumber },
    );
  }
}
