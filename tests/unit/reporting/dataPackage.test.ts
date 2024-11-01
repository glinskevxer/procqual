import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import type { HeatTreatmentChart } from '../../../src/fabrication/heatTreatmentChart.js';
import type { MaterialHeat } from '../../../src/materials/heat.js';
import {
  assemblePackage,
  outstandingSections,
  type PackageInput,
} from '../../../src/reporting/dataPackage.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleExamination } from '../../support/nde.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleEntry } from '../../support/weldLog.js';
import { sampleWps } from '../../support/wps.js';

const heat = (number: string): MaterialHeat => ({
  heatNumber: number,
  specification: 'SA-516 Gr 70',
  supplier: 'Dillinger',
  certificateNumber: `C-${number}`,
  certificateDate: date('2024-02-01'),
  thickness: inches('1/2'),
  normalised: false,
  chemistry: { C: decimal('0.18'), Mn: decimal('1.05') },
  mechanical: {
    tensileKsi: decimal('76'),
    yieldKsi: decimal('44'),
    elongationPercent: decimal('26'),
  },
});

const chart = (joints: string[]): HeatTreatmentChart => ({
  id: 'HT-311',
  vessel: 'V-2201',
  joints,
  furnace: 'F-1',
  pNumber: '1',
  governingThickness: inches('2'),
  runOn: date('2024-11-01'),
  readings: [
    { minute: 0, couples: [fahrenheit('80'), fahrenheit('80')] },
    { minute: 360, couples: [fahrenheit('1150'), fahrenheit('1140')] },
    { minute: 540, couples: [fahrenheit('1150'), fahrenheit('1140')] },
    { minute: 720, couples: [fahrenheit('700'), fahrenheit('690')] },
  ],
});

const input = (overrides: Partial<PackageInput> = {}): PackageInput => ({
  vessel: 'V-2201',
  joints: [sampleJoint()],
  entries: [sampleEntry({ depositThickness: inches('1/2') })],
  examinations: [sampleExamination(), sampleExamination({ id: 'X-2', method: 'VT' })],
  repairs: [],
  charts: [],
  heats: [heat('A47213')],
  procedures: [sampleWps()],
  records: [samplePqr()],
  ...overrides,
});

describe('a vessel that is ready', () => {
  it('has every section complete', () => {
    const report = assemblePackage(input());
    expect(report.complete).toBe(true);
    expect(report.outstanding).toBe(0);
    expect(outstandingSections(report)).toEqual([]);
  });

  it('reports one status for each joint', () => {
    expect(assemblePackage(input()).statuses).toHaveLength(1);
  });

  it('leaves out joints belonging to another vessel', () => {
    const report = assemblePackage(
      input({ joints: [sampleJoint(), sampleJoint({ id: 'J-99', vessel: 'V-3300' })] }),
    );
    expect(report.statuses.map((status) => status.joint.id)).toEqual(['J-14']);
  });
});

describe('material certificates', () => {
  it('catches a heat with no certificate on file', () => {
    const report = assemblePackage(input({ heats: [] }));
    const materials = report.sections.find((item) => item.name === 'material certificates');
    expect(materials?.complete).toBe(false);
    expect(materials?.findings[0]?.message).toContain('heat A47213');
  });

  it('carries the certificate findings through', () => {
    const bad = {
      ...heat('A47213'),
      mechanical: {
        tensileKsi: decimal('60'),
        yieldKsi: decimal('44'),
        elongationPercent: decimal('26'),
      },
    };
    const report = assemblePackage(input({ heats: [bad] }));
    const materials = report.sections.find((item) => item.name === 'material certificates');
    expect(materials?.findings.map((finding) => finding.code)).toContain(
      'heat.tensile_below_specification',
    );
  });
});

describe('procedures', () => {
  it('catches a joint welded to a procedure nobody issued', () => {
    const report = assemblePackage(
      input({ joints: [sampleJoint({ procedure: DocumentNumber.parse('WPS-9999') })] }),
    );
    const procedures = report.sections.find((item) => item.name === 'procedures');
    expect(procedures?.findings[0]?.message).toContain('no procedure on file for WPS-9999');
  });

  it('catches a supporting record that was never certified', () => {
    const report = assemblePackage(
      input({ records: [samplePqr({ certifiedOn: undefined, witnessedBy: undefined })] }),
    );
    const procedures = report.sections.find((item) => item.name === 'procedures');
    expect(procedures?.findings.map((finding) => finding.code)).toContain(
      'package.record_uncertified',
    );
  });
});

describe('heat treatment', () => {
  const thick = sampleJoint({ thickness: inches('2') });

  it('asks for a chart on a joint that needs one', () => {
    const report = assemblePackage(input({ joints: [thick] }));
    const treatment = report.sections.find((item) => item.name === 'heat treatment');
    expect(treatment?.findings.map((finding) => finding.code)).toContain('package.no_chart');
  });

  it('is satisfied by a chart that covers it', () => {
    const report = assemblePackage(input({ joints: [thick], charts: [chart(['J-14'])] }));
    const treatment = report.sections.find((item) => item.name === 'heat treatment');
    expect(treatment?.complete).toBe(true);
  });

  it('asks for nothing on a thin carbon steel joint', () => {
    const report = assemblePackage(input());
    const treatment = report.sections.find((item) => item.name === 'heat treatment');
    expect(treatment?.findings).toEqual([]);
  });

  it('carries the chart findings through', () => {
    const short = { ...chart(['J-14']), readings: chart(['J-14']).readings.slice(0, 2) };
    const report = assemblePackage(input({ joints: [thick], charts: [short] }));
    const treatment = report.sections.find((item) => item.name === 'heat treatment');
    expect(treatment?.findings.map((finding) => finding.code)).toContain('pwht.short_soak');
  });
});

describe('repairs', () => {
  it('holds the package open while one is open', () => {
    const report = assemblePackage(
      input({
        repairs: [
          {
            id: 'R-1',
            joint: 'J-14',
            raisedBy: 'X-4410',
            method: 'RT',
            defect: 'slag',
            attempt: 1,
            excavationLength: inches('4'),
            excavationDepth: inches('1/8'),
            jointThickness: inches('1/2'),
            excavatedOn: date('2024-11-08'),
            rewelderStencil: 'W-118',
          },
        ],
      }),
    );
    expect(report.complete).toBe(false);
    const repairs = report.sections.find((item) => item.name === 'repairs');
    expect(repairs?.findings[0]?.message).toContain('R-1 on J-14 is still open');
  });
});

describe('counting what is left', () => {
  it('counts blocking findings and deficiencies but not advisories', () => {
    const report = assemblePackage(
      input({ entries: [sampleEntry({ depositThickness: inches('1/4') })] }),
    );
    expect(report.outstanding).toBe(0);
    expect(report.complete).toBe(true);
  });
});
