import { beforeEach, describe, expect, it } from 'vitest';

import { FixedClock } from '../../../src/core/clock.js';
import { inches } from '../../../src/core/units.js';
import { exportPackage } from '../../../src/exporting/documents.js';
import { Workspace } from '../../../src/store/workspace.js';
import { sampleJoint } from '../../support/joints.js';
import { sampleExamination } from '../../support/nde.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleEntry } from '../../support/weldLog.js';
import { sampleWps } from '../../support/wps.js';

let workspace: Workspace;

const options = {
  vessel: 'V-2201',
  printedAt: '2025-01-10T09:00:00.000Z',
  buildVersion: '0.1.0',
};

beforeEach(() => {
  workspace = Workspace.inMemory({
    clock: new FixedClock('2025-01-10T09:00:00.000Z'),
    shop: 'bay four',
  });
  workspace.fabrication.mapJoint(sampleJoint(), 'kd');
  workspace.fabrication.mapJoint(sampleJoint({ id: 'J-99', vessel: 'V-3300' }), 'kd');
  workspace.fabrication.logWeld(sampleEntry({ depositThickness: inches('1/2') }), 'foreman');
  workspace.examinations.file(sampleExamination(), 'qa');
  workspace.procedures.recordQualification(samplePqr(), 'kd');
  workspace.procedures.issue(sampleWps(), 'engineer');
});

describe('the folder', () => {
  const names = () => exportPackage(workspace, options).map((document) => document.name);

  it('leads with an index', () => {
    expect(names()[0]).toBe('00-index.txt');
  });

  it('carries the map, the log and the examinations', () => {
    expect(names()).toContain('01-weld-map.txt');
    expect(names()).toContain('02-weld-log.txt');
    expect(names()).toContain('03-examinations.txt');
  });

  it('carries the procedures the vessel actually used and the records behind them', () => {
    expect(names()).toContain('04-wps-0110.txt');
    expect(names()).toContain('05-pqr-0042.txt');
  });

  it('ends with the outstanding items', () => {
    expect(names()[names().length - 1]).toContain('exceptions.txt');
  });

  it('has a unique name for every document', () => {
    expect(new Set(names()).size).toBe(names().length);
  });
});

describe('the index', () => {
  it('lists every document in the folder', () => {
    const documents = exportPackage(workspace, options);
    const index = documents[0];
    for (const document of documents.slice(1)) {
      expect(index?.text).toContain(document.name);
    }
  });

  it('names the shop and says which build printed it', () => {
    const index = exportPackage(workspace, options)[0];
    expect(index?.text).toContain('shop: bay four');
    expect(index?.text).toContain('by arc 0.1.0');
  });
});

describe('the contents', () => {
  const find = (name: string) =>
    exportPackage(workspace, options).find((document) => document.name === name);

  it('leaves another vessel out of the weld map', () => {
    expect(find('01-weld-map.txt')?.text).toContain('J-14');
    expect(find('01-weld-map.txt')?.text).not.toContain('J-99');
  });

  it('leaves another vessel out of the log and the examinations', () => {
    expect(find('02-weld-log.txt')?.text).toContain('L-1001');
    expect(find('03-examinations.txt')?.text).toContain('X-4410');
  });

  it('puts the procedure form in whole', () => {
    expect(find('04-wps-0110.txt')?.text).toContain('WELDING PROCEDURE SPECIFICATION');
  });

  it('lists the outstanding items section by section', () => {
    const exceptions = exportPackage(workspace, options).find((document) =>
      document.name.endsWith('exceptions.txt'),
    );
    expect(exceptions?.text).toContain('weld map and examinations');
    expect(exceptions?.text).toContain('material certificates');
  });

  it('says so when a vessel has nothing on it', () => {
    const empty = exportPackage(workspace, { ...options, vessel: 'V-9999' });
    expect(empty.find((document) => document.name === '01-weld-map.txt')?.text).toContain(
      'no joints on this vessel',
    );
  });
});
