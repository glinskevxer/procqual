import { describe, expect, it } from 'vitest';

import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import { draftFrom, draftIsSupported, nextDraftNumber } from '../../../src/qualification/draft.js';
import { samplePqr } from '../../support/pqr.js';
import { baseVariables } from '../../support/variables.js';

const options = {
  number: DocumentNumber.parse('WPS-0200 Rev 0'),
  title: 'drafted from the coupon',
  issuedOn: date('2024-12-05'),
};

describe('drafting from a record', () => {
  const draft = draftFrom(samplePqr(), options);

  it('takes every range out of the record itself', () => {
    expect(draft.pNumbers).toEqual(['1']);
    expect(draft.groupNumbers).toEqual([1, 2, 3, 4]);
    expect(draft.baseMetalThickness.toString()).toBe('[0.0625 in, 0.75 in]');
    expect(draft.positions).toEqual(['flat', 'horizontal', 'vertical', 'overhead']);
    expect(draft.layers[0]?.fNumbers).toEqual([1, 2, 3, 4]);
  });

  it('names the record behind it', () => {
    expect(draft.supportedBy).toEqual(['PQR-0042']);
  });

  it('is supported by construction', () => {
    expect(draftIsSupported(samplePqr(), draft)).toBe(true);
  });

  it('carries the heat treatment condition of the coupon', () => {
    const treated = samplePqr({
      layers: [{ ...baseVariables(), pwht: { applied: true, temperature: fahrenheit('1150') } }],
    });
    expect(draftFrom(treated, options).pwht).toBe('below-transformation');
    expect(draftIsSupported(treated, draftFrom(treated, options))).toBe(true);
  });

  it('carries the toughness flag, which narrows the draft rather than widening it', () => {
    const tough = samplePqr({ toughnessRequired: true });
    const drafted = draftFrom(tough, options);
    expect(drafted.toughnessQualified).toBe(true);
    expect(drafted.positions).toEqual(['flat', 'vertical']);
    expect(drafted.groupNumbers).toEqual([1, 2]);
    expect(draftIsSupported(tough, drafted)).toBe(true);
  });
});

describe('a record with two processes', () => {
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

  it('drafts a claim for each of them', () => {
    const draft = draftFrom(twoLayer, options);
    expect(draft.layers.map((layer) => layer.process)).toEqual(['GTAW', 'SMAW']);
    expect(draftIsSupported(twoLayer, draft)).toBe(true);
  });

  it('gives each process its own deposit range', () => {
    const draft = draftFrom(twoLayer, options);
    expect(draft.layers[0]?.depositThickness.upper?.toFraction()).toBe('1/4');
    expect(draft.layers[1]?.depositThickness.upper?.toFraction()).toBe('1/2');
  });

  it('can be narrowed to one of them', () => {
    const draft = draftFrom(twoLayer, { ...options, processes: ['SMAW'] });
    expect(draft.layers.map((layer) => layer.process)).toEqual(['SMAW']);
    expect(draftIsSupported(twoLayer, draft)).toBe(true);
  });

  it('produces an empty draft when no process matches', () => {
    const draft = draftFrom(twoLayer, { ...options, processes: ['SAW'] });
    expect(draft.layers).toEqual([]);
    expect(draft.pNumbers).toEqual([]);
  });
});

describe('picking the next number', () => {
  it('takes one past the highest procedure already issued', () => {
    const existing = [
      DocumentNumber.parse('WPS-0110 Rev 2'),
      DocumentNumber.parse('PQR-0900'),
      DocumentNumber.parse('WPS-0042'),
    ];
    expect(nextDraftNumber(existing).toString()).toBe('WPS-0111 Rev 0');
  });

  it('starts at one when nothing has been issued', () => {
    expect(nextDraftNumber([]).toString()).toBe('WPS-0001 Rev 0');
  });
});
