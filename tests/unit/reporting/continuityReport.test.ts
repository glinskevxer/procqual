import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { DocumentNumber } from '../../../src/core/identifier.js';
import { date } from '../../../src/core/plainDate.js';
import { policyFrom } from '../../../src/policy/shopPolicy.js';
import {
  continuityReportFindings,
  continuityRows,
  dueRows,
  lapsedRows,
} from '../../../src/reporting/continuityReport.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleEntry } from '../../support/weldLog.js';
import { sampleQualification, sampleWelder } from '../../support/welders.js';

let workspace: Workspace;

const build = (policy = policyFrom({})): Workspace => {
  const built = Workspace.inMemory({
    clock: new FixedClock('2024-07-01T09:00:00.000Z'),
    policy,
  });
  built.personnel.registerWelder(sampleWelder(), 'kd');
  built.personnel.registerWelder(sampleWelder({ stencil: 'W-205' }), 'kd');
  built.personnel.recordQualification(sampleQualification(), '1', 'kd');
  built.personnel.recordQualification(
    sampleQualification({ number: DocumentNumber.parse('WPQ-0400'), stencil: 'W-205' }),
    '1',
    'kd',
  );
  return built;
};

beforeEach(() => {
  workspace = build();
});

describe('reading the register', () => {
  it('gives one row for each coupon, soonest to lapse first', () => {
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    workspace.fabrication.logWeld(sampleEntry({ weldedOn: date('2024-06-20') }), 'foreman');
    const rows = continuityRows(workspace, date('2024-07-01'));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.qualification.stencil).toBe('W-205');
  });

  it('folds the weld log in, so production work moves the clock', () => {
    const before = continuityRows(workspace, date('2024-07-01'))[0]?.status.expiresOn.toString();
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
    workspace.fabrication.logWeld(sampleEntry({ weldedOn: date('2024-06-20') }), 'foreman');
    const rows = continuityRows(workspace, date('2024-07-01'));
    const moved = rows.find((row) => row.qualification.stencil === 'W-118');
    expect(before).toBe('2024-07-16');
    expect(moved?.status.expiresOn.toString()).toBe('2024-12-20');
  });

  it('reads the shop policy rather than the code default', () => {
    const strict = build(policyFrom({ continuityMonths: 3 }));
    expect(continuityRows(strict, date('2024-06-01'))[0]?.status.state).toBe('lapsed');
    expect(continuityRows(workspace, date('2024-06-01'))[0]?.status.state).toBe('current');
  });
});

describe('narrowing', () => {
  it('picks the ones inside a window and the ones already gone', () => {
    expect(dueRows(continuityRows(workspace, date('2024-07-01')), 30)).toHaveLength(2);
    expect(lapsedRows(continuityRows(workspace, date('2024-07-01')))).toEqual([]);
    expect(lapsedRows(continuityRows(workspace, date('2025-01-01')))).toHaveLength(2);
  });
});

describe('the findings', () => {
  it('come back against the shop policy', () => {
    const rows = continuityRows(workspace, date('2024-07-01'));
    const findings = continuityReportFindings(workspace, rows);
    expect(findings.map((item) => item.code)).toContain('continuity.due_soon');
  });

  it('say nothing about a register with months left on it', () => {
    expect(
      continuityReportFindings(workspace, continuityRows(workspace, date('2024-02-01'))),
    ).toEqual([]);
  });
});
