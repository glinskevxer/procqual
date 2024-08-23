import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/core/errors.js';
import { date } from '../../../src/core/plainDate.js';
import { inches } from '../../../src/core/units.js';
import {
  APPROVAL_NEEDED_FROM_ATTEMPT,
  excavatedLength,
  isComplete,
  isDeepExcavation,
  needsEngineeringApproval,
  openRepairs,
  repairsOnJoint,
  reviewRepair,
  type Repair,
} from '../../../src/nde/repair.js';
import { sampleExamination } from '../../support/nde.js';

const repair = (overrides: Partial<Repair> = {}): Repair => ({
  id: 'R-77',
  joint: 'J-14',
  raisedBy: 'X-4410',
  method: 'RT',
  defect: 'slag',
  attempt: 1,
  excavationLength: inches('4'),
  excavationDepth: inches('1/8'),
  jointThickness: inches('1/2'),
  excavatedOn: date('2024-07-08'),
  rewelderStencil: 'W-118',
  reweldedOn: date('2024-07-09'),
  reExaminedBy: 'X-4470',
  ...overrides,
});

const reExamination = sampleExamination({
  id: 'X-4470',
  method: 'RT',
  performedOn: date('2024-07-10'),
});

describe('when engineering has to look at it', () => {
  it('leaves a first shallow repair alone', () => {
    expect(needsEngineeringApproval(repair())).toBe(false);
  });

  it('catches a second attempt at the same place', () => {
    expect(APPROVAL_NEEDED_FROM_ATTEMPT).toBe(2);
    expect(needsEngineeringApproval(repair({ attempt: 2 }))).toBe(true);
  });

  it('catches an excavation past half the wall', () => {
    expect(isDeepExcavation(repair({ excavationDepth: inches('0.3') }))).toBe(true);
    expect(isDeepExcavation(repair({ excavationDepth: inches('0.25') }))).toBe(false);
    expect(needsEngineeringApproval(repair({ excavationDepth: inches('0.4') }))).toBe(true);
  });

  it('refuses to answer for a joint with no thickness', () => {
    expect(() => isDeepExcavation(repair({ jointThickness: inches('0') }))).toThrow(
      ValidationError,
    );
  });
});

describe('reviewing a repair', () => {
  it('passes a clean one', () => {
    expect(reviewRepair(repair(), reExamination)).toEqual([]);
  });

  it('refuses an attempt number below one', () => {
    expect(reviewRepair(repair({ attempt: 0 }), reExamination).map((item) => item.code)).toContain(
      'repair.bad_attempt',
    );
  });

  it('refuses an excavation with no length or one deeper than the wall', () => {
    expect(
      reviewRepair(repair({ excavationLength: inches('0') }), reExamination).map(
        (item) => item.code,
      ),
    ).toContain('repair.no_excavation');
    expect(
      reviewRepair(repair({ excavationDepth: inches('1') }), reExamination).map(
        (item) => item.code,
      ),
    ).toContain('repair.through_wall');
  });

  it('insists on approval before a second attempt', () => {
    const findings = reviewRepair(repair({ attempt: 2 }), reExamination);
    expect(findings.map((item) => item.code)).toContain('repair.needs_approval');
    expect(findings[0]?.message).toMatch(/attempt 2 at the same place/);
  });

  it('accepts a second attempt once it is approved, with a note on it', () => {
    const findings = reviewRepair(
      repair({ attempt: 2, engineeringApproval: 'DE-118' }),
      reExamination,
    );
    expect(findings.map((item) => item.code)).toEqual(['repair.repeat']);
    expect(findings[0]?.severity).toBe('advisory');
  });

  it('gives a different reason for a deep excavation', () => {
    const findings = reviewRepair(repair({ excavationDepth: inches('0.4') }), reExamination);
    expect(findings[0]?.message).toMatch(/past half the wall/);
  });
});

describe('the state of the work', () => {
  it('records an open excavation as a deficiency and stops there', () => {
    const findings = reviewRepair(repair({ reweldedOn: undefined }), undefined);
    expect(findings.map((item) => item.code)).toEqual(['repair.not_rewelded']);
  });

  it('records a reweld with no examination as a deficiency', () => {
    const findings = reviewRepair(repair({ reExaminedBy: undefined }), undefined);
    expect(findings.map((item) => item.code)).toEqual(['repair.not_re_examined']);
  });

  it('refuses a reweld dated before the excavation', () => {
    const findings = reviewRepair(repair({ reweldedOn: date('2024-07-01') }), reExamination);
    expect(findings.map((item) => item.code)).toContain('repair.rewelded_before_excavated');
  });

  it('refuses a reweld with no welder', () => {
    expect(
      reviewRepair(repair({ rewelderStencil: '  ' }), reExamination).map((item) => item.code),
    ).toContain('repair.no_welder');
  });

  it('knows when a repair is finished', () => {
    expect(isComplete(repair())).toBe(true);
    expect(isComplete(repair({ reExaminedBy: undefined }))).toBe(false);
    expect(openRepairs([repair(), repair({ id: 'R-78', reweldedOn: undefined })])).toHaveLength(1);
  });
});

describe('the re-examination', () => {
  it('refuses a method easier than the one that found the fault', () => {
    const findings = reviewRepair(
      repair(),
      sampleExamination({ id: 'X-4470', method: 'PT', performedOn: date('2024-07-10') }),
    );
    expect(findings.map((item) => item.code)).toContain('repair.weaker_method');
  });

  it('refuses one against a different joint', () => {
    const findings = reviewRepair(
      repair(),
      sampleExamination({ id: 'X-4470', joint: 'J-15', performedOn: date('2024-07-10') }),
    );
    expect(findings.map((item) => item.code)).toContain('repair.wrong_joint');
  });

  it('refuses one dated before the reweld', () => {
    const findings = reviewRepair(
      repair(),
      sampleExamination({ id: 'X-4470', performedOn: date('2024-07-01') }),
    );
    expect(findings.map((item) => item.code)).toContain('repair.examined_before_rewelded');
  });
});

describe('across a joint', () => {
  const repairs = [
    repair({ id: 'R-2', attempt: 2, excavationLength: inches('2') }),
    repair({ id: 'R-1', attempt: 1, excavationLength: inches('4') }),
    repair({ id: 'R-3', joint: 'J-15', excavationLength: inches('9') }),
  ];

  it('lists them in attempt order', () => {
    expect(repairsOnJoint(repairs, 'J-14').map((item) => item.id)).toEqual(['R-1', 'R-2']);
  });

  it('adds the excavated length up', () => {
    expect(excavatedLength(repairs, 'J-14')?.toFraction()).toBe('6');
    expect(excavatedLength(repairs, 'J-99')).toBeUndefined();
  });
});
