import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { decimal } from '../../../src/core/decimal.js';
import { ConflictError, NotFoundError } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { MemoryJournal } from '../../../src/store/journal.js';
import { VesselStore } from '../../../src/store/vesselStore.js';
import { sampleVessel } from '../../support/vessels.js';

let journal: MemoryJournal;
let store: VesselStore;

beforeEach(() => {
  journal = new MemoryJournal();
  store = new VesselStore(journal, new FixedClock('2025-01-20T09:00:00.000Z'));
});

describe('recording a vessel', () => {
  it('reads it back whole', () => {
    store.record(sampleVessel({ normalisedHeats: ['A47213'] }), 'engineer');
    const read = store.requireVessel('V-2201');
    expect(read.customer).toBe('Humber Refinery');
    expect(read.minimumDesignMetalTemperature.toFahrenheit().toString()).toBe('40');
    expect(read.designPressurePsi.toString()).toBe('285');
    expect(read.normalisedHeats).toEqual(['A47213']);
  });

  it('refuses the same tag twice', () => {
    store.record(sampleVessel(), 'engineer');
    expect(() => store.record(sampleVessel(), 'engineer')).toThrow(ConflictError);
  });

  it('refuses one nobody recorded', () => {
    expect(() => store.requireVessel('V-9999')).toThrow(NotFoundError);
    expect(store.vessel('V-9999')).toBeUndefined();
  });

  it('lists them in tag order', () => {
    store.record(sampleVessel({ tag: 'V-3300' }), 'engineer');
    store.record(sampleVessel(), 'engineer');
    expect(store.vessels().map((item) => item.tag)).toEqual(['V-2201', 'V-3300']);
  });
});

describe('changing the design conditions', () => {
  beforeEach(() => {
    store.record(sampleVessel(), 'engineer');
  });

  it('is its own event with a reason, and the old conditions stay on the record', () => {
    store.changeConditions(
      'V-2201',
      {
        minimumDesignMetalTemperature: fahrenheit('-20'),
        designPressurePsi: decimal('285'),
        designTemperature: fahrenheit('650'),
        service: 'general',
      },
      'customer moved the design temperature down',
      'engineer',
    );
    expect(
      store.requireVessel('V-2201').minimumDesignMetalTemperature.toFahrenheit().toString(),
    ).toBe('-20');
    expect(store.changeHistory('V-2201')).toEqual(['customer moved the design temperature down']);
    expect(journal.read().map((entry) => entry.type)).toEqual([
      'vessel.recorded',
      'vessel.conditions_changed',
    ]);
  });

  it('keeps the fields the change did not touch', () => {
    store.changeConditions(
      'V-2201',
      {
        minimumDesignMetalTemperature: fahrenheit('-20'),
        designPressurePsi: decimal('285'),
        designTemperature: fahrenheit('650'),
        service: 'lethal',
      },
      'reclassified',
      'engineer',
    );
    const read = store.requireVessel('V-2201');
    expect(read.customer).toBe('Humber Refinery');
    expect(read.service).toBe('lethal');
  });

  it('refuses a vessel nobody recorded', () => {
    expect(() =>
      store.changeConditions(
        'V-9999',
        {
          minimumDesignMetalTemperature: fahrenheit('0'),
          designPressurePsi: decimal('100'),
          designTemperature: fahrenheit('300'),
          service: 'general',
        },
        'x',
        'kd',
      ),
    ).toThrow(NotFoundError);
  });

  it('reports no history for a vessel nobody has changed', () => {
    expect(store.changeHistory('V-2201')).toEqual([]);
  });
});

describe('the projection', () => {
  it('is rebuilt from the journal', () => {
    store.record(sampleVessel(), 'engineer');
    store.changeConditions(
      'V-2201',
      {
        minimumDesignMetalTemperature: fahrenheit('-20'),
        designPressurePsi: decimal('285'),
        designTemperature: fahrenheit('650'),
        service: 'general',
      },
      'colder',
      'engineer',
    );
    const rebuilt = new VesselStore(
      new MemoryJournal(journal.read()),
      new FixedClock('2025-02-01T09:00:00.000Z'),
    );
    expect(
      rebuilt.requireVessel('V-2201').minimumDesignMetalTemperature.toFahrenheit().toString(),
    ).toBe('-20');
    expect(rebuilt.changeHistory('V-2201')).toEqual(['colder']);
  });
});
