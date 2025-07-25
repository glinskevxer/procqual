import { describe, expect, it } from 'vitest';

import {
  allClauses,
  clause,
  clauseAreas,
  clausesIn,
  variableClauses,
} from '../../../src/codes/clause.js';
import { allVariables } from '../../../src/codes/essentialVariable.js';

describe('the list', () => {
  it('is sorted and has no repeats', () => {
    const numbers = allClauses().map((item) => item.number);
    expect([...numbers].sort((left, right) => left.localeCompare(right))).toEqual(numbers);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('gives every clause something about what it decides', () => {
    for (const item of allClauses()) {
      expect(item.what.trim()).not.toBe('');
    }
  });

  it('gives the hand written ones a whole sentence', () => {
    for (const item of allClauses()) {
      if (item.area === 'welding variables') {
        continue;
      }
      expect(item.what.length).toBeGreaterThan(20);
    }
  });

  it('names the areas it covers', () => {
    expect(clauseAreas()).toContain('examination');
    expect(clauseAreas()).toContain('welding variables');
    expect(clausesIn('examination').every((item) => item.area === 'examination')).toBe(true);
  });
});

describe('the variable register', () => {
  it('is read rather than copied, so its clauses are on the list by construction', () => {
    const fromRegister = new Set(allVariables().map((definition) => definition.clause));
    const listed = new Set(allClauses().map((item) => item.number));
    for (const number of fromRegister) {
      expect(listed.has(number)).toBe(true);
    }
  });

  it('folds the variables that share a clause into one entry', () => {
    const clauses = variableClauses();
    expect(new Set(clauses.map((item) => item.number)).size).toBe(clauses.length);
    const thickness = clauses.find((item) => item.number === 'QW-403.6');
    expect(thickness?.what).toContain(';');
  });
});

describe('looking one up', () => {
  it('finds a clause in any case', () => {
    expect(clause('uw-52')?.what).toContain('spot radiography');
    expect(clause(' UW-11 ')?.area).toBe('examination');
  });

  it('finds nothing for one that is not cited', () => {
    expect(clause('UW-99')).toBeUndefined();
  });
});
