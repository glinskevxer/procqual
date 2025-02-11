import { describe, expect, it } from 'vitest';

import { allVariables } from '../../../src/codes/essentialVariable.js';
import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  describeValue,
  readVariable,
  readableKeys,
  sameValue,
  unreadableRegisterKeys,
} from '../../../src/qualification/variables.js';
import { baseVariables } from '../../support/variables.js';

describe('the reader covers the register', () => {
  it('has a reader for every key in the register', () => {
    expect(unreadableRegisterKeys()).toEqual([]);
  });

  it('reads every register key without throwing', () => {
    const variables = baseVariables();
    for (const definition of allVariables()) {
      expect(() => readVariable(variables, definition.key)).not.toThrow();
    }
  });

  it('refuses a key nothing knows about', () => {
    expect(() => readVariable(baseVariables(), 'joint.colour')).toThrow(ValidationError);
  });

  it('lists the keys it can read', () => {
    expect(readableKeys()).toContain('baseMetal.pNumber');
    expect(readableKeys().length).toBeGreaterThanOrEqual(allVariables().length);
  });
});

describe('reading values', () => {
  const variables = baseVariables();

  it('reaches into the nested record', () => {
    expect(readVariable(variables, 'baseMetal.pNumber')).toBe('1');
    expect(readVariable(variables, 'filler.fNumber')).toBe(4);
    expect(readVariable(variables, 'position.verticalProgression')).toBe('uphill');
  });

  it('reads two register keys off the same underlying field', () => {
    expect(readVariable(variables, 'baseMetal.thickness')).toBe(
      readVariable(variables, 'baseMetal.thicknessForToughness'),
    );
  });

  it('flattens the heat treatment condition to none when there was none', () => {
    expect(readVariable(variables, 'pwht.condition')).toBe('none');
    const treated = {
      ...variables,
      pwht: { applied: true, temperature: fahrenheit('1150') },
    };
    expect(describeValue(readVariable(treated, 'pwht.condition'))).toBe('1150 F');
  });

  it('reads a backing gas as present or absent rather than as its composition', () => {
    expect(readVariable(variables, 'gas.backing')).toBe(false);
    expect(readVariable({ ...variables, gas: { backingGas: 'argon' } }, 'gas.backing')).toBe(true);
  });

  it('folds the amperage band into one comparable string', () => {
    expect(readVariable(variables, 'electrical.amperageRange')).toBe('90-140');
  });
});

describe('comparing values', () => {
  it('compares lengths, temperatures and decimals by value', () => {
    expect(sameValue(inches('0.375'), inches('3/8'))).toBe(true);
    expect(sameValue(inches('0.375'), inches('0.5'))).toBe(false);
    expect(sameValue(fahrenheit('250'), fahrenheit('250.0'))).toBe(true);
    expect(sameValue(decimal('1.50'), decimal('1.5'))).toBe(true);
  });

  it('compares plain values by identity', () => {
    expect(sameValue('SMAW', 'SMAW')).toBe(true);
    expect(sameValue(4, 4)).toBe(true);
    expect(sameValue(true, false)).toBe(false);
  });

  it('treats an added value as a change from nothing', () => {
    expect(sameValue(undefined, 'argon')).toBe(false);
    expect(sameValue('argon', undefined)).toBe(false);
    expect(sameValue(undefined, undefined)).toBe(true);
  });

  it('does not confuse two different domain types that print alike', () => {
    expect(sameValue(inches('250'), fahrenheit('250'))).toBe(false);
  });
});

describe('describing values', () => {
  it('prints a domain value through its own toString', () => {
    expect(describeValue(inches('0.375'))).toBe('0.375 in');
    expect(describeValue(fahrenheit('250'))).toBe('250 F');
    expect(describeValue(decimal('1.5'))).toBe('1.5');
  });

  it('prints nothing as none', () => {
    expect(describeValue(undefined)).toBe('none');
  });

  it('prints anything else plainly', () => {
    expect(describeValue(4)).toBe('4');
    expect(describeValue(false)).toBe('false');
    expect(describeValue('SMAW')).toBe('SMAW');
    expect(describeValue(null)).toBe('none');
  });

  it('prints a value nobody planned for as json rather than as an object', () => {
    expect(describeValue({ unexpected: true })).toBe('{"unexpected":true}');
    expect(describeValue([1, 2])).toBe('[1,2]');
  });
});
