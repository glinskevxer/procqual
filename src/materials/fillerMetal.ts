import { parseClassification, type FillerClassification } from '../codes/classification.js';
import { needsAtmosphericControl } from '../codes/fnumber.js';
import type { ProcessCode } from '../codes/process.js';
import { ValidationError } from '../core/errors.js';
import { inches, Length } from '../core/units.js';

/**
 * The consumables the store room keeps.
 *
 * A stock item is a classification plus the sizes bought and the processes it
 * is run with. The interesting part is matching one to a joint. Filler for a
 * joint between two different base metal families is not a compromise between
 * the two, it is usually a third alloy chosen because it will tolerate the
 * dilution from both sides. Putting a carbon steel rod in a carbon to
 * stainless joint gives a brittle martensitic band at the fusion line, and the
 * matching rules below exist to stop that being someone's judgement call at
 * two in the morning.
 */

export interface StockItem {
  readonly code: string;
  readonly specification: string;
  readonly classification: string;
  readonly tradeName: string;
  readonly processes: readonly ProcessCode[];
  readonly diameters: readonly Length[];
  /** Base metal P numbers this consumable is bought to weld. */
  readonly suitsPNumbers: readonly string[];
}

const STOCK: readonly StockItem[] = [
  {
    code: 'E7018-1/8',
    specification: 'SFA-5.1',
    classification: 'E7018',
    tradeName: 'Atom Arc 7018',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8'), inches('5/32')],
    suitsPNumbers: ['1'],
  },
  {
    code: 'E6010-1/8',
    specification: 'SFA-5.1',
    classification: 'E6010',
    tradeName: 'Fleetweld 5P',
    processes: ['SMAW'],
    diameters: [inches('1/8'), inches('5/32')],
    suitsPNumbers: ['1'],
  },
  {
    code: 'E8018-B2',
    specification: 'SFA-5.5',
    classification: 'E8018-B2',
    tradeName: 'Chromet 1',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8')],
    suitsPNumbers: ['4'],
  },
  {
    code: 'E9018-B3',
    specification: 'SFA-5.5',
    classification: 'E9018-B3',
    tradeName: 'Chromet 2',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8')],
    suitsPNumbers: ['5A'],
  },
  {
    code: 'E9015-B9',
    specification: 'SFA-5.5',
    classification: 'E9015-B9',
    tradeName: 'Chromet 9MV-N',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8')],
    suitsPNumbers: ['15E'],
  },
  {
    code: 'E308L-16',
    specification: 'SFA-5.4',
    classification: 'E308L-16',
    tradeName: 'Arosta 304L',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8')],
    suitsPNumbers: ['8'],
  },
  {
    code: 'E309L-16',
    specification: 'SFA-5.4',
    classification: 'E309L-16',
    tradeName: 'Arosta 309S',
    processes: ['SMAW'],
    diameters: [inches('3/32'), inches('1/8')],
    suitsPNumbers: ['8', '1'],
  },
  {
    code: 'ER70S-2',
    specification: 'SFA-5.18',
    classification: 'ER70S-2',
    tradeName: 'Supra TIG',
    processes: ['GTAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['1'],
  },
  {
    code: 'ER70S-6',
    specification: 'SFA-5.18',
    classification: 'ER70S-6',
    tradeName: 'Supra MIG',
    processes: ['GMAW'],
    diameters: [inches('0.035'), inches('0.045')],
    suitsPNumbers: ['1'],
  },
  {
    code: 'ER80S-B2',
    specification: 'SFA-5.28',
    classification: 'ER80S-B2',
    tradeName: 'Chromet TIG 1',
    processes: ['GTAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['4'],
  },
  {
    code: 'ER90S-B3',
    specification: 'SFA-5.28',
    classification: 'ER90S-B3',
    tradeName: 'Chromet TIG 2',
    processes: ['GTAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['5A'],
  },
  {
    code: 'ER308L',
    specification: 'SFA-5.9',
    classification: 'ER308L',
    tradeName: 'Thermanit JE-308L',
    processes: ['GTAW', 'GMAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['8'],
  },
  {
    code: 'ER309L',
    specification: 'SFA-5.9',
    classification: 'ER309L',
    tradeName: 'Thermanit JE-309L',
    processes: ['GTAW', 'GMAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['8', '1'],
  },
  {
    code: 'ER2209',
    specification: 'SFA-5.9',
    classification: 'ER2209',
    tradeName: 'Thermanit 22/09',
    processes: ['GTAW', 'GMAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['10H'],
  },
  {
    code: 'ERNiCrMo-3',
    specification: 'SFA-5.14',
    classification: 'ERNiCrMo-3',
    tradeName: 'Nimrod 625',
    processes: ['GTAW', 'GMAW'],
    diameters: [inches('1/16'), inches('3/32')],
    suitsPNumbers: ['43', '10H', '8'],
  },
  {
    code: 'EM12K',
    specification: 'SFA-5.17',
    classification: 'EM12K',
    tradeName: 'Autrod 12.20',
    processes: ['SAW'],
    diameters: [inches('1/8'), inches('5/32')],
    suitsPNumbers: ['1'],
  },
];

const BY_CODE = new Map(STOCK.map((item) => [item.code.toUpperCase(), item]));

/** Dissimilar pairs the shop has a standing answer for. */
const DISSIMILAR_ANSWERS: readonly { pair: readonly [string, string]; codes: readonly string[] }[] = [
  { pair: ['1', '8'], codes: ['E309L-16', 'ER309L', 'ERNiCrMo-3'] },
  { pair: ['1', '4'], codes: ['E8018-B2', 'ER80S-B2'] },
  { pair: ['1', '5A'], codes: ['E9018-B3', 'ER90S-B3'] },
  { pair: ['8', '10H'], codes: ['ER2209', 'ERNiCrMo-3'] },
  { pair: ['1', '43'], codes: ['ERNiCrMo-3'] },
];

export function allStock(): readonly StockItem[] {
  return STOCK;
}

export function stockItem(code: string): StockItem {
  const item = BY_CODE.get(code.trim().toUpperCase());
  if (item === undefined) {
    throw new ValidationError('filler', `not a consumable the store room keeps: ${code}`, { code });
  }
  return item;
}

export function classificationOf(code: string): FillerClassification {
  const item = stockItem(code);
  return parseClassification(`${item.specification} ${item.classification}`);
}

export function stocksDiameter(code: string, diameter: Length): boolean {
  return stockItem(code).diameters.some((held) => held.equals(diameter));
}

export function needsHoldingOven(code: string): boolean {
  const facts = classificationOf(code);
  return facts.fNumber !== undefined && needsAtmosphericControl(facts.fNumber);
}

export function stockForProcess(process: ProcessCode): readonly StockItem[] {
  return STOCK.filter((item) => item.processes.includes(process));
}

/**
 * Consumables the shop is willing to put in a joint between these two metals.
 *
 * For a joint between like metals it is whatever suits that P number. For a
 * joint between two families it is the standing answer for that pair, which is
 * usually a third alloy rather than either side's own filler, and an empty
 * list means the welding engineer has to write the combination up rather than
 * pick something off the shelf.
 */
export function fillersForJoint(left: string, right: string): readonly StockItem[] {
  if (left === right) {
    return STOCK.filter((item) => item.suitsPNumbers.includes(left));
  }
  const answer = DISSIMILAR_ANSWERS.find(
    ({ pair }) =>
      (pair[0] === left && pair[1] === right) || (pair[0] === right && pair[1] === left),
  );
  if (answer === undefined) {
    return [];
  }
  return answer.codes.map((code) => stockItem(code));
}

export function isFillerAllowed(code: string, left: string, right: string): boolean {
  return fillersForJoint(left, right).some((item) => item.code === code);
}
