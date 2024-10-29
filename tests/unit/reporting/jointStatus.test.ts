import { describe, expect, it } from 'vitest';

import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  describeStatus,
  outstandingJoints,
  statusOf,
  statusesFor,
  type JointStatusInput,
} from '../../../src/reporting/jointStatus.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleExamination } from '../../support/nde.js';
import { sampleEntry } from '../../support/weldLog.js';

const welded = [
  sampleEntry({ id: 'L-1', role: 'root', depositThickness: inches('1/8') }),
  sampleEntry({ id: 'L-2', role: 'fill', depositThickness: inches('1/4') }),
  sampleEntry({ id: 'L-3', role: 'cap', depositThickness: inches('1/8'), stencil: 'W-205' }),
];

const input = (overrides: Partial<JointStatusInput> = {}): JointStatusInput => ({
  joint: sampleJoint(),
  entries: welded,
  examinations: [sampleExamination(), sampleExamination({ id: 'X-2', method: 'VT' })],
  repairs: [],
  ...overrides,
});

describe('a joint that is finished', () => {
  it('reads as accepted with nothing outstanding', () => {
    const status = statusOf(input());
    expect(status.stage).toBe('accepted');
    expect(status.complete).toBe(true);
    expect(status.findings).toEqual([]);
    expect(status.depositLaid?.toFraction()).toBe('1/2');
    expect(status.welders).toEqual(['W-118', 'W-205']);
  });

  it('reads back in one line', () => {
    expect(describeStatus(statusOf(input()))).toBe('J-14 accepted');
  });
});

describe('the stages', () => {
  it('does not call a joint welded when nothing is in it', () => {
    const status = statusOf(input({ entries: [], examinations: [] }));
    expect(status.stage).toBe('mapped');
    expect(status.findings.map((item) => item.code)).toContain('status.not_welded');
  });

  it('will not read a radiograph on an unwelded joint as progress', () => {
    const status = statusOf(input({ entries: [] }));
    expect(status.stage).toBe('mapped');
    expect(status.complete).toBe(false);
  });

  it('reads as welded before anything is examined', () => {
    const status = statusOf(input({ examinations: [] }));
    expect(status.stage).toBe('welded');
    expect(status.methodsOutstanding).toEqual(['VT', 'RT']);
  });

  it('reads as repaired while a repair is open', () => {
    const status = statusOf(
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
    expect(status.stage).toBe('repaired');
    expect(status.openRepairs).toHaveLength(1);
    expect(status.findings.map((item) => item.code)).toContain('status.repair_open');
  });
});

describe('what stops a joint being finished', () => {
  it('an outstanding examination', () => {
    const status = statusOf(input({ examinations: [sampleExamination({ method: 'VT' })] }));
    expect(status.complete).toBe(false);
    expect(status.methodsOutstanding).toEqual(['RT']);
  });

  it('a rejected indication on one of the reports', () => {
    const status = statusOf(
      input({
        examinations: [
          sampleExamination({ method: 'VT' }),
          sampleExamination({
            indications: [{ type: 'crack', size: inches('1/32'), fromDatum: inches('20') }],
          }),
        ],
      }),
    );
    expect(status.complete).toBe(false);
    expect(status.findings.map((item) => item.code)).toContain('nde.rejected');
  });

  it('a radiograph taken before a heat treatment that had to come first', () => {
    const status = statusOf(input({ heatTreatedOn: date('2024-08-01') }));
    expect(status.complete).toBe(false);
    expect(status.findings.map((item) => item.code)).toContain(
      'status.examined_before_heat_treatment',
    );
  });

  it('but not a visual examination, which is looked at all the way through', () => {
    const status = statusOf(
      input({
        examinations: [
          sampleExamination({ method: 'VT' }),
          sampleExamination({ afterHeatTreatment: true, performedOn: date('2024-09-01') }),
        ],
        heatTreatedOn: date('2024-08-01'),
      }),
    );
    expect(status.findings.map((item) => item.code)).not.toContain(
      'status.examined_before_heat_treatment',
    );
  });

  it('a construction and examination pair with no efficiency at all', () => {
    const status = statusOf(input({ joint: sampleJoint({ type: 3, radiography: 'full' }) }));
    expect(status.findings.map((item) => item.code)).toContain('status.no_efficiency');
  });
});

describe('a part welded joint', () => {
  it('is noted without being counted as a fault', () => {
    const status = statusOf(input({ entries: [welded[0]!] }));
    expect(status.findings.map((item) => item.code)).toContain('status.part_welded');
    expect(status.findings.map((item) => item.severity)).toContain('advisory');
    expect(status.complete).toBe(true);
  });
});

describe('a whole vessel', () => {
  it('reports one status for each joint and picks out the unfinished ones', () => {
    const joints = [sampleJoint(), sampleJoint({ id: 'J-15' })];
    const statuses = statusesFor(joints, {
      entries: welded,
      examinations: [sampleExamination(), sampleExamination({ id: 'X-2', method: 'VT' })],
      repairs: [],
    });
    expect(statuses).toHaveLength(2);
    expect(outstandingJoints(statuses).map((item) => item.joint.id)).toEqual(['J-15']);
  });
});
