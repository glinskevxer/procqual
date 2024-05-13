import { describe, expect, it } from 'vitest';

import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  combinedBaseMetalThickness,
  describeScope,
  heatTreatmentCondition,
  scopeForLayer,
  scopeForProcess,
  scopesFor,
} from '../../../src/qualification/qualifiedRanges.js';
import { samplePqr } from '../../support/pqr.js';
import { baseVariables } from '../../support/variables.js';

const scope = (record = samplePqr()) => scopeForLayer(record, record.layers[0]!);

describe('the straightforward fields', () => {
  it('carries the P number ladder through', () => {
    expect(scope().pNumbers).toEqual(['1']);
    const chrome = samplePqr({
      layers: [
        {
          ...baseVariables(),
          baseMetal: { ...baseVariables().baseMetal, pNumber: '4', groupNumber: 1 },
        },
      ],
    });
    expect(scope(chrome).pNumbers).toEqual(['4', '3', '1']);
  });

  it('carries the F number ladder through, process and all', () => {
    expect(scope().fNumbers).toEqual([1, 2, 3, 4]);
    const tig = samplePqr({
      layers: [
        {
          ...baseVariables(),
          process: 'GTAW',
          filler: { ...baseVariables().filler, fNumber: 6 },
        },
      ],
    });
    expect(scope(tig).fNumbers).toEqual([6]);
  });

  it('keeps the deposit group as recorded', () => {
    expect(scope().aNumber).toBe(1);
  });

  it('doubles the coupon thickness for the base metal range', () => {
    expect(scope().baseMetalThickness.upper?.toFraction()).toBe('3/4');
    expect(scope().depositThickness.upper?.toFraction()).toBe('3/4');
  });
});

describe('the heat treatment condition', () => {
  const treatedAt = (temperature: string) =>
    samplePqr({
      layers: [
        {
          ...baseVariables(),
          pwht: { applied: true, temperature: fahrenheit(temperature) },
        },
      ],
    });

  it('is none when nothing was done', () => {
    expect(heatTreatmentCondition(baseVariables(), '1')).toBe('none');
  });

  it('is below the transformation for an ordinary stress relief', () => {
    expect(scope(treatedAt('1150')).heatTreatment).toBe('below-transformation');
  });

  it('is above it for a soak past the transformation temperature', () => {
    expect(scope(treatedAt('1400')).heatTreatment).toBe('above-transformation');
  });

  it('collapses the base metal ceiling once it goes above', () => {
    expect(scope(treatedAt('1150')).baseMetalThickness.upper?.toFraction()).toBe('3/4');
    expect(scope(treatedAt('1400')).baseMetalThickness.upper?.toInches().toString()).toBe('0.4125');
  });

  it('assumes below the transformation when no temperature was written down', () => {
    const vague = samplePqr({ layers: [{ ...baseVariables(), pwht: { applied: true } }] });
    expect(scope(vague).heatTreatment).toBe('below-transformation');
  });

  it('reads the transformation temperature off the P number, not off a constant', () => {
    const chrome = samplePqr({
      layers: [
        {
          ...baseVariables(),
          baseMetal: { ...baseVariables().baseMetal, pNumber: '4', groupNumber: 1 },
          pwht: { applied: true, temperature: fahrenheit('1400') },
        },
      ],
    });
    expect(scope(chrome).heatTreatment).toBe('below-transformation');
  });
});

describe('what the toughness answer changes', () => {
  const plain = samplePqr();
  const tough = samplePqr({ toughnessRequired: true });

  it('opens the group numbers on ordinary work and closes them on a toughness job', () => {
    expect(scope(plain).groupNumbers).toEqual([1, 2, 3, 4]);
    expect(scope(tough).groupNumbers).toEqual([1, 2]);
  });

  it('gives every position on ordinary work, coupon position notwithstanding', () => {
    expect(scope(plain).positions).toEqual(['flat', 'horizontal', 'vertical', 'overhead']);
  });

  it('narrows to what the coupon proved once toughness is wanted', () => {
    expect(scope(tough).positions).toEqual(['flat', 'vertical']);
  });

  it('only carries the heat input cap on a toughness job', () => {
    expect(scope(plain).heatInputCap).toBeUndefined();
  });
});

describe('several processes on one coupon', () => {
  const twoLayer = samplePqr({
    layers: [
      {
        ...baseVariables(),
        process: 'GTAW',
        filler: { ...baseVariables().filler, fNumber: 6, depositThickness: inches('1/8') },
      },
      {
        ...baseVariables(),
        filler: { ...baseVariables().filler, depositThickness: inches('1/4') },
      },
    ],
  });

  it('works out a scope for each of them', () => {
    expect(scopesFor(twoLayer).map((item) => item.process)).toEqual(['GTAW', 'SMAW']);
  });

  it('gives each process its own deposit range off its own deposit', () => {
    expect(scopeForProcess(twoLayer, 'GTAW')?.depositThickness.upper?.toFraction()).toBe('1/4');
    expect(scopeForProcess(twoLayer, 'SMAW')?.depositThickness.upper?.toFraction()).toBe('1/2');
  });

  it('gives both of them the same base metal range, off the coupon', () => {
    expect(combinedBaseMetalThickness(twoLayer).upper?.toFraction()).toBe('3/4');
  });

  it('takes the overlap when the processes disagree', () => {
    const annealedFill = samplePqr({
      layers: [
        {
          ...baseVariables(),
          process: 'GTAW',
          filler: { ...baseVariables().filler, fNumber: 6, depositThickness: inches('1/8') },
        },
        {
          ...baseVariables(),
          filler: { ...baseVariables().filler, depositThickness: inches('1/4') },
          pwht: { applied: true, temperature: fahrenheit('1400') },
        },
      ],
    });
    expect(combinedBaseMetalThickness(annealedFill).upper?.toInches().toString()).toBe('0.4125');
  });

  it('reports nothing for a process the coupon never ran', () => {
    expect(scopeForProcess(twoLayer, 'SAW')).toBeUndefined();
  });
});

describe('describing a scope', () => {
  it('reads back as one line for the procedure sheet', () => {
    expect(describeScope(scope())).toBe(
      'SMAW; P-No 1 groups 1/2/3/4; F-No 1/2/3/4; base metal [0.0625 in, 0.75 in]; deposit [0 in, 0.75 in]; positions flat, horizontal, vertical, overhead',
    );
  });
});
