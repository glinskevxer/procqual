import { judgeExamination } from '../nde/acceptance.js';
import { allReadings, ratePolicyOf, type RateReading, type WeldRecord } from '../nde/repairRate.js';
import type { PlainDate } from '../core/plainDate.js';
import type { Workspace } from '../store/workspace.js';

/**
 * Turning the records into repair rate readings.
 *
 * The awkward part is deciding who owns a rejected radiograph. A joint has
 * one radiograph and usually several welders, and blaming all of them for one
 * piece of slag is unfair in a way that shows up as everybody sitting on the
 * watch list and nobody taking it seriously. So a rejection counts against
 * whoever laid the fill and cap runs, because that is where the indications
 * that get found by radiography nearly always are, and a root run welder is
 * only counted when nobody else worked the joint.
 */

const FILL_ROLES = new Set(['fill', 'cap']);

export function weldRecordsFor(workspace: Workspace): readonly WeldRecord[] {
  const records: WeldRecord[] = [];
  for (const joint of workspace.fabrication.joints()) {
    const entries = workspace.fabrication.entries(joint.id);
    if (entries.length === 0) {
      continue;
    }
    const examinations = workspace.examinations
      .examinations(joint.id)
      .filter((item) => item.method === 'RT' || item.method === 'UT');
    if (examinations.length === 0) {
      continue;
    }
    const repaired = examinations.some((item) => !judgeExamination(item, joint.thickness).accepted);
    const examinedOn = examinations
      .map((item) => item.performedOn)
      .reduce((latest, day) => (day.isAfter(latest) ? day : latest));

    for (const stencil of ownersOf(entries)) {
      const process = entries.find((entry) => entry.stencil === stencil)?.process;
      if (process === undefined) {
        continue;
      }
      records.push({ stencil, process, joint: joint.id, examinedOn, repaired });
    }
  }
  return records;
}

function ownersOf(entries: readonly { stencil: string; role: string }[]): readonly string[] {
  const fill = entries.filter((entry) => FILL_ROLES.has(entry.role)).map((entry) => entry.stencil);
  const owners = fill.length > 0 ? fill : entries.map((entry) => entry.stencil);
  return [...new Set(owners)].sort();
}

export function repairRates(workspace: Workspace, on: PlainDate): readonly RateReading[] {
  return allReadings(weldRecordsFor(workspace), on, ratePolicyOf(workspace.policy));
}
