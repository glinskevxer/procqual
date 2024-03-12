import { describe, expect, it } from 'vitest';

import {
  allVariables,
  classOf,
  essentialKeys,
  isRecordedFor,
  requiresRequalification,
  toughnessSensitiveKeys,
  variableDefinition,
  variablesForProcess,
} from '../../../src/codes/essentialVariable.js';
import { PROCESS_CODES } from '../../../src/codes/process.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('the register itself', () => {
  it('has a unique key for every variable', () => {
    const keys = allVariables().map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every variable a clause to cite', () => {
    for (const definition of allVariables()) {
      expect(definition.clause).toMatch(/^QW-\d{3}(\.\d+)?$/);
    }
  });

  it('only classifies processes it also lists', () => {
    for (const definition of allVariables()) {
      for (const process of Object.keys(definition.classes)) {
        expect(definition.processes).toContain(process);
      }
      for (const process of definition.processes) {
        expect(definition.classes[process]).toBeDefined();
      }
    }
  });

  it('refuses a key that is not in the register', () => {
    expect(() => variableDefinition('joint.colour')).toThrow(ValidationError);
  });
});

describe('a variable that a process does not record at all', () => {
  it('is a different answer from nonessential', () => {
    expect(classOf('filler.flux', 'SAW', false)).toBe('essential');
    expect(classOf('filler.flux', 'SMAW', false)).toBeUndefined();
    expect(isRecordedFor('filler.flux', 'SMAW')).toBe(false);
    expect(isRecordedFor('filler.flux', 'SAW')).toBe(true);
  });

  it('keeps the transfer mode variable on gas metal arc alone', () => {
    expect(classOf('electrical.transferMode', 'GMAW', false)).toBe('essential');
    expect(classOf('electrical.transferMode', 'FCAW', false)).toBeUndefined();
  });

  it('does not record filler variables for a process with no filler', () => {
    expect(isRecordedFor('filler.fNumber', 'PAW')).toBe(false);
    expect(isRecordedFor('filler.fNumber', 'GTAW')).toBe(true);
  });
});

describe('the toughness switch', () => {
  it('leaves a supplementary variable alone on ordinary work', () => {
    expect(classOf('baseMetal.groupNumber', 'SMAW', false)).toBe('supplementary');
    expect(requiresRequalification('baseMetal.groupNumber', 'SMAW', false)).toBe(false);
  });

  it('turns it essential once the job needs notch toughness', () => {
    expect(classOf('baseMetal.groupNumber', 'SMAW', true)).toBe('essential');
    expect(requiresRequalification('baseMetal.groupNumber', 'SMAW', true)).toBe(true);
  });

  it('leaves an essential variable essential either way', () => {
    expect(classOf('baseMetal.pNumber', 'SMAW', false)).toBe('essential');
    expect(classOf('baseMetal.pNumber', 'SMAW', true)).toBe('essential');
  });

  it('leaves a nonessential variable nonessential either way', () => {
    expect(classOf('technique.peening', 'SMAW', false)).toBe('nonessential');
    expect(classOf('technique.peening', 'SMAW', true)).toBe('nonessential');
  });

  it('lists the variables that will move when toughness is called for', () => {
    const sensitive = toughnessSensitiveKeys('SMAW');
    expect(sensitive).toContain('baseMetal.groupNumber');
    expect(sensitive).toContain('electrical.heatInput');
    expect(sensitive).not.toContain('baseMetal.pNumber');
    expect(sensitive).not.toContain('technique.peening');
  });

  it('adds every one of them to the essential list at once', () => {
    const plain = essentialKeys('SMAW', false);
    const tough = essentialKeys('SMAW', true);
    expect(tough.length).toBe(plain.length + toughnessSensitiveKeys('SMAW').length);
    for (const key of plain) {
      expect(tough).toContain(key);
    }
  });
});

describe('the per process view', () => {
  it('only returns variables the process records', () => {
    for (const process of PROCESS_CODES) {
      for (const entry of variablesForProcess(process, false)) {
        expect(entry.definition.processes).toContain(process);
      }
    }
  });

  it('gives submerged arc its flux and its electrode spacing', () => {
    const keys = variablesForProcess('SAW', false).map((entry) => entry.definition.key);
    expect(keys).toContain('filler.flux');
    expect(keys).toContain('technique.electrodeSpacing');
  });

  it('gives shielded metal arc neither', () => {
    const keys = variablesForProcess('SMAW', false).map((entry) => entry.definition.key);
    expect(keys).not.toContain('filler.flux');
    expect(keys).not.toContain('gas.shieldingComposition');
  });

  it('makes filler diameter supplementary on submerged arc and nonessential elsewhere', () => {
    expect(classOf('filler.diameter', 'SAW', false)).toBe('supplementary');
    expect(classOf('filler.diameter', 'SAW', true)).toBe('essential');
    expect(classOf('filler.diameter', 'SMAW', true)).toBe('nonessential');
  });
});
