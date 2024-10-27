import type { ProductionPosition } from '../codes/position.js';
import { ValidationError } from '../core/errors.js';
import type { Joint, RadiographyLevel } from '../fabrication/joint.js';
import { isJointType } from '../fabrication/joint.js';
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
 */

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

const POSITIONS: readonly ProductionPosition[] = ['flat', 'horizontal', 'vertical', 'overhead'];
const LEVELS: readonly RadiographyLevel[] = ['full', 'spot', 'none'];
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

export function parseProductionPosition(value: string): ProductionPosition {
  return oneOf('position', 'a production position', POSITIONS, value, (input) =>
    input.toLowerCase(),
  );
}

export function parseRadiographyLevel(value: string): RadiographyLevel {
  return oneOf('radiography', 'an examination level', LEVELS, value, (input) =>
    input.toLowerCase(),
  );
}

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

export function parseJointType(value: string): Joint['type'] {
  const parsed = Number(value);
  if (!isJointType(parsed)) {
    throw new ValidationError('type', `not a joint construction type: ${value}`, { value });
  }
  return parsed;
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
