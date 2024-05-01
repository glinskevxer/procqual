import { ValidationError } from '../core/errors.js';

/**
 * The arc welding processes this shop is set up for, and the facts about each
 * one that other rules go on to read.
 *
 * The list is deliberately short. A process the shop does not own equipment
 * for is not a process it can qualify, and half the essential variable tables
 * only make sense for processes that are actually in the building.
 */

export const PROCESS_CODES = ['SMAW', 'GTAW', 'GMAW', 'FCAW', 'SAW', 'PAW'] as const;

export type ProcessCode = (typeof PROCESS_CODES)[number];

/**
 * How the metal crosses the arc.
 *
 * This matters far more than it looks. Short circuiting transfer in GMAW has
 * a documented history of incomplete fusion, so a change into or out of it is
 * an essential variable on its own while a change between spray and globular
 * is not.
 */
export const TRANSFER_MODES = ['spray', 'globular', 'pulsed', 'short-circuiting'] as const;

export type TransferMode = (typeof TRANSFER_MODES)[number];

export interface ProcessFacts {
  readonly code: ProcessCode;
  readonly name: string;
  /** The electrode is melted into the joint rather than only carrying the arc. */
  readonly consumableElectrode: boolean;
  /** Slag has to be cleaned between passes, which shows up in the procedure. */
  readonly slagForming: boolean;
  readonly shieldingGas: 'required' | 'optional' | 'none';
  /** Transfer modes the process can run in, empty where the idea does not apply. */
  readonly transferModes: readonly TransferMode[];
  /** Manual, semi automatic or machine, as the procedure has to state. */
  readonly typicalOperation: 'manual' | 'semi-automatic' | 'machine';
}

const FACTS: Readonly<Record<ProcessCode, ProcessFacts>> = {
  SMAW: {
    code: 'SMAW',
    name: 'shielded metal arc',
    consumableElectrode: true,
    slagForming: true,
    shieldingGas: 'none',
    transferModes: [],
    typicalOperation: 'manual',
  },
  GTAW: {
    code: 'GTAW',
    name: 'gas tungsten arc',
    consumableElectrode: false,
    slagForming: false,
    shieldingGas: 'required',
    transferModes: [],
    typicalOperation: 'manual',
  },
  GMAW: {
    code: 'GMAW',
    name: 'gas metal arc',
    consumableElectrode: true,
    slagForming: false,
    shieldingGas: 'required',
    transferModes: ['spray', 'globular', 'pulsed', 'short-circuiting'],
    typicalOperation: 'semi-automatic',
  },
  FCAW: {
    code: 'FCAW',
    name: 'flux cored arc',
    consumableElectrode: true,
    slagForming: true,
    shieldingGas: 'optional',
    transferModes: ['spray', 'globular'],
    typicalOperation: 'semi-automatic',
  },
  SAW: {
    code: 'SAW',
    name: 'submerged arc',
    consumableElectrode: true,
    slagForming: true,
    shieldingGas: 'none',
    transferModes: [],
    typicalOperation: 'machine',
  },
  PAW: {
    code: 'PAW',
    name: 'plasma arc',
    consumableElectrode: false,
    slagForming: false,
    shieldingGas: 'required',
    transferModes: [],
    typicalOperation: 'machine',
  },
};

export function isProcessCode(value: string): value is ProcessCode {
  return (PROCESS_CODES as readonly string[]).includes(value.toUpperCase());
}

export function parseProcess(value: string): ProcessCode {
  const upper = value.trim().toUpperCase();
  if (!isProcessCode(upper)) {
    throw new ValidationError('process', `not a process this shop runs: ${value}`, {
      value,
      known: PROCESS_CODES,
    });
  }
  return upper;
}

export function processFacts(code: ProcessCode): ProcessFacts {
  const facts = FACTS[code];
  if (facts === undefined) {
    throw new ValidationError('process', `no facts recorded for ${code}`, { code });
  }
  return facts;
}

export function allProcesses(): readonly ProcessFacts[] {
  return PROCESS_CODES.map((code) => processFacts(code));
}

export function supportsTransferMode(code: ProcessCode, mode: TransferMode): boolean {
  return processFacts(code).transferModes.includes(mode);
}

/**
 * Whether a transfer mode change between these two is an essential variable
 * change. Only the move into or out of short circuiting counts.
 */
export function isTransferModeChangeEssential(
  from: TransferMode | undefined,
  to: TransferMode | undefined,
): boolean {
  const left = from === 'short-circuiting';
  const right = to === 'short-circuiting';
  return left !== right;
}

export function describeProcess(code: ProcessCode): string {
  const facts = processFacts(code);
  return `${facts.code} (${facts.name})`;
}

/**
 * Processes whose deposit carries slag, which the procedure has to address in
 * its interpass cleaning clause and which drives the inspection between runs.
 */
export function slagFormingProcesses(): readonly ProcessCode[] {
  return PROCESS_CODES.filter((code) => processFacts(code).slagForming);
}
