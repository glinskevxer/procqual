import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import { repairRates, weldRecordsFor } from '../../../src/reporting/repairRateReport.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleExamination } from '../../support/nde.js';
import { sampleEntry } from '../../support/weldLog.js';

let workspace: Workspace;

const rejected = (id: string, joint: string) =>
  sampleExamination({
    id,
    joint,
    performedOn: date('2025-03-01'),
    indications: [{ type: 'crack', size: inches('1/32'), fromDatum: inches('10') }],
  });

beforeEach(() => {
  workspace = Workspace.inMemory({ clock: new FixedClock('2025-03-03T09:00:00.000Z') });
});

describe('who owns a rejection', () => {
  beforeEach(() => {
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    workspace.fabrication.logWeld(
      sampleEntry({ id: 'L-1', role: 'root', stencil: 'W-090' }),
      'foreman',
    );
    workspace.fabrication.logWeld(
      sampleEntry({ id: 'L-2', role: 'fill', stencil: 'W-118' }),
      'foreman',
    );
    workspace.fabrication.logWeld(
      sampleEntry({ id: 'L-3', role: 'cap', stencil: 'W-205' }),
      'foreman',
    );
  });

  it('counts the fill and cap welders, not the root welder', () => {
    workspace.examinations.file(rejected('X-1', 'J-14'), 'qa');
    const records = weldRecordsFor(workspace);
    expect(records.map((record) => record.stencil)).toEqual(['W-118', 'W-205']);
    expect(records.every((record) => record.repaired)).toBe(true);
  });

  it('counts the root welder when nobody else worked the joint', () => {
    workspace.fabrication.mapJoint(sampleJoint({ id: 'J-15' }), 'kd');
    workspace.fabrication.logWeld(
      sampleEntry({ id: 'L-4', joint: 'J-15', role: 'root', stencil: 'W-090' }),
      'foreman',
    );
    workspace.examinations.file(rejected('X-2', 'J-15'), 'qa');
    const records = weldRecordsFor(workspace).filter((record) => record.joint === 'J-15');
    expect(records.map((record) => record.stencil)).toEqual(['W-090']);
  });

  it('leaves out a joint nobody has examined volumetrically', () => {
    workspace.examinations.file(sampleExamination({ id: 'X-3', method: 'VT' }), 'qa');
    expect(weldRecordsFor(workspace)).toEqual([]);
  });

  it('leaves out a joint nobody has welded', () => {
    workspace.fabrication.mapJoint(sampleJoint({ id: 'J-20' }), 'kd');
    workspace.examinations.file(sampleExamination({ id: 'X-4', joint: 'J-20' }), 'qa');
    expect(weldRecordsFor(workspace).some((record) => record.joint === 'J-20')).toBe(false);
  });
});

describe('the readings', () => {
  it('are empty when nothing has been examined', () => {
    expect(repairRates(workspace, date('2025-03-03'))).toEqual([]);
  });

  it('read as too small a sample on a handful of joints', () => {
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    workspace.fabrication.logWeld(sampleEntry({ role: 'cap' }), 'foreman');
    workspace.examinations.file(rejected('X-1', 'J-14'), 'qa');
    const readings = repairRates(workspace, date('2025-03-03'));
    expect(readings[0]?.state).toBe('insufficient-sample');
    expect(readings[0]?.rate.toString()).toBe('1');
  });
});
