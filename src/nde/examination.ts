import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Length } from '../core/units.js';
import type { ExaminationMethod, Extent } from './requirement.js';

/**
 * Examination records, and what the technician found.
 *
 * An examination is only worth what the person who read it was qualified to
 * do. A level one may run the equipment and set up the shot; only a level two
 * or three may interpret the result and sign it. A report signed by a level
 * one is not a lenient examination, it is not an examination at all, and the
 * work has to be looked at again by somebody who can sign.
 *
 * Indications are recorded as found, without a verdict. Whether an indication
 * is a rejectable defect depends on the acceptance criteria for the method and
 * the thickness, which lives next door.
 */

export type IndicationType =
  | 'crack'
  | 'incomplete-fusion'
  | 'incomplete-penetration'
  | 'slag'
  | 'porosity'
  | 'undercut'
  | 'geometric';

export type CertificationLevel = 'I' | 'II' | 'III';

export interface Indication {
  readonly type: IndicationType;
  /** Greatest dimension of the indication. */
  readonly size: Length;
  /** Distance along the weld from the datum, for the sketch. */
  readonly fromDatum: Length;
  readonly throughWallDepth?: Length | undefined;
  readonly note?: string | undefined;
}

export interface Technician {
  readonly name: string;
  readonly level: CertificationLevel;
  readonly methods: readonly ExaminationMethod[];
  readonly certifiedUntil: PlainDate;
}

export interface Examination {
  readonly id: string;
  readonly joint: string;
  readonly method: ExaminationMethod;
  readonly extent: Extent;
  readonly performedOn: PlainDate;
  readonly technician: Technician;
  readonly reportNumber: string;
  /** Length of weld actually covered, which matters for a spot examination. */
  readonly coverage: Length;
  readonly indications: readonly Indication[];
  /** The examination happened after the weld was heat treated. */
  readonly afterHeatTreatment: boolean;
}

const INTERPRETING_LEVELS: readonly CertificationLevel[] = ['II', 'III'];

export function canInterpret(technician: Technician, method: ExaminationMethod): boolean {
  return INTERPRETING_LEVELS.includes(technician.level) && technician.methods.includes(method);
}

export function isCertifiedOn(technician: Technician, day: PlainDate): boolean {
  return technician.certifiedUntil.isOnOrAfter(day);
}

export function largestIndication(examination: Examination): Indication | undefined {
  return examination.indications.reduce<Indication | undefined>(
    (best, item) => (best === undefined || item.size.greaterThan(best.size) ? item : best),
    undefined,
  );
}

export function indicationsOfType(
  examination: Examination,
  type: IndicationType,
): readonly Indication[] {
  return examination.indications.filter((item) => item.type === type);
}

/** Total length of the indications, used by the accumulated length rules. */
export function totalIndicationLength(indications: readonly Indication[]): Length | undefined {
  const first = indications[0];
  if (first === undefined) {
    return undefined;
  }
  return indications.slice(1).reduce((running, item) => running.add(item.size), first.size);
}

export function reviewExamination(examination: Examination): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = examination.id;

  if (!examination.technician.methods.includes(examination.method)) {
    findings.push(
      blocking(
        'nde.method_not_certified',
        `${examination.technician.name} is not certified in ${examination.method}`,
        { subject },
      ),
    );
  } else if (!canInterpret(examination.technician, examination.method)) {
    findings.push(
      blocking(
        'nde.level_too_low',
        `a level ${examination.technician.level} may run the equipment but may not interpret and sign`,
        { subject },
      ),
    );
  }
  if (!isCertifiedOn(examination.technician, examination.performedOn)) {
    findings.push(
      blocking(
        'nde.certification_expired',
        `${examination.technician.name} was out of certification on ${examination.performedOn.toString()}`,
        { subject },
      ),
    );
  }
  if (examination.reportNumber.trim() === '') {
    findings.push(
      blocking('nde.no_report', 'the examination has no report number to file against', {
        subject,
      }),
    );
  }
  if (!examination.coverage.toInches().isPositive()) {
    findings.push(
      blocking('nde.no_coverage', 'the examination records no length of weld covered', { subject }),
    );
  }
  for (const indication of examination.indications) {
    if (!indication.size.toInches().isPositive()) {
      findings.push(
        deficiency(
          'nde.unsized_indication',
          `a ${indication.type} indication is recorded with no size`,
          { subject },
        ),
      );
    }
  }
  return findings;
}

export function assertReadable(examination: Examination): void {
  if (!canInterpret(examination.technician, examination.method)) {
    throw new ValidationError(
      'technician',
      `${examination.id} was signed by somebody who cannot interpret ${examination.method}`,
      { id: examination.id },
    );
  }
}
