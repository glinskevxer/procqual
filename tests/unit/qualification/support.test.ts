import { describe, expect, it } from 'vitest';

import { Interval } from '../../../src/core/interval.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import { supportFindings, unsupportedClauses } from '../../../src/qualification/support.js';
import { samplePqr } from '../../support/pqr.js';
import { baseVariables } from '../../support/variables.js';
import { sampleWps } from '../../support/wps.js';

const claim = (changes: Partial<ReturnType<typeof sampleWps>['layers'][number]>) => {
  const base = sampleWps();
  return sampleWps({ layers: [{ ...base.layers[0]!, ...changes }] });
};

describe('a procedure its record covers', () => {
  it('is supported with nothing to report', () => {
    const report = supportFindings(sampleWps(), [samplePqr()]);
    expect(report.findings).toEqual([]);
    expect(report.supported).toBe(true);
    expect(report.recordsUsed).toEqual(['PQR-0042']);
  });
});

describe('with no record at all', () => {
  it('is not supported', () => {
    const report = supportFindings(sampleWps(), []);
    expect(report.supported).toBe(false);
    expect(report.findings.map((item) => item.code)).toEqual(['support.no_records']);
  });
});

describe('base metal claims', () => {
  it('refuses a P number no record reaches', () => {
    const report = supportFindings(sampleWps({ pNumbers: ['1', '8'] }), [samplePqr()]);
    expect(report.findings.map((item) => item.message)).toContain('no record reaches P-No 8');
    expect(unsupportedClauses(report)).toContain('QW-403.11');
  });

  it('accepts a P number the record reaches downward to', () => {
    const chrome = samplePqr({
      layers: [
        {
          ...baseVariables(),
          baseMetal: { ...baseVariables().baseMetal, pNumber: '4', groupNumber: 1 },
        },
      ],
    });
    expect(supportFindings(sampleWps({ groupNumbers: [1] }), [chrome]).supported).toBe(true);
  });

  it('refuses a thickness range that runs past what the coupon covers', () => {
    const wide = sampleWps({
      baseMetalThickness: Interval.closed(inches('0.0625'), inches('1')),
    });
    expect(supportFindings(wide, [samplePqr()]).findings.map((item) => item.code)).toContain(
      'support.base_metal_thickness',
    );
  });

  it('refuses a group the coupon does not reach on a toughness job', () => {
    const tough = samplePqr({ toughnessRequired: true });
    const report = supportFindings(sampleWps({ groupNumbers: [1, 2, 3] }), [tough]);
    expect(report.findings.map((item) => item.message)).toContain('no record reaches group 3');
  });
});

describe('process claims', () => {
  it('refuses a process no record used', () => {
    const report = supportFindings(claim({ process: 'GTAW' }), [samplePqr()]);
    expect(report.findings.map((item) => item.code)).toEqual(['support.process']);
  });

  it('refuses a filler group outside the ladder', () => {
    const report = supportFindings(claim({ fNumbers: [4, 5] }), [samplePqr()]);
    expect(report.findings.map((item) => item.message)).toContain(
      'no record reaches F-No 5 on SMAW',
    );
  });

  it('refuses a deposit group the coupon did not lay', () => {
    const report = supportFindings(claim({ aNumber: 8 }), [samplePqr()]);
    expect(report.findings.map((item) => item.code)).toContain('support.deposit_group');
  });

  it('refuses more deposit than the coupon covers', () => {
    const report = supportFindings(
      claim({ depositThickness: Interval.closed(inches('0'), inches('1')) }),
      [samplePqr()],
    );
    expect(report.findings.map((item) => item.code)).toContain('support.deposit_thickness');
  });

  it('refuses the other vertical progression', () => {
    const report = supportFindings(claim({ progression: 'downhill' }), [samplePqr()]);
    expect(report.findings.map((item) => item.code)).toContain('support.progression');
  });

  it('refuses a heat treatment condition the coupon was not in', () => {
    const report = supportFindings(sampleWps({ pwht: 'below-transformation' }), [samplePqr()]);
    expect(report.findings.map((item) => item.code)).toContain('support.heat_treatment');
  });
});

describe('the preheat allowance', () => {
  it('lets the procedure drop a hundred degrees below the coupon', () => {
    const hot = samplePqr({
      layers: [
        { ...baseVariables(), preheat: { ...baseVariables().preheat, minimum: fahrenheit('150') } },
      ],
    });
    expect(supportFindings(claim({ preheatMinimum: fahrenheit('50') }), [hot]).supported).toBe(
      true,
    );
  });

  it('refuses a drop of more than a hundred', () => {
    const hot = samplePqr({
      layers: [
        { ...baseVariables(), preheat: { ...baseVariables().preheat, minimum: fahrenheit('300') } },
      ],
    });
    const report = supportFindings(claim({ preheatMinimum: fahrenheit('150') }), [hot]);
    expect(report.findings.map((item) => item.code)).toContain('support.preheat');
  });

  it('never minds a preheat above what was qualified', () => {
    expect(
      supportFindings(claim({ preheatMinimum: fahrenheit('400') }), [samplePqr()]).supported,
    ).toBe(true);
  });
});

describe('the interpass allowance', () => {
  it('lets the procedure rise a hundred degrees on ordinary work, as a deficiency', () => {
    const report = supportFindings(claim({ interpassMaximum: fahrenheit('650') }), [samplePqr()]);
    expect(report.supported).toBe(true);
    expect(report.findings.map((item) => item.code)).toContain('support.interpass');
    expect(report.findings[0]?.severity).toBe('deficiency');
  });

  it('accepts a rise inside the allowance without a word', () => {
    expect(
      supportFindings(claim({ interpassMaximum: fahrenheit('600') }), [samplePqr()]).findings,
    ).toEqual([]);
  });

  it('takes the allowance away entirely on a toughness job', () => {
    const tough = sampleWps({
      toughnessQualified: true,
      layers: [{ ...sampleWps().layers[0]!, interpassMaximum: fahrenheit('550') }],
    });
    const report = supportFindings(tough, [samplePqr({ toughnessRequired: true })]);
    const interpass = report.findings.find((item) => item.code === 'support.interpass');
    expect(interpass?.severity).toBe('blocking');
    expect(report.supported).toBe(false);
  });

  it('is happy at exactly what was qualified on a toughness job', () => {
    const tough = sampleWps({ toughnessQualified: true });
    const report = supportFindings(tough, [samplePqr({ toughnessRequired: true })]);
    expect(report.findings.map((item) => item.code)).not.toContain('support.interpass');
  });
});

describe('several records behind one procedure', () => {
  it('lets one record cover the thickness and another the process', () => {
    const tig = samplePqr({
      layers: [
        {
          ...baseVariables(),
          process: 'GTAW',
          filler: { ...baseVariables().filler, fNumber: 6 },
          gas: { shieldingComposition: 'argon' },
        },
      ],
    });
    const both = sampleWps({
      supportedBy: ['PQR-0042', 'PQR-0043'],
      layers: [
        sampleWps().layers[0]!,
        { ...sampleWps().layers[0]!, process: 'GTAW', fNumbers: [6] },
      ],
    });
    const report = supportFindings(both, [samplePqr(), tig]);
    expect(report.supported).toBe(true);
    expect(report.recordsUsed).toHaveLength(2);
  });
});
