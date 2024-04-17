import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { isAcceptable, ValidationError } from '../../../src/core/errors.js';
import { Interval } from '../../../src/core/interval.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  carbonEquivalent,
  certifiedCurve,
  certifiedImpactAverage,
  impactsCoverTemperature,
  specificationOf,
  thicknessAccepted,
  verifyCertificate,
  type MaterialHeat,
} from '../../../src/materials/heat.js';

const heat = (overrides: Partial<MaterialHeat> = {}): MaterialHeat => ({
  heatNumber: 'A47213',
  specification: 'SA-516 Gr 70',
  supplier: 'Dillinger',
  certificateNumber: 'C-90114',
  certificateDate: date('2024-02-01'),
  thickness: inches('0.75'),
  normalised: false,
  chemistry: { C: decimal('0.18'), Mn: decimal('1.05'), Si: decimal('0.30') },
  mechanical: {
    tensileKsi: decimal('76'),
    yieldKsi: decimal('44'),
    elongationPercent: decimal('26'),
  },
  ...overrides,
});

describe('reading a certificate', () => {
  it('finds the specification behind the heat', () => {
    expect(specificationOf(heat()).pNumber).toBe('1');
  });

  it('accepts a certificate that meets its own specification', () => {
    expect(verifyCertificate(heat())).toEqual([]);
  });

  it('catches a tensile below the specification', () => {
    const findings = verifyCertificate(
      heat({
        mechanical: { tensileKsi: decimal('68'), yieldKsi: decimal('44'), elongationPercent: decimal('26') },
      }),
    );
    expect(findings.map((item) => item.code)).toContain('heat.tensile_below_specification');
    expect(isAcceptable(findings)).toBe(false);
  });

  it('catches a yield below the specification', () => {
    const findings = verifyCertificate(
      heat({
        mechanical: { tensileKsi: decimal('76'), yieldKsi: decimal('35'), elongationPercent: decimal('26') },
      }),
    );
    expect(findings.map((item) => item.code)).toContain('heat.yield_below_specification');
  });

  it('catches a certificate transcribed with the yield above the tensile', () => {
    const findings = verifyCertificate(
      heat({
        mechanical: { tensileKsi: decimal('76'), yieldKsi: decimal('80'), elongationPercent: decimal('26') },
      }),
    );
    expect(findings.map((item) => item.code)).toContain('heat.impossible_mechanicals');
  });

  it('catches a missing heat number', () => {
    expect(verifyCertificate(heat({ heatNumber: '  ' })).map((item) => item.code)).toContain(
      'heat.no_number',
    );
  });

  it('catches chemistry past the shop limits', () => {
    const findings = verifyCertificate(heat({ chemistry: { C: decimal('0.34') } }));
    expect(findings.map((item) => item.code)).toContain('heat.chemistry_out_of_band');
    expect(findings[0]?.message).toMatch(/C at 0.34 percent/);
  });
});

describe('carbon equivalent', () => {
  it('adds the alloying groups in their own proportions', () => {
    expect(
      carbonEquivalent({ C: decimal('0.18'), Mn: decimal('1.20') }).toString(),
    ).toBe('0.38');
  });

  it('is just the carbon for a plain analysis', () => {
    expect(carbonEquivalent({ C: decimal('0.10') }).toString()).toBe('0.1');
    expect(carbonEquivalent({}).toString()).toBe('0');
  });

  it('flags a carbon steel heat that needs the raised preheat practice', () => {
    const findings = verifyCertificate(
      heat({ chemistry: { C: decimal('0.24'), Mn: decimal('1.50'), Cr: decimal('0.20') } }),
    );
    const note = findings.find((item) => item.code === 'heat.carbon_equivalent');
    expect(note?.severity).toBe('deficiency');
    expect(isAcceptable(findings)).toBe(true);
  });

  it('does not raise it on an alloy steel, where the practice is already high', () => {
    const findings = verifyCertificate(
      heat({
        specification: 'SA-335 P22',
        mechanical: { tensileKsi: decimal('70'), yieldKsi: decimal('40'), elongationPercent: decimal('22') },
        chemistry: { C: decimal('0.12'), Cr: decimal('2.20'), Mo: decimal('1.00') },
      }),
    );
    expect(findings.map((item) => item.code)).not.toContain('heat.carbon_equivalent');
  });
});

describe('the curve on the certificate', () => {
  it('follows the normalised flag', () => {
    expect(certifiedCurve(heat())).toBe('B');
    expect(certifiedCurve(heat({ normalised: true }))).toBe('D');
  });

  it('notes normalising that bought nothing', () => {
    const findings = verifyCertificate(
      heat({
        specification: 'SA-537 Cl 1',
        normalised: true,
        mechanical: { tensileKsi: decimal('76'), yieldKsi: decimal('55'), elongationPercent: decimal('24') },
      }),
    );
    const note = findings.find((item) => item.code === 'heat.normalising_bought_nothing');
    expect(note?.severity).toBe('advisory');
  });
});

describe('certified impacts', () => {
  it('reports no average when the certificate carries none', () => {
    expect(certifiedImpactAverage(heat())).toBeUndefined();
    expect(impactsCoverTemperature(heat(), fahrenheit('-20'))).toBe(false);
  });

  it('averages the certified set', () => {
    const tested = heat({
      impacts: {
        testTemperature: fahrenheit('-50'),
        energyFootPounds: [decimal('42'), decimal('38'), decimal('40')],
      },
    });
    expect(certifiedImpactAverage(tested)?.toString()).toBe('40');
  });

  it('only covers a design temperature at or above the test temperature', () => {
    const tested = heat({
      impacts: {
        testTemperature: fahrenheit('-50'),
        energyFootPounds: [decimal('42')],
      },
    });
    expect(impactsCoverTemperature(tested, fahrenheit('-20'))).toBe(true);
    expect(impactsCoverTemperature(tested, fahrenheit('-50'))).toBe(true);
    expect(impactsCoverTemperature(tested, fahrenheit('-60'))).toBe(false);
  });
});

describe('thickness against the order', () => {
  it('accepts a heat inside the ordered range', () => {
    const ordered = Interval.closed(inches('0.5'), inches('1'));
    expect(thicknessAccepted(heat(), ordered)).toBe(true);
    expect(thicknessAccepted(heat({ thickness: inches('1.25') }), ordered)).toBe(false);
  });

  it('refuses a heat with no thickness at all', () => {
    expect(() =>
      thicknessAccepted(heat({ thickness: inches('0') }), Interval.unbounded()),
    ).toThrow(ValidationError);
  });
});
