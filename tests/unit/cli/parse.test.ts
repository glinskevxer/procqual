import { describe, expect, it } from 'vitest';

import {
  parseCertificationLevel,
  parseExaminationMethod,
  parseExtent,
  parseIndicationType,
  parseJointType,
  parseLogRole,
  parseProductForm,
  parseProductionPosition,
  parseRadiographyLevel,
  parseWeldType,
} from '../../../src/cli/parse.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('the case insensitive vocabularies', () => {
  it('reads a production position', () => {
    expect(parseProductionPosition('Vertical')).toBe('vertical');
    expect(parseProductionPosition(' overhead ')).toBe('overhead');
    expect(() => parseProductionPosition('sideways')).toThrow(/not a production position/);
  });

  it('reads an examination level', () => {
    expect(parseRadiographyLevel('FULL')).toBe('full');
    expect(() => parseRadiographyLevel('partial')).toThrow(ValidationError);
  });

  it('reads a weld log role', () => {
    expect(parseLogRole('Root')).toBe('root');
    expect(() => parseLogRole('middle')).toThrow(/not a weld log role/);
  });

  it('reads an examination method in either case', () => {
    expect(parseExaminationMethod('rt')).toBe('RT');
    expect(parseExaminationMethod(' PT ')).toBe('PT');
    expect(() => parseExaminationMethod('XX')).toThrow(/not an examination method/);
  });

  it('reads a certification level in either case', () => {
    expect(parseCertificationLevel('ii')).toBe('II');
    expect(() => parseCertificationLevel('IV')).toThrow(/not a certification level/);
  });

  it('reads an indication type', () => {
    expect(parseIndicationType('Slag')).toBe('slag');
    expect(parseIndicationType('incomplete-fusion')).toBe('incomplete-fusion');
    expect(() => parseIndicationType('rust')).toThrow(/not an indication type/);
  });

  it('reads a weld type and a product form', () => {
    expect(parseWeldType('Fillet')).toBe('fillet');
    expect(parseProductForm('PIPE')).toBe('pipe');
    expect(() => parseWeldType('seam')).toThrow(ValidationError);
    expect(() => parseProductForm('tube')).toThrow(ValidationError);
  });

  it('reads an examination extent', () => {
    expect(parseExtent('Spot')).toBe('spot');
    expect(() => parseExtent('none')).toThrow(ValidationError);
  });
});

describe('the joint construction type', () => {
  it('reads a number in range', () => {
    expect(parseJointType('1')).toBe(1);
    expect(parseJointType('7')).toBe(7);
  });

  it('refuses one out of range or not a number at all', () => {
    expect(() => parseJointType('8')).toThrow(/not a joint construction type/);
    expect(() => parseJointType('0')).toThrow(ValidationError);
    expect(() => parseJointType('butt')).toThrow(ValidationError);
  });
});

describe('the error itself', () => {
  it('names the field and lists what was allowed', () => {
    try {
      parseLogRole('middle');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.field).toBe('role');
        expect(error.details.allowed).toEqual(['root', 'fill', 'cap', 'repair', 'tack']);
      }
    }
  });
});
