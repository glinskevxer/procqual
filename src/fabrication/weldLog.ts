import type { ProcessCode } from '../codes/process.js';
import { blocking, deficiency, type Finding, ValidationError } from '../core/errors.js';
import type { DocumentNumber } from '../core/identifier.js';
import { PlainDate } from '../core/plainDate.js';
import type { Length } from '../core/units.js';
import type { Joint } from './joint.js';

/**
 * The weld log: who put metal in which joint, when, and with what.
 *
 * This is the record that gets read twenty years later. Everything else in the
 * system exists to decide whether an entry should have been allowed. The
 * entries themselves are just facts, and they are written as the work happens
 * rather than reconstructed afterwards, which is why the shape is as small as
 * it is. A foreman with a clipboard fills this in.
 *
 * The one thing worth being strict about is the consumable lot. Traceability
 * runs both ways: from a joint back to the electrode it was welded with, and
 * from a bad batch of electrodes forward to every joint that used it. The
 * second direction is the one that matters on the day it matters, and it only
 * works if the lot was written down at the time.
 */

export type LogRole = 'root' | 'fill' | 'cap' | 'repair' | 'tack';

export interface WeldLogEntry {
  readonly id: string;
  readonly joint: string;
  readonly stencil: string;
  readonly process: ProcessCode;
  readonly procedure: DocumentNumber;
  readonly weldedOn: PlainDate;
  readonly role: LogRole;
  /** Consumable stock code, and the lot or heat number of the reel or tin. */
  readonly consumable: string;
  readonly consumableLot: string;
  readonly depositThickness: Length;
  readonly foreman: string;
}

export function reviewEntry(entry: WeldLogEntry, joint: Joint | undefined): readonly Finding[] {
  const findings: Finding[] = [];
  const subject = entry.id;

  if (joint === undefined) {
    findings.push(
      blocking('log.unknown_joint', `no joint ${entry.joint} on the weld map`, { subject }),
    );
  } else if (!entry.procedure.isSameDocument(joint.procedure)) {
    findings.push(
      blocking(
        'log.wrong_procedure',
        `${entry.joint} is mapped to ${joint.procedure.key()} and the entry names ${entry.procedure.key()}`,
        { subject },
      ),
    );
  }
  if (entry.consumableLot.trim() === '') {
    findings.push(
      blocking(
        'log.no_consumable_lot',
        'the entry names no consumable lot, so a bad batch cannot be traced forward from here',
        { subject },
      ),
    );
  }
  if (!entry.depositThickness.toInches().isPositive()) {
    findings.push(
      blocking('log.no_deposit', 'the entry records no deposited weld metal', { subject }),
    );
  }
  if (entry.foreman.trim() === '' || entry.foreman === entry.stencil) {
    findings.push(
      deficiency('log.unsigned', 'the entry is not signed by anyone but the welder', { subject }),
    );
  }
  return findings;
}

/** Deposit laid in one joint, which has to reach the joint thickness in the end. */
export function depositInJoint(
  entries: readonly WeldLogEntry[],
  joint: string,
): Length | undefined {
  const relevant = entries.filter(
    (entry) => entry.joint === joint && entry.role !== 'repair' && entry.role !== 'tack',
  );
  const first = relevant[0];
  if (first === undefined) {
    return undefined;
  }
  return relevant
    .slice(1)
    .reduce((running, entry) => running.add(entry.depositThickness), first.depositThickness);
}

export function weldersOnJoint(entries: readonly WeldLogEntry[], joint: string): readonly string[] {
  return [
    ...new Set(entries.filter((entry) => entry.joint === joint).map((entry) => entry.stencil)),
  ].sort();
}

export function processesOnJoint(
  entries: readonly WeldLogEntry[],
  joint: string,
): readonly ProcessCode[] {
  return [
    ...new Set(entries.filter((entry) => entry.joint === joint).map((entry) => entry.process)),
  ].sort();
}

/**
 * Every joint a consumable lot went into, which is the question asked on the
 * morning a supplier issues a recall.
 */
export function jointsUsingLot(
  entries: readonly WeldLogEntry[],
  consumable: string,
  lot: string,
): readonly string[] {
  return [
    ...new Set(
      entries
        .filter((entry) => entry.consumable === consumable && entry.consumableLot === lot)
        .map((entry) => entry.joint),
    ),
  ].sort();
}

/** Days a welder deposited metal with one process, for the continuity clock. */
export function usageDates(
  entries: readonly WeldLogEntry[],
  stencil: string,
  process: ProcessCode,
): readonly PlainDate[] {
  const days = new Set(
    entries
      .filter((entry) => entry.stencil === stencil && entry.process === process)
      .map((entry) => entry.weldedOn.toString()),
  );
  return [...days].sort().map((day) => PlainDate.parse(day));
}

export function entriesBetween(
  entries: readonly WeldLogEntry[],
  from: PlainDate,
  to: PlainDate,
): readonly WeldLogEntry[] {
  if (from.isAfter(to)) {
    throw new ValidationError('from', 'the start of the window is after its end', {
      from: from.toString(),
      to: to.toString(),
    });
  }
  return entries.filter(
    (entry) => entry.weldedOn.isOnOrAfter(from) && entry.weldedOn.isOnOrBefore(to),
  );
}
