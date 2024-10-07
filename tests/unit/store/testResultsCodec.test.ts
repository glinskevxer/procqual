import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { parseWith } from '../../../src/core/schema.js';
import { inches } from '../../../src/core/units.js';
import type { CouponTests } from '../../../src/qualification/pqr.js';
import { orThrow } from '../../../src/store/codec.js';
import {
  encodeBend,
  encodeHardnessSurvey,
  encodeImpactSet,
  encodeTensile,
  encodeTests,
  bendReader,
  hardnessSurveyReader,
  impactSetReader,
  tensileReader,
  testsReader,
} from '../../../src/store/testResultsCodec.js';
import { passingBends, passingImpacts, passingTensiles } from '../../support/specimens.js';

const tests: CouponTests = {
  tensile: passingTensiles(),
  bends: [
    ...passingBends(),
    {
      id: 'B5',
      type: 'side',
      discontinuities: [{ location: 'corner', size: inches('3/16'), fusionRelated: false }],
    },
  ],
  impacts: passingImpacts(),
  hardness: [
    {
      id: 'HS-1',
      scale: 'HV10',
      readings: [
        { zone: 'parent', value: decimal('180') },
        { zone: 'heat-affected-zone', value: decimal('220'), offsetMillimetres: decimal('1.5') },
      ],
    },
  ],
};

describe('one specimen at a time', () => {
  it('round trips a tensile', () => {
    const read = orThrow(
      'a tensile',
      parseWith(tensileReader, encodeTensile(passingTensiles()[0]!)),
    );
    expect(read.id).toBe('T1');
    expect(read.width.toFraction()).toBe('3/4');
    expect(read.ultimateLoadPounds.toString()).toBe('21000');
    expect(read.failureLocation).toBe('base-metal');
  });

  it('round trips a bend with what opened on it', () => {
    const read = orThrow('a bend', parseWith(bendReader, encodeBend(tests.bends[4]!)));
    expect(read.type).toBe('side');
    expect(read.discontinuities[0]?.size.toFraction()).toBe('3/16');
    expect(read.discontinuities[0]?.fusionRelated).toBe(false);
  });

  it('round trips an impact set', () => {
    const read = orThrow(
      'an impact set',
      parseWith(impactSetReader, encodeImpactSet(passingImpacts()[0]!)),
    );
    expect(read.location).toBe('weld');
    expect(read.width).toBe('10');
    expect(read.testTemperature.toFahrenheit().toString()).toBe('-20');
    expect(read.specimens).toHaveLength(3);
    expect(read.specimens[0]?.shearPercent).toBeUndefined();
  });

  it('round trips a hardness survey and keeps the offsets', () => {
    const read = orThrow(
      'a survey',
      parseWith(hardnessSurveyReader, encodeHardnessSurvey(tests.hardness[0]!)),
    );
    expect(read.scale).toBe('HV10');
    expect(read.readings[1]?.offsetMillimetres?.toString()).toBe('1.5');
    expect(read.readings[0]?.offsetMillimetres).toBeUndefined();
  });
});

describe('the whole set of results', () => {
  it('round trips', () => {
    const read = orThrow('the tests', parseWith(testsReader, encodeTests(tests)));
    expect(read.tensile).toHaveLength(2);
    expect(read.bends).toHaveLength(5);
    expect(read.impacts).toHaveLength(2);
    expect(read.hardness).toHaveLength(1);
  });

  it('round trips an empty set', () => {
    const empty = { tensile: [], bends: [], impacts: [], hardness: [] };
    const read = orThrow('the tests', parseWith(testsReader, encodeTests(empty)));
    expect(read).toEqual(empty);
  });

  it('names the specimen when one of them will not read', () => {
    const encoded = encodeTests(tests) as Record<string, unknown[]>;
    const broken = {
      ...encoded,
      tensile: [encoded.tensile?.[0], { ...(encoded.tensile?.[1] as object), width: 'wide' }],
    };
    const read = parseWith(testsReader, broken);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error[0]?.path).toBe('tensile[1].width');
    }
  });

  it('refuses a failure location it does not know', () => {
    const encoded = encodeTests(tests) as Record<string, unknown[]>;
    const broken = {
      ...encoded,
      tensile: [{ ...(encoded.tensile?.[0] as object), failureLocation: 'somewhere' }],
    };
    expect(parseWith(testsReader, broken).ok).toBe(false);
  });

  it('carries a temperature written in Celsius through as Fahrenheit', () => {
    const encoded = encodeTests(tests) as Record<string, unknown[]>;
    const metric = {
      ...encoded,
      impacts: [{ ...(encoded.impacts?.[0] as object), testTemperature: '-29C' }],
    };
    const read = orThrow('the tests', parseWith(testsReader, metric));
    expect(read.impacts[0]?.testTemperature.toFahrenheit().toString()).toBe('-20.2');
  });
});
