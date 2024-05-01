import { ValidationError } from '../core/errors.js';
import { PROCESS_CODES, type ProcessCode } from './process.js';

/**
 * The variable register.
 *
 * This is the spine of procedure qualification. Every fact recorded about how
 * a weld was made falls into one of three classes, and the class decides what
 * happens when the fact changes on a production joint:
 *
 *   essential        the procedure has to be requalified
 *   supplementary    only essential when the work needs notch toughness
 *   nonessential     the procedure is revised, no requalification
 *
 * The middle class is the whole reason this file is a table rather than a
 * switch. Whether a variable is essential is not a property of the variable.
 * It is decided by the construction code's toughness requirement, which is a
 * property of the vessel, which is not known when the procedure is written.
 * The same recorded change is a paperwork revision on one job and a scrapped
 * procedure on the next.
 */

export type VariableClass = 'essential' | 'supplementary' | 'nonessential';

export type VariableGroup =
  | 'joints'
  | 'base-metals'
  | 'filler-metals'
  | 'positions'
  | 'preheat'
  | 'post-weld-heat-treatment'
  | 'gas'
  | 'electrical'
  | 'technique';

export interface VariableDefinition {
  /** Stable key, matching the field name on a recorded variable set. */
  readonly key: string;
  readonly clause: string;
  readonly group: VariableGroup;
  readonly label: string;
  /** Processes the variable is recorded for. */
  readonly processes: readonly ProcessCode[];
  /**
   * The class this variable holds for each process. A process missing from the
   * map does not record the variable at all.
   */
  readonly classes: Readonly<Partial<Record<ProcessCode, VariableClass>>>;
}

const ALL: readonly ProcessCode[] = PROCESS_CODES;
const ARC_WITH_FILLER: readonly ProcessCode[] = ['SMAW', 'GTAW', 'GMAW', 'FCAW', 'SAW'];

function uniform(
  processes: readonly ProcessCode[],
  value: VariableClass,
): Readonly<Partial<Record<ProcessCode, VariableClass>>> {
  const out: Partial<Record<ProcessCode, VariableClass>> = {};
  for (const process of processes) {
    out[process] = value;
  }
  return out;
}

const DEFINITIONS: readonly VariableDefinition[] = [
  {
    key: 'joint.grooveDesign',
    clause: 'QW-402.1',
    group: 'joints',
    label: 'groove design',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'joint.backing',
    clause: 'QW-402.4',
    group: 'joints',
    label: 'backing added or removed',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'joint.retainers',
    clause: 'QW-402.11',
    group: 'joints',
    label: 'nonmetallic or nonfusing retainers',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'baseMetal.pNumber',
    clause: 'QW-403.11',
    group: 'base-metals',
    label: 'base metal P number',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'baseMetal.groupNumber',
    clause: 'QW-403.6',
    group: 'base-metals',
    label: 'base metal group number',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'baseMetal.thickness',
    clause: 'QW-403.8',
    group: 'base-metals',
    label: 'base metal thickness outside the qualified range',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'baseMetal.thicknessForToughness',
    clause: 'QW-403.6',
    group: 'base-metals',
    label: 'base metal thickness for impact tested work',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'filler.fNumber',
    clause: 'QW-404.5',
    group: 'filler-metals',
    label: 'filler metal F number',
    processes: ARC_WITH_FILLER,
    classes: uniform(ARC_WITH_FILLER, 'essential'),
  },
  {
    key: 'filler.aNumber',
    clause: 'QW-404.6',
    group: 'filler-metals',
    label: 'weld deposit A number',
    processes: ARC_WITH_FILLER,
    classes: uniform(ARC_WITH_FILLER, 'essential'),
  },
  {
    key: 'filler.diameter',
    clause: 'QW-404.30',
    group: 'filler-metals',
    label: 'filler metal diameter',
    processes: ARC_WITH_FILLER,
    classes: {
      SMAW: 'nonessential',
      GTAW: 'nonessential',
      GMAW: 'nonessential',
      FCAW: 'nonessential',
      SAW: 'supplementary',
    },
  },
  {
    key: 'filler.depositThickness',
    clause: 'QW-404.32',
    group: 'filler-metals',
    label: 'deposited weld metal thickness',
    processes: ARC_WITH_FILLER,
    classes: uniform(ARC_WITH_FILLER, 'essential'),
  },
  {
    key: 'filler.supplementalPowder',
    clause: 'QW-404.24',
    group: 'filler-metals',
    label: 'supplemental filler or powder added',
    processes: ['GTAW', 'PAW', 'SAW'],
    classes: { GTAW: 'essential', PAW: 'essential', SAW: 'essential' },
  },
  {
    key: 'filler.flux',
    clause: 'QW-404.9',
    group: 'filler-metals',
    label: 'flux designation',
    processes: ['SAW'],
    classes: { SAW: 'essential' },
  },
  {
    key: 'position.groovePosition',
    clause: 'QW-405.1',
    group: 'positions',
    label: 'position of the groove weld',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'position.verticalProgression',
    clause: 'QW-405.3',
    group: 'positions',
    label: 'vertical progression uphill or downhill',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'position.positionForToughness',
    clause: 'QW-405.2',
    group: 'positions',
    label: 'position where notch toughness is required',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'preheat.minimum',
    clause: 'QW-406.1',
    group: 'preheat',
    label: 'minimum preheat temperature',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'preheat.maintenance',
    clause: 'QW-406.2',
    group: 'preheat',
    label: 'preheat maintenance',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'preheat.interpassMaximum',
    clause: 'QW-406.3',
    group: 'preheat',
    label: 'maximum interpass temperature',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'pwht.condition',
    clause: 'QW-407.1',
    group: 'post-weld-heat-treatment',
    label: 'post weld heat treatment condition',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'pwht.holdingTime',
    clause: 'QW-407.2',
    group: 'post-weld-heat-treatment',
    label: 'post weld heat treatment holding time range',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'gas.shieldingComposition',
    clause: 'QW-408.2',
    group: 'gas',
    label: 'shielding gas composition',
    processes: ['GTAW', 'GMAW', 'FCAW', 'PAW'],
    classes: { GTAW: 'essential', GMAW: 'essential', FCAW: 'essential', PAW: 'essential' },
  },
  {
    key: 'gas.shieldingFlowRate',
    clause: 'QW-408.3',
    group: 'gas',
    label: 'shielding gas flow rate',
    processes: ['GTAW', 'GMAW', 'FCAW', 'PAW'],
    classes: {
      GTAW: 'nonessential',
      GMAW: 'nonessential',
      FCAW: 'nonessential',
      PAW: 'nonessential',
    },
  },
  {
    key: 'gas.backing',
    clause: 'QW-408.5',
    group: 'gas',
    label: 'backing gas added or removed',
    processes: ['GTAW', 'GMAW', 'PAW'],
    classes: { GTAW: 'essential', GMAW: 'essential', PAW: 'essential' },
  },
  {
    key: 'electrical.currentPolarity',
    clause: 'QW-409.4',
    group: 'electrical',
    label: 'current type or polarity',
    processes: ALL,
    classes: uniform(ALL, 'essential'),
  },
  {
    key: 'electrical.transferMode',
    clause: 'QW-409.2',
    group: 'electrical',
    label: 'transfer mode into or out of short circuiting',
    processes: ['GMAW'],
    classes: { GMAW: 'essential' },
  },
  {
    key: 'electrical.heatInput',
    clause: 'QW-409.1',
    group: 'electrical',
    label: 'heat input above what was qualified',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'electrical.amperageRange',
    clause: 'QW-409.8',
    group: 'electrical',
    label: 'amperage range',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'technique.stringOrWeave',
    clause: 'QW-410.1',
    group: 'technique',
    label: 'stringer or weave bead',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'technique.multipleToSingle',
    clause: 'QW-410.9',
    group: 'technique',
    label: 'multiple to single pass per side',
    processes: ALL,
    classes: uniform(ALL, 'supplementary'),
  },
  {
    key: 'technique.peening',
    clause: 'QW-410.26',
    group: 'technique',
    label: 'peening',
    processes: ALL,
    classes: uniform(ALL, 'nonessential'),
  },
  {
    key: 'technique.electrodeSpacing',
    clause: 'QW-410.10',
    group: 'technique',
    label: 'electrode spacing',
    processes: ['SAW'],
    classes: { SAW: 'nonessential' },
  },
  {
    key: 'technique.closedToOutChamber',
    clause: 'QW-410.15',
    group: 'technique',
    label: 'closed chamber to out of chamber welding',
    processes: ['GTAW', 'PAW'],
    classes: { GTAW: 'essential', PAW: 'essential' },
  },
];

const BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));

export function allVariables(): readonly VariableDefinition[] {
  return DEFINITIONS;
}

export function variableDefinition(key: string): VariableDefinition {
  const definition = BY_KEY.get(key);
  if (definition === undefined) {
    throw new ValidationError('variable', `no such welding variable: ${key}`, { key });
  }
  return definition;
}

export function isRecordedFor(key: string, process: ProcessCode): boolean {
  return variableDefinition(key).classes[process] !== undefined;
}

/**
 * The class a variable holds for one process on one job.
 *
 * Returns undefined when the process does not record the variable at all,
 * which is a different answer from nonessential and has to stay that way. A
 * flux designation is not a nonessential variable for shielded metal arc, it
 * is not a variable at all.
 */
export function classOf(
  key: string,
  process: ProcessCode,
  impactTestingRequired: boolean,
): VariableClass | undefined {
  const declared = variableDefinition(key).classes[process];
  if (declared === undefined) {
    return undefined;
  }
  if (declared === 'supplementary' && impactTestingRequired) {
    return 'essential';
  }
  return declared;
}

export function requiresRequalification(
  key: string,
  process: ProcessCode,
  impactTestingRequired: boolean,
): boolean {
  return classOf(key, process, impactTestingRequired) === 'essential';
}

export function variablesForProcess(
  process: ProcessCode,
  impactTestingRequired: boolean,
): readonly { definition: VariableDefinition; variableClass: VariableClass }[] {
  const out: { definition: VariableDefinition; variableClass: VariableClass }[] = [];
  for (const definition of DEFINITIONS) {
    const variableClass = classOf(definition.key, process, impactTestingRequired);
    if (variableClass !== undefined) {
      out.push({ definition, variableClass });
    }
  }
  return out;
}

export function essentialKeys(
  process: ProcessCode,
  impactTestingRequired: boolean,
): readonly string[] {
  return variablesForProcess(process, impactTestingRequired)
    .filter((entry) => entry.variableClass === 'essential')
    .map((entry) => entry.definition.key);
}

/** Variables that change class the moment the job asks for notch toughness. */
export function toughnessSensitiveKeys(process: ProcessCode): readonly string[] {
  return DEFINITIONS.filter((definition) => definition.classes[process] === 'supplementary').map(
    (definition) => definition.key,
  );
}
