import { blocking, deficiency, isAcceptable, type Finding } from '../core/errors.js';
import type { ProcedureQualificationRecord } from './pqr.js';
import { scopesFor, type QualifiedScope } from './qualifiedRanges.js';
import type { ProcedureClaim, WeldingProcedureSpecification } from './wps.js';

/**
 * Whether the records behind a procedure actually reach as far as it claims.
 *
 * Most of this is set containment and range covering, which is dull and right.
 * The two temperature checks are the ones with teeth.
 *
 * Preheat is allowed to drop a hundred degrees below what the coupon was
 * welded at before anyone has to reweld, because a hundred degrees is inside
 * what the coupon proved. Below that it is an essential change. Interpass is
 * allowed to rise a hundred degrees on the same reasoning, but that allowance
 * is supplementary, so on a toughness job it is not an allowance at all and
 * any increase at all has to be requalified.
 */

const PREHEAT_TOLERANCE = 100;
const INTERPASS_TOLERANCE = 100;

export interface SupportReport {
  readonly findings: readonly Finding[];
  readonly supported: boolean;
  readonly recordsUsed: readonly string[];
}

export function supportFindings(
  wps: WeldingProcedureSpecification,
  records: readonly ProcedureQualificationRecord[],
): SupportReport {
  const findings: Finding[] = [];
  const scopes = records.flatMap((record) => scopesFor(record));
  const subject = wps.number.toString();

  if (records.length === 0) {
    return {
      findings: [
        blocking('support.no_records', 'no qualification record was supplied', { subject }),
      ],
      supported: false,
      recordsUsed: [],
    };
  }

  for (const pNumber of wps.pNumbers) {
    if (!scopes.some((scope) => scope.pNumbers.includes(pNumber))) {
      findings.push(
        blocking('support.base_metal', `no record reaches P-No ${pNumber}`, {
          clause: 'QW-403.11',
          subject,
        }),
      );
    }
  }
  for (const group of wps.groupNumbers) {
    if (!scopes.some((scope) => scope.groupNumbers.includes(group))) {
      findings.push(
        blocking('support.group_number', `no record reaches group ${group}`, {
          clause: 'QW-403.6',
          subject,
        }),
      );
    }
  }
  for (const position of wps.positions) {
    if (!scopes.some((scope) => scope.positions.includes(position))) {
      findings.push(
        blocking('support.position', `no record reaches the ${position} position`, {
          clause: 'QW-405.2',
          subject,
        }),
      );
    }
  }
  if (!scopes.some((scope) => scope.baseMetalThickness.covers(wps.baseMetalThickness))) {
    findings.push(
      blocking(
        'support.base_metal_thickness',
        `no record covers base metal ${wps.baseMetalThickness.toString()}`,
        { clause: 'QW-403.8', subject },
      ),
    );
  }

  for (const claim of wps.layers) {
    findings.push(...layerFindings(wps, claim, scopes, subject));
  }

  return {
    findings,
    supported: isAcceptable(findings),
    recordsUsed: records.map((record) => record.number.key()),
  };
}

function layerFindings(
  wps: WeldingProcedureSpecification,
  claim: ProcedureClaim,
  scopes: readonly QualifiedScope[],
  subject: string,
): readonly Finding[] {
  const matching = scopes.filter((scope) => scope.process === claim.process);
  if (matching.length === 0) {
    return [
      blocking('support.process', `no record covers ${claim.process}`, {
        clause: 'QW-401.1',
        subject,
      }),
    ];
  }
  const findings: Finding[] = [];
  for (const fNumber of claim.fNumbers) {
    if (!matching.some((scope) => scope.fNumbers.includes(fNumber))) {
      findings.push(
        blocking('support.filler_group', `no record reaches F-No ${fNumber} on ${claim.process}`, {
          clause: 'QW-404.5',
          subject,
        }),
      );
    }
  }
  if (claim.aNumber !== undefined && !matching.some((scope) => scope.aNumber === claim.aNumber)) {
    findings.push(
      blocking('support.deposit_group', `no record deposits A-No ${claim.aNumber}`, {
        clause: 'QW-404.6',
        subject,
      }),
    );
  }
  if (!matching.some((scope) => scope.depositThickness.covers(claim.depositThickness))) {
    findings.push(
      blocking(
        'support.deposit_thickness',
        `no record covers ${claim.depositThickness.toString()} of ${claim.process} deposit`,
        { clause: 'QW-404.32', subject },
      ),
    );
  }
  if (!matching.some((scope) => scope.progression === claim.progression)) {
    findings.push(
      blocking('support.progression', `no record welded ${claim.process} ${claim.progression}`, {
        clause: 'QW-405.3',
        subject,
      }),
    );
  }
  if (!matching.some((scope) => scope.heatTreatment === wps.pwht)) {
    findings.push(
      blocking(
        'support.heat_treatment',
        `no record was heat treated in the ${wps.pwht} condition`,
        { clause: 'QW-407.1', subject },
      ),
    );
  }

  const preheatOk = matching.some((scope) =>
    claim.preheatMinimum.isAtLeast(scope.preheatMinimum.plusFahrenheitDegrees(-PREHEAT_TOLERANCE)),
  );
  if (!preheatOk) {
    findings.push(
      blocking(
        'support.preheat',
        `the procedure allows a preheat more than ${PREHEAT_TOLERANCE} degrees below what was qualified`,
        { clause: 'QW-406.1', subject },
      ),
    );
  }

  const interpassAllowance = wps.toughnessQualified ? 0 : INTERPASS_TOLERANCE;
  const interpassOk = matching.some((scope) =>
    claim.interpassMaximum.isAtMost(
      scope.interpassMaximum.plusFahrenheitDegrees(interpassAllowance),
    ),
  );
  if (!interpassOk) {
    const message = wps.toughnessQualified
      ? 'the procedure allows an interpass temperature above what was qualified, and on toughness work there is no allowance'
      : `the procedure allows an interpass temperature more than ${INTERPASS_TOLERANCE} degrees above what was qualified`;
    findings.push(
      wps.toughnessQualified
        ? blocking('support.interpass', message, { clause: 'QW-406.3', subject })
        : deficiency('support.interpass', message, { clause: 'QW-406.3', subject }),
    );
  }
  return findings;
}

export function unsupportedClauses(report: SupportReport): readonly string[] {
  return [
    ...new Set(
      report.findings
        .filter((item) => item.severity === 'blocking')
        .map((item) => item.clause ?? 'unclassified'),
    ),
  ];
}
