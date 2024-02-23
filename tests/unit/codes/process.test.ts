import { describe, expect, it } from 'vitest';

import {
  allProcesses,
  describeProcess,
  isProcessCode,
  isTransferModeChangeEssential,
  parseProcess,
  processFacts,
  PROCESS_CODES,
  slagFormingProcesses,
  supportsTransferMode,
} from '../../../src/codes/process.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('parsing', () => {
  it('accepts the processes the shop runs, in any case', () => {
    expect(parseProcess('smaw')).toBe('SMAW');
    expect(parseProcess(' GTAW ')).toBe('GTAW');
  });

  it('refuses a process the shop has no equipment for', () => {
    expect(() => parseProcess('EBW')).toThrow(ValidationError);
    expect(() => parseProcess('EBW')).toThrow(/not a process this shop runs/);
  });

  it('has a guard that matches the parser', () => {
    for (const code of PROCESS_CODES) {
      expect(isProcessCode(code)).toBe(true);
    }
    expect(isProcessCode('ESW')).toBe(false);
  });
});

describe('facts', () => {
  it('knows which processes melt their electrode', () => {
    expect(processFacts('SMAW').consumableElectrode).toBe(true);
    expect(processFacts('GTAW').consumableElectrode).toBe(false);
    expect(processFacts('PAW').consumableElectrode).toBe(false);
  });

  it('knows which ones leave slag to clean between passes', () => {
    expect(slagFormingProcesses()).toEqual(['SMAW', 'FCAW', 'SAW']);
  });

  it('records the shielding gas position of each process', () => {
    expect(processFacts('GTAW').shieldingGas).toBe('required');
    expect(processFacts('FCAW').shieldingGas).toBe('optional');
    expect(processFacts('SMAW').shieldingGas).toBe('none');
  });

  it('returns every process with its facts', () => {
    const list = allProcesses();
    expect(list).toHaveLength(PROCESS_CODES.length);
    expect(list.map((facts) => facts.code)).toEqual([...PROCESS_CODES]);
  });

  it('describes a process for a printed procedure', () => {
    expect(describeProcess('SAW')).toBe('SAW (submerged arc)');
  });
});

describe('transfer modes', () => {
  it('only applies them to the processes that have them', () => {
    expect(supportsTransferMode('GMAW', 'short-circuiting')).toBe(true);
    expect(supportsTransferMode('FCAW', 'spray')).toBe(true);
    expect(supportsTransferMode('FCAW', 'short-circuiting')).toBe(false);
    expect(supportsTransferMode('SMAW', 'spray')).toBe(false);
  });

  it('treats only a move across short circuiting as essential', () => {
    expect(isTransferModeChangeEssential('spray', 'short-circuiting')).toBe(true);
    expect(isTransferModeChangeEssential('short-circuiting', 'pulsed')).toBe(true);
    expect(isTransferModeChangeEssential('spray', 'globular')).toBe(false);
    expect(isTransferModeChangeEssential('spray', 'pulsed')).toBe(false);
    expect(isTransferModeChangeEssential(undefined, undefined)).toBe(false);
    expect(isTransferModeChangeEssential(undefined, 'short-circuiting')).toBe(true);
  });
});
