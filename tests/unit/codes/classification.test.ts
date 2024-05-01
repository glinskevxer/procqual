import { describe, expect, it } from 'vitest';

import { describeClassification, parseClassification } from '../../../src/codes/classification.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('covered electrodes', () => {
  it('reads E7018 out of its four digits', () => {
    const facts = parseClassification('SFA-5.1 E7018');
    expect(facts.specification).toBe('5.1');
    expect(facts.designator).toBe('E');
    expect(facts.minimumTensileKsi).toBe(70);
    expect(facts.usabilityCode).toBe(18);
    expect(facts.fNumber).toBe(4);
    expect(facts.aNumber).toBe(1);
    expect(facts.lowHydrogen).toBe(true);
    expect(facts.allPosition).toBe(true);
  });

  it('reads the cellulosic and rutile groups', () => {
    expect(parseClassification('SFA-5.1 E6010').fNumber).toBe(3);
    expect(parseClassification('SFA-5.1 E6013').fNumber).toBe(2);
    expect(parseClassification('SFA-5.1 E7024').fNumber).toBe(1);
  });

  it('knows which coatings are low hydrogen', () => {
    expect(parseClassification('SFA-5.1 E7016').lowHydrogen).toBe(true);
    expect(parseClassification('SFA-5.1 E6010').lowHydrogen).toBe(false);
    expect(parseClassification('SFA-5.1 E7024').lowHydrogen).toBe(false);
  });

  it('reads the position digit', () => {
    expect(parseClassification('SFA-5.1 E7018').allPosition).toBe(true);
    expect(parseClassification('SFA-5.1 E7028').allPosition).toBe(false);
  });

  it('takes a three digit strength', () => {
    const facts = parseClassification('SFA-5.5 E10018-D2');
    expect(facts.minimumTensileKsi).toBe(100);
    expect(facts.fNumber).toBe(4);
    expect(facts.aNumber).toBe(11);
  });

  it('reads the alloy suffix into a deposit group', () => {
    expect(parseClassification('SFA-5.5 E8018-B2').aNumber).toBe(3);
    expect(parseClassification('SFA-5.5 E9018-B3').aNumber).toBe(4);
    expect(parseClassification('SFA-5.5 E8018-B8').aNumber).toBe(5);
    expect(parseClassification('SFA-5.5 E8018-C1').aNumber).toBe(10);
    expect(parseClassification('SFA-5.5 E7018-A1').aNumber).toBe(2);
  });

  it('leaves the deposit group undefined for a suffix it does not know', () => {
    expect(parseClassification('SFA-5.5 E9018-XX').aNumber).toBeUndefined();
  });
});

describe('solid and cored wire', () => {
  it('reads ER70S-6 as bare wire', () => {
    const facts = parseClassification('SFA-5.18 ER70S-6');
    expect(facts.designator).toBe('ER');
    expect(facts.fNumber).toBe(6);
    expect(facts.aNumber).toBe(1);
    expect(facts.minimumTensileKsi).toBe(70);
  });

  it('reads an alloyed wire suffix', () => {
    expect(parseClassification('SFA-5.28 ER80S-D2').aNumber).toBe(11);
    expect(parseClassification('SFA-5.28 ER80S-B2').aNumber).toBe(3);
  });

  it('reads a flux cored wire', () => {
    const facts = parseClassification('SFA-5.20 E71T-1');
    expect(facts.fNumber).toBe(6);
    expect(facts.designator).toBe('E');
  });
});

describe('stainless', () => {
  it('reads a covered stainless electrode into group five', () => {
    const facts = parseClassification('SFA-5.4 E308L-16');
    expect(facts.fNumber).toBe(5);
    expect(facts.aNumber).toBe(8);
    expect(facts.usabilityCode).toBe(16);
  });

  it('reads a bare stainless rod into group six', () => {
    const facts = parseClassification('SFA-5.9 ER316L');
    expect(facts.fNumber).toBe(6);
    expect(facts.aNumber).toBe(8);
  });

  it('sends the high nickel grades to deposit group nine', () => {
    expect(parseClassification('SFA-5.9 ER310').aNumber).toBe(9);
    expect(parseClassification('SFA-5.4 E310-16').aNumber).toBe(9);
    expect(parseClassification('SFA-5.9 ER309L').aNumber).toBe(8);
  });
});

describe('duplex and nickel', () => {
  it('reads a four digit duplex grade', () => {
    const facts = parseClassification('SFA-5.9 ER2209');
    expect(facts.fNumber).toBe(6);
    expect(facts.aNumber).toBe(8);
  });

  it('reads a bare nickel chromium wire into its own group', () => {
    const facts = parseClassification('SFA-5.14 ERNiCrMo-3');
    expect(facts.fNumber).toBe(45);
    expect(facts.designator).toBe('ER');
  });

  it('reads a plain nickel wire into a different group again', () => {
    expect(parseClassification('SFA-5.14 ERNi-1').fNumber).toBe(41);
  });

  it('reads a covered nickel electrode into the covered group', () => {
    expect(parseClassification('SFA-5.11 ENiCrFe-3').fNumber).toBe(43);
  });

  it('leaves the deposit group empty, since the A numbers are iron based', () => {
    expect(parseClassification('SFA-5.14 ERNiCrMo-3').aNumber).toBeUndefined();
  });
});

describe('rejections', () => {
  it('needs both halves of the name', () => {
    expect(() => parseClassification('E7018')).toThrow(ValidationError);
    expect(() => parseClassification('SFA-5.1')).toThrow(/specification and a classification/);
  });

  it('refuses a specification it cannot read', () => {
    expect(() => parseClassification('BS-2493 E7018')).toThrow(/not a filler specification/);
  });

  it('refuses a classification it cannot read', () => {
    expect(() => parseClassification('SFA-5.1 XYZ')).toThrow(/cannot read the classification/);
  });

  it('accepts the AWS spelling of the specification', () => {
    expect(parseClassification('AWS A5.1 E7018').specification).toBe('5.1');
    expect(parseClassification('aws-5.1 e7018').specification).toBe('5.1');
  });
});

describe('describing', () => {
  it('prints the specification with the derived groups', () => {
    expect(describeClassification(parseClassification('SFA-5.1 E7018'))).toBe(
      'SFA-5.1 E7018, F-No 4, A-No 1',
    );
  });

  it('leaves out a group it could not derive', () => {
    expect(describeClassification(parseClassification('SFA-5.5 E9018-XX'))).toBe(
      'SFA-5.5 E9018-XX, F-No 4',
    );
  });
});
