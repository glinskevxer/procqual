import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { date } from '../../../src/core/plainDate.js';
import { parseWith } from '../../../src/core/schema.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { orThrow } from '../../../src/store/codec.js';
import {
  claimReader,
  encodeClaim,
  encodeProcedure,
  encodeVariables,
  procedureReader,
  variablesReader,
} from '../../../src/store/procedureCodec.js';
import type { WeldingVariables } from '../../../src/qualification/variables.js';
import { baseVariables } from '../../support/variables.js';
import { sampleWps } from '../../support/wps.js';

const fullVariables = (): WeldingVariables => ({
  ...baseVariables(),
  process: 'GMAW',
  filler: {
    ...baseVariables().filler,
    aNumber: 1,
    flux: 'F7A2',
    supplementalPowder: true,
  },
  pwht: { applied: true, temperature: fahrenheit('1150'), holdingHours: decimal('2') },
  gas: {
    shieldingComposition: '75 argon 25 carbon dioxide',
    shieldingFlowRate: decimal('35'),
    backingGas: 'argon',
  },
  electrical: {
    ...baseVariables().electrical,
    transferMode: 'short-circuiting',
    heatInputMaximum: decimal('45'),
  },
  technique: {
    ...baseVariables().technique,
    electrodeSpacing: decimal('0.5'),
    closedChamber: true,
  },
});

describe('welding variables', () => {
  it('round trips a fully populated record', () => {
    const original = fullVariables();
    const read = orThrow('variables', parseWith(variablesReader, encodeVariables(original)));
    expect(read.process).toBe('GMAW');
    expect(read.baseMetal.thickness.equals(original.baseMetal.thickness)).toBe(true);
    expect(read.filler.flux).toBe('F7A2');
    expect(read.filler.supplementalPowder).toBe(true);
    expect(read.pwht.temperature?.toFahrenheit().toString()).toBe('1150');
    expect(read.pwht.holdingHours?.toString()).toBe('2');
    expect(read.gas.backingGas).toBe('argon');
    expect(read.electrical.transferMode).toBe('short-circuiting');
    expect(read.electrical.heatInputMaximum?.toString()).toBe('45');
    expect(read.technique.closedChamber).toBe(true);
  });

  it('round trips a sparse one and keeps the gaps as gaps', () => {
    const read = orThrow('variables', parseWith(variablesReader, encodeVariables(baseVariables())));
    expect(read.filler.flux).toBeUndefined();
    expect(read.gas.backingGas).toBeUndefined();
    expect(read.electrical.transferMode).toBeUndefined();
    expect(read.pwht.applied).toBe(false);
    expect(read.pwht.temperature).toBeUndefined();
  });

  it('writes an absent field as null rather than leaving it off', () => {
    const encoded = encodeVariables(baseVariables()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(encoded.gas ?? {})).toEqual([
      'shieldingComposition',
      'shieldingFlowRate',
      'backingGas',
    ]);
    expect(encoded.gas?.backingGas).toBeNull();
  });

  it('refuses a record with a field it cannot read', () => {
    const encoded = encodeVariables(baseVariables()) as Record<string, Record<string, unknown>>;
    const broken = { ...encoded, baseMetal: { ...encoded.baseMetal, thickness: 'thick' } };
    const read = parseWith(variablesReader, broken);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error[0]?.path).toBe('baseMetal.thickness');
    }
  });

  it('refuses a process it does not know', () => {
    const encoded = { ...encodeVariables(baseVariables()), process: 'EBW' };
    expect(parseWith(variablesReader, encoded).ok).toBe(false);
  });
});

describe('a procedure claim', () => {
  it('round trips', () => {
    const claim = sampleWps().layers[0]!;
    const read = orThrow('a claim', parseWith(claimReader, encodeClaim(claim)));
    expect(read.process).toBe('SMAW');
    expect(read.fNumbers).toEqual([4]);
    expect(read.depositThickness.toString()).toBe(claim.depositThickness.toString());
    expect(read.heatInputCap).toBeUndefined();
  });

  it('carries a heat input cap when there is one', () => {
    const claim = { ...sampleWps().layers[0]!, heatInputCap: decimal('45') };
    const read = orThrow('a claim', parseWith(claimReader, encodeClaim(claim)));
    expect(read.heatInputCap?.toString()).toBe('45');
  });
});

describe('a whole procedure', () => {
  it('round trips', () => {
    const original = sampleWps();
    const read = orThrow('a procedure', parseWith(procedureReader, encodeProcedure(original)));
    expect(read.number.toString()).toBe('WPS-0110 Rev 0');
    expect(read.pNumbers).toEqual(['1']);
    expect(read.positions).toEqual(['flat', 'horizontal', 'vertical', 'overhead']);
    expect(read.baseMetalThickness.toString()).toBe(original.baseMetalThickness.toString());
    expect(read.layers).toHaveLength(1);
    expect(read.withdrawnOn).toBeUndefined();
  });

  it('carries a withdrawal date', () => {
    const withdrawn = sampleWps({ withdrawnOn: date('2025-01-01') });
    const read = orThrow('a procedure', parseWith(procedureReader, encodeProcedure(withdrawn)));
    expect(read.withdrawnOn?.toString()).toBe('2025-01-01');
  });

  it('refuses a position it does not know', () => {
    const encoded = { ...encodeProcedure(sampleWps()), positions: ['sideways'] };
    expect(parseWith(procedureReader, encoded).ok).toBe(false);
  });

  it('refuses an interval that runs backwards', () => {
    const encoded = {
      ...encodeProcedure(sampleWps()),
      baseMetalThickness: {
        lower: '2',
        upper: '1',
        lowerInclusive: true,
        upperInclusive: true,
      },
    };
    expect(parseWith(procedureReader, encoded).ok).toBe(false);
  });
});
