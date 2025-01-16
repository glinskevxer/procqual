import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { ValidationError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  curveForJoint,
  describeVessel,
  governingThickness,
  isLethal,
  isSour,
  reviewJointAgainstVessel,
  reviewVessel,
  toughnessRequiredFor,
} from '../../../src/fabrication/vessel.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleVessel } from '../../support/vessels.js';

describe('reviewing a vessel on its own', () => {
  it('passes an ordinary one', () => {
    expect(reviewVessel(sampleVessel())).toEqual([]);
  });

  it('refuses one with no tag or no pressure', () => {
    expect(reviewVessel(sampleVessel({ tag: ' ' })).map((item) => item.code)).toContain(
      'vessel.no_tag',
    );
    expect(
      reviewVessel(sampleVessel({ designPressurePsi: decimal('0') })).map((item) => item.code),
    ).toContain('vessel.no_pressure');
  });

  it('refuses temperatures that cross', () => {
    const crossed = sampleVessel({
      minimumDesignMetalTemperature: fahrenheit('700'),
    });
    expect(reviewVessel(crossed).map((item) => item.code)).toContain('vessel.temperatures_crossed');
  });

  it('notes lethal and sour service', () => {
    expect(reviewVessel(sampleVessel({ service: 'lethal' })).map((item) => item.code)).toContain(
      'vessel.lethal',
    );
    expect(reviewVessel(sampleVessel({ service: 'sour' })).map((item) => item.code)).toContain(
      'vessel.sour',
    );
    expect(isLethal(sampleVessel({ service: 'lethal' }))).toBe(true);
    expect(isSour(sampleVessel({ service: 'sour' }))).toBe(true);
  });

  it('questions a pressure past what the code is written for', () => {
    expect(
      reviewVessel(sampleVessel({ designPressurePsi: decimal('4000') })).map((item) => item.code),
    ).toContain('vessel.high_pressure');
  });

  it('reads back in one line', () => {
    expect(describeVessel(sampleVessel())).toBe(
      'V-2201 for Humber Refinery, general service, 285 psi at 650 F, MDMT 40 F',
    );
  });
});

describe('the curve a joint sits on', () => {
  it('comes off the heats, not off the specification alone', () => {
    expect(curveForJoint(sampleVessel(), sampleJoint())).toBe('B');
    const normalised = sampleVessel({ normalisedHeats: ['A47213'] });
    expect(curveForJoint(normalised, sampleJoint())).toBe('D');
  });

  it('needs both sides normalised before it moves', () => {
    const oneSide = sampleVessel({ normalisedHeats: ['A47213'] });
    const joint = sampleJoint({ heatRight: 'B00002' });
    expect(curveForJoint(oneSide, joint)).toBe('B');
  });
});

describe('whether a joint needs notch toughness', () => {
  it('does not on a warm vessel in thin plate', () => {
    expect(toughnessRequiredFor(sampleVessel(), sampleJoint())).toBe(false);
  });

  it('does once the vessel is stamped colder', () => {
    const cold = sampleVessel({ minimumDesignMetalTemperature: fahrenheit('-20') });
    expect(toughnessRequiredFor(cold, sampleJoint())).toBe(true);
  });

  it('does once the section is thicker', () => {
    const thick = sampleJoint({ thickness: inches('2') });
    expect(toughnessRequiredFor(sampleVessel(), thick)).toBe(true);
  });

  it('stops needing it when the plate was normalised', () => {
    const thick = sampleJoint({ thickness: inches('1.5') });
    expect(toughnessRequiredFor(sampleVessel(), thick)).toBe(true);
    const normalised = sampleVessel({ normalisedHeats: ['A47213'] });
    expect(toughnessRequiredFor(normalised, thick)).toBe(false);
  });
});

describe('a joint against its vessel', () => {
  it('says nothing about a joint that agrees with it', () => {
    expect(reviewJointAgainstVessel(sampleVessel(), sampleJoint())).toEqual([]);
  });

  it('refuses a joint belonging to a different vessel', () => {
    expect(() =>
      reviewJointAgainstVessel(sampleVessel(), sampleJoint({ vessel: 'V-3300' })),
    ).toThrow(ValidationError);
  });

  it('asks for notch toughness where the design conditions call for it', () => {
    const cold = sampleVessel({ minimumDesignMetalTemperature: fahrenheit('-20') });
    const findings = reviewJointAgainstVessel(cold, sampleJoint());
    expect(findings.map((item) => item.code)).toContain('vessel.toughness_required');
    expect(findings[0]?.clause).toBe('UCS-66');
  });

  it('refuses less than full radiography on a lethal service vessel', () => {
    const lethal = sampleVessel({ service: 'lethal' });
    const findings = reviewJointAgainstVessel(lethal, sampleJoint({ radiography: 'spot' }));
    expect(findings.map((item) => item.code)).toContain('vessel.lethal_radiography');
    expect(reviewJointAgainstVessel(lethal, sampleJoint()).map((item) => item.code)).not.toContain(
      'vessel.lethal_radiography',
    );
  });

  it('asks for the hardness limit on carbon steel in sour service', () => {
    const sour = sampleVessel({ service: 'sour' });
    expect(reviewJointAgainstVessel(sour, sampleJoint()).map((item) => item.code)).toContain(
      'vessel.sour_hardness',
    );
  });
});

describe('the governing thickness', () => {
  it('is the thickest joint on the vessel', () => {
    const joints = [sampleJoint(), sampleJoint({ id: 'J-15', thickness: inches('1') })];
    expect(governingThickness(joints)?.toFraction()).toBe('1');
    expect(governingThickness([])).toBeUndefined();
  });
});
