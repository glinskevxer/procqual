import { describe, expect, it } from 'vitest';

import { allANumbers } from '../../../src/codes/anumber.js';
import { allFNumbers, fNumbersQualifiedBy } from '../../../src/codes/fnumber.js';
import { allPNumbers, pNumbersQualifiedBy } from '../../../src/codes/pnumber.js';
import { PROCESS_CODES, processFacts } from '../../../src/codes/process.js';
import {
  PRODUCTION_POSITIONS,
  TEST_POSITIONS,
  positionsQualifiedBy,
} from '../../../src/codes/position.js';

/**
 * Invariants that hold across the code tables rather than inside any one of
 * them.
 *
 * Each table has its own suite already. What none of those can see is a table
 * that contradicts another one, which is how a new P number gets added with a
 * downward reach to a family that was never listed, or a filler group gets
 * added for a process the shop does not run.
 */

describe('the base metal groups', () => {
  it('only reach down to families that exist', () => {
    const known = new Set(allPNumbers().map((facts) => facts.code));
    for (const facts of allPNumbers()) {
      for (const reached of pNumbersQualifiedBy(facts.code)) {
        expect(known.has(reached)).toBe(true);
      }
    }
  });

  it('always reach themselves first', () => {
    for (const facts of allPNumbers()) {
      expect(pNumbersQualifiedBy(facts.code)[0]).toBe(facts.code);
    }
  });

  it('never reach the same family twice', () => {
    for (const facts of allPNumbers()) {
      const reached = pNumbersQualifiedBy(facts.code);
      expect(new Set(reached).size).toBe(reached.length);
    }
  });

  it('give every family at least one group number', () => {
    for (const facts of allPNumbers()) {
      expect(facts.groups.length).toBeGreaterThan(0);
      expect([...facts.groups].sort((left, right) => left - right)).toEqual([...facts.groups]);
    }
  });
});

describe('the filler groups', () => {
  it('are only used with processes the shop runs', () => {
    const known = new Set<string>(PROCESS_CODES);
    for (const facts of allFNumbers()) {
      expect(facts.processes.length).toBeGreaterThan(0);
      for (const process of facts.processes) {
        expect(known.has(process)).toBe(true);
      }
    }
  });

  it('only reach groups that exist, and only downward', () => {
    const known = new Set(allFNumbers().map((facts) => facts.code));
    for (const facts of allFNumbers()) {
      for (const process of facts.processes) {
        for (const reached of fNumbersQualifiedBy(facts.code, process)) {
          expect(known.has(reached)).toBe(true);
          expect(reached).toBeLessThanOrEqual(facts.code);
        }
      }
    }
  });

  it('put bare wire on the wire processes and covered electrodes on shielded metal arc', () => {
    for (const facts of allFNumbers()) {
      if (facts.bareWire) {
        expect(facts.processes).not.toContain('SMAW');
      } else {
        expect(facts.processes).toEqual(['SMAW']);
      }
    }
  });
});

describe('the deposit groups', () => {
  it('are numbered without repeats and describe themselves', () => {
    const codes = allANumbers().map((facts) => facts.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const facts of allANumbers()) {
      expect(facts.description.length).toBeGreaterThan(4);
      expect(facts.bands.length).toBeGreaterThan(0);
    }
  });
});

describe('the position table', () => {
  it('only ever names production positions that exist', () => {
    const known = new Set<string>(PRODUCTION_POSITIONS);
    for (const position of TEST_POSITIONS) {
      for (const weldType of ['groove', 'fillet'] as const) {
        for (const qualified of positionsQualifiedBy(position, weldType)) {
          expect(known.has(qualified)).toBe(true);
        }
      }
    }
  });

  it('never lets a coupon qualify fewer fillet positions than groove ones', () => {
    for (const position of TEST_POSITIONS) {
      const groove = positionsQualifiedBy(position, 'groove');
      const fillet = positionsQualifiedBy(position, 'fillet');
      for (const qualified of groove) {
        expect(fillet).toContain(qualified);
      }
    }
  });
});

describe('the processes', () => {
  it('all describe themselves and agree with their own code', () => {
    for (const process of PROCESS_CODES) {
      const facts = processFacts(process);
      expect(facts.code).toBe(process);
      expect(facts.name.length).toBeGreaterThan(4);
    }
  });

  it('only carry transfer modes where the idea applies', () => {
    for (const process of PROCESS_CODES) {
      const facts = processFacts(process);
      if (facts.transferModes.length > 0) {
        expect(facts.consumableElectrode).toBe(true);
      }
    }
  });
});
