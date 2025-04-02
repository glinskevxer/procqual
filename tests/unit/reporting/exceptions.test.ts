import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { decimal } from '../../../src/core/decimal.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import { shopExceptions, worstAreas } from '../../../src/reporting/exceptions.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleExamination, sampleTechnician } from '../../support/nde.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleVessel } from '../../support/vessels.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';
import { sampleWps } from '../../support/wps.js';

let workspace: Workspace;
const on = date('2025-03-24');

beforeEach(() => {
  workspace = Workspace.inMemory({ clock: new FixedClock('2025-03-24T09:00:00.000Z') });
});

describe('a quiet shop', () => {
  it('has nothing to report', () => {
    const report = shopExceptions(workspace, on);
    expect(report.areas).toEqual([]);
    expect(report.total).toBe(0);
    expect(report.blocking).toBe(0);
  });
});

describe('what turns up where', () => {
  it('reports a lapsed welder under welders', () => {
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.personnel.recordQualification(sampleQualification(), '1', 'kd');
    const report = shopExceptions(workspace, on);
    expect(report.areas.map((area) => area.area)).toEqual(['welders']);
    expect(report.areas[0]?.findings.map((finding) => finding.code)).toContain('continuity.lapsed');
  });

  it('reports an unsupported procedure under procedures', () => {
    workspace.procedures.issue(sampleWps({ supportedBy: [] }), 'engineer');
    const report = shopExceptions(workspace, on);
    expect(report.areas.map((area) => area.area)).toContain('procedures');
  });

  it('reports a joint that needs toughness under vessels', () => {
    workspace.vessels.record(
      sampleVessel({ minimumDesignMetalTemperature: fahrenheit('-20') }),
      'engineer',
    );
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    const report = shopExceptions(workspace, on);
    const vessels = report.areas.find((area) => area.area === 'vessels');
    expect(vessels?.findings.map((finding) => finding.code)).toContain('vessel.toughness_required');
  });

  it('reports a bad certificate under materials', () => {
    workspace.materials.certify(
      {
        heatNumber: 'A47213',
        specification: 'SA-516 Gr 70',
        supplier: 'Dillinger',
        certificateNumber: 'C-1',
        certificateDate: date('2025-01-01'),
        thickness: inches('1/2'),
        normalised: false,
        chemistry: {},
        mechanical: {
          tensileKsi: decimal('60'),
          yieldKsi: decimal('44'),
          elongationPercent: decimal('26'),
        },
      },
      'goods-in',
    );
    const materials = shopExceptions(workspace, on).areas.find((area) => area.area === 'materials');
    expect(materials?.findings.map((finding) => finding.code)).toContain(
      'heat.tensile_below_specification',
    );
  });

  it('reports an examination signed by a level one under examinations', () => {
    workspace.examinations.file(
      sampleExamination({ technician: sampleTechnician({ level: 'I' }) }),
      'qa',
    );
    const examinations = shopExceptions(workspace, on).areas.find(
      (area) => area.area === 'examinations',
    );
    expect(examinations?.findings.map((finding) => finding.code)).toContain('nde.level_too_low');
  });

  it('leaves an area out entirely when it has nothing wrong', () => {
    workspace.procedures.recordQualification(samplePqr(), 'kd');
    workspace.procedures.issue(sampleWps(), 'engineer');
    expect(shopExceptions(workspace, on).areas.map((area) => area.area)).not.toContain(
      'procedures',
    );
  });
});

describe('the totals', () => {
  it('count everything and the blocking ones separately', () => {
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.personnel.recordQualification(sampleQualification(), '1', 'kd');
    workspace.procedures.issue(sampleWps({ supportedBy: [], pNumbers: [] }), 'engineer');
    const report = shopExceptions(workspace, on);
    expect(report.total).toBeGreaterThan(report.blocking);
    expect(report.blocking).toBeGreaterThan(0);
  });

  it('sorts the areas by how much is wrong in each', () => {
    workspace.personnel.registerWelder(sampleWelder(), 'kd');
    workspace.personnel.recordQualification(sampleQualification(), '1', 'kd');
    workspace.procedures.issue(sampleWps({ supportedBy: [] }), 'engineer');
    const worst = worstAreas(shopExceptions(workspace, on));
    expect(worst.length).toBeGreaterThan(1);
    expect(worst[0]?.findings.length).toBeGreaterThanOrEqual(worst[1]?.findings.length ?? 0);
  });
});
