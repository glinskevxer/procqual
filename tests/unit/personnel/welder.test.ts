import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  isEmployed,
  isRevoked,
  isStencil,
  normaliseStencil,
  reviewQualification,
} from '../../../src/personnel/welder.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';

describe('stencils', () => {
  it('accepts the shapes the shop punches', () => {
    expect(isStencil('W-118')).toBe(true);
    expect(isStencil('w118')).toBe(true);
    expect(isStencil('ABC-9')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isStencil('118')).toBe(false);
    expect(isStencil('WELDER-118')).toBe(false);
    expect(isStencil('')).toBe(false);
    expect(() => normaliseStencil('118')).toThrow(ValidationError);
  });

  it('puts the dash in where it was left out', () => {
    expect(normaliseStencil('w118')).toBe('W-118');
    expect(normaliseStencil(' W-118 ')).toBe('W-118');
  });
});

describe('employment', () => {
  it('runs from the start date', () => {
    const welder = sampleWelder();
    expect(isEmployed(welder, date('2019-03-31'))).toBe(false);
    expect(isEmployed(welder, date('2019-04-01'))).toBe(true);
  });

  it('runs to the leaving date inclusive', () => {
    const welder = sampleWelder({ employedUntil: date('2024-06-30') });
    expect(isEmployed(welder, date('2024-06-30'))).toBe(true);
    expect(isEmployed(welder, date('2024-07-01'))).toBe(false);
  });

  it('never ends when no leaving date is recorded', () => {
    expect(isEmployed(sampleWelder(), date('2040-01-01'))).toBe(true);
  });
});

describe('revocation', () => {
  it('bites from the day it was recorded', () => {
    const revoked = sampleQualification({
      revokedOn: date('2024-05-01'),
      revokedReason: 'repair rate',
    });
    expect(isRevoked(revoked, date('2024-04-30'))).toBe(false);
    expect(isRevoked(revoked, date('2024-05-01'))).toBe(true);
  });

  it('is absent when nothing was recorded', () => {
    expect(isRevoked(sampleQualification(), date('2040-01-01'))).toBe(false);
  });
});

describe('reviewing a coupon', () => {
  const welder = sampleWelder();

  it('passes a clean one', () => {
    expect(reviewQualification(sampleQualification(), welder)).toEqual([]);
  });

  it('refuses a stencil nobody holds', () => {
    const findings = reviewQualification(sampleQualification(), undefined);
    expect(findings.map((item) => item.code)).toEqual(['wpq.unknown_welder']);
  });

  it('refuses a coupon welded before the welder started', () => {
    const findings = reviewQualification(
      sampleQualification({ weldedOn: date('2018-01-01') }),
      welder,
    );
    expect(findings.map((item) => item.code)).toContain('wpq.not_employed');
  });

  it('refuses a coupon that deposited nothing or ran no layers', () => {
    expect(
      reviewQualification(sampleQualification({ layers: 0 }), welder).map((item) => item.code),
    ).toContain('wpq.no_layers');
    expect(
      reviewQualification(sampleQualification({ depositThickness: inches('0') }), welder).map(
        (item) => item.code,
      ),
    ).toContain('wpq.no_deposit');
  });

  it('wants a diameter on a pipe coupon', () => {
    expect(
      reviewQualification(sampleQualification({ productForm: 'pipe' }), welder).map(
        (item) => item.code,
      ),
    ).toContain('wpq.no_diameter');
  });

  it('refuses a radiographed fillet coupon', () => {
    const findings = reviewQualification(
      sampleQualification({ weldType: 'fillet', testMethod: 'radiograph' }),
      welder,
    );
    expect(findings.map((item) => item.code)).toContain('wpq.fillet_radiographed');
  });

  it('warns about radiographing a gas metal arc coupon', () => {
    const findings = reviewQualification(
      sampleQualification({ process: 'GMAW', testMethod: 'radiograph' }),
      welder,
    );
    const note = findings.find((item) => item.code === 'wpq.short_circuit_radiography');
    expect(note?.severity).toBe('deficiency');
    expect(note?.clause).toBe('QW-304.1');
  });

  it('refuses an unwitnessed coupon', () => {
    expect(
      reviewQualification(sampleQualification({ witnessedBy: '  ' }), welder).map(
        (item) => item.code,
      ),
    ).toContain('wpq.unwitnessed');
  });

  it('wants a reason on a revocation', () => {
    expect(
      reviewQualification(sampleQualification({ revokedOn: date('2024-05-01') }), welder).map(
        (item) => item.code,
      ),
    ).toContain('wpq.revoked_without_reason');
  });

  it('refuses a revocation dated before the coupon', () => {
    expect(
      reviewQualification(
        sampleQualification({ revokedOn: date('2023-01-01'), revokedReason: 'error' }),
        welder,
      ).map((item) => item.code),
    ).toContain('wpq.revoked_before_welded');
  });
});
