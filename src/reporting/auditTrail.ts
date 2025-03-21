import type { PlainDate } from '../core/plainDate.js';
import { PlainDate as Day } from '../core/plainDate.js';
import type { JournalEntry } from '../store/journal.js';

/**
 * Who did what, and when.
 *
 * An auditor asks two questions of a quality system and only one of them is
 * about welding. The other is who is allowed to write in it and what they
 * wrote, and the honest answer for this system is that anybody at a terminal
 * can write anything, with their name against it. The journal is the control,
 * not a permission model, so the report has to make the journal easy enough to
 * read that somebody would actually notice.
 *
 * The counts by day are the useful part. Three hundred entries from one person
 * on a Sunday is not proof of anything and it is exactly the shape of thing an
 * auditor should be shown rather than have to find.
 */

export interface ActorSummary {
  readonly actor: string;
  readonly entries: number;
  readonly types: readonly string[];
  readonly firstAt: string;
  readonly lastAt: string;
}

export interface DaySummary {
  readonly day: string;
  readonly entries: number;
  readonly actors: readonly string[];
}

export function summariseActors(entries: readonly JournalEntry[]): readonly ActorSummary[] {
  const byActor = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const held = byActor.get(entry.actor) ?? [];
    held.push(entry);
    byActor.set(entry.actor, held);
  }
  return [...byActor.entries()]
    .map(([actor, own]) => ({
      actor,
      entries: own.length,
      types: [...new Set(own.map((entry) => entry.type))].sort(),
      firstAt: own[0]?.at ?? '',
      lastAt: own[own.length - 1]?.at ?? '',
    }))
    .sort((left, right) => right.entries - left.entries || left.actor.localeCompare(right.actor));
}

export function summariseDays(entries: readonly JournalEntry[]): readonly DaySummary[] {
  const byDay = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const day = entry.at.slice(0, 10);
    const held = byDay.get(day) ?? [];
    held.push(entry);
    byDay.set(day, held);
  }
  return [...byDay.entries()]
    .map(([day, own]) => ({
      day,
      entries: own.length,
      actors: [...new Set(own.map((entry) => entry.actor))].sort(),
    }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

/** Days that fell on a Saturday or a Sunday, which are worth a second look. */
export function weekendDays(days: readonly DaySummary[]): readonly DaySummary[] {
  return days.filter((day) => {
    const parsed = readDay(day.day);
    if (parsed === undefined) {
      return false;
    }
    const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
    return weekday === 0 || weekday === 6;
  });
}

/**
 * Days carrying far more entries than the rest.
 *
 * Measured against the average of the other days rather than of all of them,
 * because a single enormous day drags the average up far enough to hide
 * itself, which is the one case this is for.
 */
export function busyDays(days: readonly DaySummary[], multiple = 5): readonly DaySummary[] {
  if (days.length < 2) {
    return [];
  }
  const total = days.reduce((running, day) => running + day.entries, 0);
  return days.filter((day) => {
    const others = (total - day.entries) / (days.length - 1);
    return others > 0 && day.entries > others * multiple;
  });
}

export function entriesBetween(
  entries: readonly JournalEntry[],
  from: PlainDate,
  to: PlainDate,
): readonly JournalEntry[] {
  return entries.filter((entry) => {
    const day = readDay(entry.at.slice(0, 10));
    if (day === undefined) {
      return false;
    }
    return day.isOnOrAfter(from) && day.isOnOrBefore(to);
  });
}

function readDay(text: string): Day | undefined {
  try {
    return Day.parse(text);
  } catch {
    return undefined;
  }
}
