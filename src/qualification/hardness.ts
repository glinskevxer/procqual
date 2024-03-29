import { Decimal, decimal } from '../core/decimal.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import { pNumberFacts } from '../codes/pnumber.js';

/**
 * Hardness surveys across the weld.
 *
 * Not every job wants one. Where the family is prone to hard brittle zones
 * after welding, and where the service is sour or the customer's own
 * specification asks, a traverse is run across the parent metal, the heat
 * affected zone and the weld, and every reading has to sit under the limit.
 *
 * The heat affected zone is the reason the survey exists, so a traverse that
 * never crossed it proves nothing however many readings it took. That check is
 * separate from the limit check and both have to pass.
 */

export type HardnessScale = 'HV10' | 'HRC' | 'HB';

export type SurveyZone = 'parent' | 'heat-affected-zone' | 'weld';

export interface HardnessReading {
  readonly zone: SurveyZone;
  readonly value: Decimal;
  /** Distance from the fusion line in millimetres, for the traverse plot. */
  readonly offsetMillimetres?: Decimal;
}

export interface HardnessSurvey {
  readonly id: string;
  readonly scale: HardnessScale;
  readonly readings: readonly HardnessReading[];
}

export interface HardnessRequirement {
  readonly required: boolean;
  readonly limit: Decimal;
  readonly scale: HardnessScale;
  readonly reason: string;
}

/** Vickers limits by base metal family, which is where the numbers come from. */
const LIMITS: Readonly<Record<string, string>> = {
  '1': '248',
  '3': '248',
  '4': '241',
  '5A': '241',
  '5B': '241',
  '5C': '241',
  '6': '241',
  '9A': '248',
  '9B': '248',
  '11A': '250',
  '15E': '250',
};

const SOUR_SERVICE_LIMIT = decimal('248');

export interface HardnessQuestion {
  readonly pNumber: string;
  /** The vessel is in wet sour service, which brings its own limit. */
  readonly sourService: boolean;
  /** The customer's specification asks for a survey whatever the family. */
  readonly customerRequested: boolean;
}

export function hardnessRequirement(question: HardnessQuestion): HardnessRequirement {
  const facts = pNumberFacts(question.pNumber);
  const familyLimit = LIMITS[facts.code];
  if (question.sourService) {
    return {
      required: true,
      limit: SOUR_SERVICE_LIMIT,
      scale: 'HV10',
      reason: 'wet sour service',
    };
  }
  if (facts.code === '15E' || facts.preheatFamily === 'chrome-moly') {
    return {
      required: true,
      limit: decimal(familyLimit ?? '241'),
      scale: 'HV10',
      reason: `P number ${facts.code} is a chromium molybdenum family`,
    };
  }
  if (question.customerRequested) {
    return {
      required: true,
      limit: decimal(familyLimit ?? '248'),
      scale: 'HV10',
      reason: 'asked for by the purchase specification',
    };
  }
  return {
    required: false,
    limit: decimal(familyLimit ?? '248'),
    scale: 'HV10',
    reason: 'no survey called for by the family or the specification',
  };
}

export function zonesCovered(survey: HardnessSurvey): readonly SurveyZone[] {
  const seen = new Set(survey.readings.map((reading) => reading.zone));
  return (['parent', 'heat-affected-zone', 'weld'] as const).filter((zone) => seen.has(zone));
}

export function highestReading(survey: HardnessSurvey): Decimal {
  if (survey.readings.length === 0) {
    throw new ValidationError('readings', `survey ${survey.id} has no readings`, { id: survey.id });
  }
  return survey.readings.reduce(
    (best, reading) => (reading.value.greaterThan(best) ? reading.value : best),
    survey.readings[0]?.value ?? Decimal.zero(),
  );
}

export function evaluateHardness(
  surveys: readonly HardnessSurvey[],
  requirement: HardnessRequirement,
): readonly Finding[] {
  if (!requirement.required) {
    return [];
  }
  if (surveys.length === 0) {
    return [
      deficiency('hardness.no_survey', `a hardness survey is called for: ${requirement.reason}`, {
        clause: 'QW-462.5',
      }),
    ];
  }
  const findings: Finding[] = [];
  for (const survey of surveys) {
    if (survey.scale !== requirement.scale) {
      findings.push(
        blocking(
          'hardness.wrong_scale',
          `survey ${survey.id} was taken on ${survey.scale} and the limit is written on ${requirement.scale}`,
          { subject: survey.id },
        ),
      );
      continue;
    }
    const covered = zonesCovered(survey);
    if (!covered.includes('heat-affected-zone')) {
      findings.push(
        blocking(
          'hardness.zone_missed',
          `survey ${survey.id} never crossed the heat affected zone, which is what the survey is for`,
          { subject: survey.id, details: { covered } },
        ),
      );
    }
    for (const reading of survey.readings) {
      if (reading.value.greaterThan(requirement.limit)) {
        findings.push(
          blocking(
            'hardness.over_limit',
            `${reading.value.toString()} ${survey.scale} in the ${reading.zone} of ${survey.id} against a limit of ${requirement.limit.toString()}`,
            { subject: survey.id, details: { zone: reading.zone } },
          ),
        );
      }
    }
  }
  return findings;
}
