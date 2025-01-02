import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { importHeats, importWeldLog, importWelders } from '../../../src/importing/importers.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleJoint } from '../../support/joints.js';

let workspace: Workspace;

beforeEach(() => {
  workspace = Workspace.inMemory({ clock: new FixedClock('2024-12-20T09:00:00.000Z') });
});

describe('importing welders', () => {
  const file =
    'stencil,name,from,until\nW-118,R Ashworth,2019-04-01,\nW-205,T Naylor,2021-09-06,2024-06-30\n';

  it('writes every row', () => {
    const result = importWelders(workspace, file, { actor: 'kd' });
    expect(result.read).toBe(2);
    expect(result.written).toBe(2);
    expect(workspace.personnel.welders()).toHaveLength(2);
  });

  it('carries a leaving date through', () => {
    importWelders(workspace, file, { actor: 'kd' });
    expect(workspace.personnel.welder('W-205')?.employedUntil?.toString()).toBe('2024-06-30');
    expect(workspace.personnel.welder('W-118')?.employedUntil).toBeUndefined();
  });

  it('writes nothing at all when one row is bad', () => {
    const bad = 'stencil,name,from\nW-118,R Ashworth,2019-04-01\n118,T Naylor,2021-09-06\n';
    const result = importWelders(workspace, bad, { actor: 'kd' });
    expect(result.written).toBe(0);
    expect(result.findings[0]?.message).toContain('line 3');
    expect(result.findings[0]?.message).toContain('not a welder stencil');
    expect(workspace.personnel.welders()).toEqual([]);
  });

  it('names every bad row, not just the first', () => {
    const bad = 'stencil,name,from\n118,A,2019-04-01\n119,B,2019-04-01\n';
    expect(importWelders(workspace, bad).findings).toHaveLength(2);
  });

  it('refuses a file with a column missing', () => {
    expect(() => importWelders(workspace, 'stencil,name\nW-118,R Ashworth\n')).toThrow(
      /no from column/,
    );
  });

  it('writes nothing on a dry run and reports what would happen', () => {
    const result = importWelders(workspace, file, { dryRun: true });
    expect(result.read).toBe(2);
    expect(result.written).toBe(0);
    expect(result.findings).toEqual([]);
    expect(workspace.personnel.welders()).toEqual([]);
  });
});

describe('importing heats', () => {
  const file =
    'heat,specification,supplier,certificate,dated,thickness,tensile,yield,elongation,carbon,normalised\n' +
    'A47213,SA-516 Gr 70,Dillinger,C-90114,2024-02-01,1/2,76,44,26,0.18,no\n' +
    'A47214,SA-516 Gr 70,Dillinger,C-90115,2024-02-01,1/2,78,46,25,0.17,yes\n';

  it('writes both and reads the chemistry', () => {
    const result = importHeats(workspace, file, { actor: 'goods-in' });
    expect(result.written).toBe(2);
    expect(workspace.materials.requireHeat('A47213').chemistry.C?.toString()).toBe('0.18');
  });

  it('reads the normalised flag', () => {
    importHeats(workspace, file, { actor: 'goods-in' });
    expect(workspace.materials.requireHeat('A47214').normalised).toBe(true);
    expect(workspace.materials.requireHeat('A47213').normalised).toBe(false);
  });

  it('stops on a thickness it cannot read', () => {
    const bad = file.replace(',1/2,76,44,26,0.18,no', ',thick,76,44,26,0.18,no');
    const result = importHeats(workspace, bad);
    expect(result.written).toBe(0);
    expect(result.findings[0]?.message).toContain('line 2');
  });
});

describe('importing a weld log', () => {
  const file =
    'entry,joint,welder,process,procedure,welded,consumable,lot,deposit,foreman,role\n' +
    'L-1001,J-14,W-118,SMAW,WPS-0110,2024-07-02,E7018-1/8,LOT-88214,1/8,F-2,root\n' +
    'L-1002,J-14,W-118,SMAW,WPS-0110,2024-07-03,E7018-1/8,LOT-88214,1/4,F-2,\n';

  beforeEach(() => {
    workspace.fabrication.mapJoint(sampleJoint(), 'kd');
  });

  it('writes both entries', () => {
    const result = importWeldLog(workspace, file, { actor: 'foreman' });
    expect(result.written).toBe(2);
    expect(workspace.fabrication.entries('J-14')).toHaveLength(2);
  });

  it('reads the role and falls back to fill when it is blank', () => {
    importWeldLog(workspace, file, { actor: 'foreman' });
    const entries = workspace.fabrication.entries('J-14');
    expect(entries[0]?.role).toBe('root');
    expect(entries[1]?.role).toBe('fill');
  });

  it('stops on a process the shop does not run', () => {
    const bad = file.replace(',SMAW,WPS-0110,2024-07-02', ',EBW,WPS-0110,2024-07-02');
    const result = importWeldLog(workspace, bad);
    expect(result.written).toBe(0);
    expect(workspace.fabrication.entries()).toEqual([]);
  });
});
