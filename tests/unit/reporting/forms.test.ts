import { describe, expect, it } from 'vitest';

import { date } from '../../../src/core/plainDate.js';
import { procedureForm, recordForm, type FormHeader } from '../../../src/reporting/forms.js';
import { samplePqr } from '../../support/pqr.js';
import { passingBends, passingTensiles } from '../../support/specimens.js';
import { sampleWps } from '../../support/wps.js';

const header: FormHeader = {
  shop: 'bay four',
  printedAt: '2024-12-10T09:00:00.000Z',
  buildVersion: '0.1.0',
};

describe('the procedure form', () => {
  const form = procedureForm(sampleWps(), header);

  it('leads with the number', () => {
    expect(form.split('\n')[0]).toBe('WELDING PROCEDURE SPECIFICATION  WPS-0110 Rev 0');
  });

  it('carries the ranges and the process table', () => {
    expect(form).toContain('base metal:               P-No 1, groups 1/2');
    expect(form).toContain('thickness range:          [0.0625 in, 0.75 in]');
    expect(form).toMatch(/SMAW \(shielded metal arc\)\s+4\s+1\s+\[0 in, 0.75 in\]\s+uphill/);
  });

  it('has somewhere to sign', () => {
    expect(form).toContain('welding engineer');
    expect(form).toContain('quality manager');
    expect(form).toMatch(/date \.{12}/);
  });

  it('says which build printed it and when', () => {
    expect(form).toContain('printed 2024-12-10T09:00:00.000Z by arc 0.1.0');
  });

  it('says when a procedure has been withdrawn', () => {
    const withdrawn = procedureForm(sampleWps({ withdrawnOn: date('2025-01-01') }), header);
    expect(withdrawn).toContain('withdrawn:          2025-01-01');
    expect(form).toContain('withdrawn:          in force');
  });

  it('copes with a procedure that claims no process', () => {
    expect(procedureForm(sampleWps({ layers: [] }), header)).toContain(
      'no process on this procedure',
    );
  });
});

describe('the record form', () => {
  const record = samplePqr({
    tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
  });
  const form = recordForm(record, header);

  it('leads with the number and carries the coupon', () => {
    expect(form.split('\n')[0]).toBe('PROCEDURE QUALIFICATION RECORD  PQR-0042');
    expect(form).toContain('coupon thickness: 3/8');
    expect(form).toContain('heat numbers:     A47213 and A47213');
  });

  it('prints the qualified ranges rather than only the coupon', () => {
    expect(form).toMatch(/SMAW\s+1\s+1\/2\/3\/4\s+1\/2\/3\/4\s+\[0.0625 in, 0.75 in\]/);
  });

  it('prints the tensile results with the verdict on each', () => {
    expect(form).toMatch(/T1\s+0.28125\s+74.6667\s+66.5\s+base-metal\s+accept/);
    expect(form).toContain('RESULT: ACCEPTED');
  });

  it('prints the findings and the rejection when a coupon failed', () => {
    const failed = recordForm(
      samplePqr({ tests: { tensile: [], bends: [], impacts: [], hardness: [] } }),
      header,
    );
    expect(failed).toContain('BLOCKING');
    expect(failed).toContain('RESULT: REJECTED');
    expect(failed).toContain('no tensile specimens recorded');
  });

  it('says when a record has not been witnessed', () => {
    const draft = recordForm(samplePqr({ witnessedBy: undefined, certifiedOn: undefined }), header);
    expect(draft).toContain('witnessed by: not witnessed');
    expect(draft).toContain('certified:    not certified');
  });
});

describe('both forms', () => {
  it('stay inside the printer width', () => {
    const forms = [procedureForm(sampleWps(), header), recordForm(samplePqr(), header)];
    for (const form of forms) {
      for (const line of form.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(96);
      }
    }
  });

  it('have no trailing whitespace anywhere', () => {
    for (const line of procedureForm(sampleWps(), header).split('\n')) {
      expect(line).toBe(line.trimEnd());
    }
  });
});
