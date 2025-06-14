import { ValidationError } from '../core/errors.js';
import type { Joint } from '../fabrication/joint.js';
import type { CertificationLevel, IndicationType } from '../nde/examination.js';
import type { ExaminationMethod } from '../nde/requirement.js';
import type { LogRole } from '../fabrication/weldLog.js';

/**
 * Reading the small closed vocabularies off the command line.
 *
 * Three command files had grown their own copy of this and the copies had
 * already started to differ: one accepted an upper case method and another
 * did not. They are all short enough that duplicating them looked harmless,
 * which is exactly the shape of duplication that goes wrong quietly.
 *
 * What is left here is the vocabularies that belong to the command line
 * itself. A vocabulary that belongs to a domain module now lives with it, so
 * the importers and the commands read the same one, which is what the weld map
 * importer immediately proved was needed.
 */
export { parseProductionPosition } from '../codes/position.js';
export { parseJointType, parseRadiographyLevel } from '../fabrication/joint.js';

function oneOf<T extends string>(
  field: string,
  what: string,
  allowed: readonly T[],
  value: string,
  transform: (value: string) => string = (input) => input,
): T {
  const wanted = transform(value.trim());
  const found = allowed.find((candidate) => candidate === wanted);
  if (found === undefined) {
    throw new ValidationError(field, `not ${what}: ${value}`, { value, allowed });
  }
  return found;
}

const ROLES: readonly LogRole[] = ['root', 'fill', 'cap', 'repair', 'tack'];
const METHODS: readonly ExaminationMethod[] = ['RT', 'UT', 'MT', 'PT', 'VT'];
const CERTIFICATIONS: readonly CertificationLevel[] = ['I', 'II', 'III'];
const INDICATIONS: readonly IndicationType[] = [
  'crack',
  'incomplete-fusion',
  'incomplete-penetration',
  'slag',
  'porosity',
  'undercut',
  'geometric',
];

export function parseLogRole(value: string): LogRole {
  return oneOf('role', 'a weld log role', ROLES, value, (input) => input.toLowerCase());
}

export function parseExaminationMethod(value: string): ExaminationMethod {
  return oneOf('method', 'an examination method', METHODS, value, (input) => input.toUpperCase());
}

export function parseCertificationLevel(value: string): CertificationLevel {
  return oneOf('level', 'a certification level', CERTIFICATIONS, value, (input) =>
    input.toUpperCase(),
  );
}

export function parseIndicationType(value: string): IndicationType {
  return oneOf('indication', 'an indication type', INDICATIONS, value, (input) =>
    input.toLowerCase(),
  );
}

export function parseWeldType(value: string): Joint['weldType'] {
  return oneOf('weld', 'a weld type', ['groove', 'fillet'] as const, value, (input) =>
    input.toLowerCase(),
  );
}

export function parseProductForm(value: string): Joint['productForm'] {
  return oneOf('form', 'a product form', ['plate', 'pipe'] as const, value, (input) =>
    input.toLowerCase(),
  );
}

export function parseExtent(value: string): 'full' | 'spot' | 'partial' {
  return oneOf(
    'extent',
    'an examination extent',
    ['full', 'spot', 'partial'] as const,
    value,
    (input) => input.toLowerCase(),
  );
}
