import { describe, expect, it } from 'vitest';

import { decimal } from '../../../src/core/decimal.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import { evaluateCoupon } from '../../../src/qualification/evaluation.js';
import type { ImpactRequirement, ImpactSet } from '../../../src/qualification/impact.js';
import {
  impactRetest,
  mechanicalRetest,
  retestFindings,
  retestPassed,
  totalRetestEnergy,
} from '../../../src/qualification/retest.js';
import { samplePqr } from '../../support/pqr.js';
import { passingBends, passingTensiles } from '../../support/specimens.js';

const requirement: ImpactRequirement = {
  specifiedMinimumTensileKsi: 70,
  lateralExpansionRequired: false,
};

const set = (energies: readonly string[]): ImpactSet => ({
  location: 'weld',
  testTemperature: fahrenheit('-20'),
  width: '10',
  specimens: energies.map((energy, index) => ({
    id: `C${index + 1}`,
    energyFootPounds: decimal(energy),
    lateralExpansion: inches('0.030'),
  })),
});

describe('a mechanical retest', () => {
  it('is not offered on a coupon that passed', () => {
    const verdict = evaluateCoupon(
      samplePqr({
        tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
      }),
    );
    const allowance = mechanicalRetest(verdict);
    expect(allowance.allowed).toBe(false);
    expect(retestFindings(allowance)).toEqual([]);
  });

  it('is offered on a tensile failure, at double the specimens', () => {
    const verdict = evaluateCoupon(
      samplePqr({
        tests: {
          tensile: [
            {
              ...passingTensiles()[0]!,
              ultimateLoadPounds: decimal('15000'),
              failureLocation: 'weld',
            },
            passingTensiles()[1]!,
          ],
          bends: passingBends(),
          impacts: [],
          hardness: [],
        },
      }),
    );
    const allowance = mechanicalRetest(verdict);
    expect(allowance.allowed).toBe(true);
    expect(allowance.specimens).toBe(12);
    expect(retestFindings(allowance)[0]?.severity).toBe('advisory');
  });

  it('is offered on a bend failure', () => {
    const verdict = evaluateCoupon(
      samplePqr({
        tests: {
          tensile: passingTensiles(),
          bends: [
            {
              id: 'B1',
              type: 'face',
              discontinuities: [{ location: 'weld', size: inches('1/4'), fusionRelated: true }],
            },
            ...passingBends().slice(1),
          ],
          impacts: [],
          hardness: [],
        },
      }),
    );
    expect(mechanicalRetest(verdict).allowed).toBe(true);
  });

  it('is refused when the record itself is at fault', () => {
    const verdict = evaluateCoupon(
      samplePqr({
        witnessedBy: 'W-118',
        tests: { tensile: passingTensiles(), bends: passingBends(), impacts: [], hardness: [] },
      }),
    );
    const allowance = mechanicalRetest(verdict);
    expect(allowance.allowed).toBe(false);
    expect(allowance.reason).toContain('the record itself is at fault');
    expect(retestFindings(allowance)[0]?.severity).toBe('blocking');
  });

  it('is refused when the failure was not a mechanical one', () => {
    const verdict = evaluateCoupon(
      samplePqr({
        tests: { tensile: passingTensiles(), bends: [], impacts: [], hardness: [] },
      }),
    );
    expect(mechanicalRetest(verdict).reason).toContain('not in a mechanical test');
  });
});

describe('an impact retest', () => {
  it('is not offered on a set that passed', () => {
    expect(impactRetest(set(['20', '22', '18']), requirement).allowed).toBe(false);
  });

  it('is offered when the average made it and the scatter failed', () => {
    const allowance = impactRetest(set(['40', '40', '5']), requirement);
    expect(allowance.allowed).toBe(true);
    expect(allowance.specimens).toBe(3);
    expect(allowance.reason).toContain('failed on its scatter');
  });

  it('is refused when the average itself missed', () => {
    const allowance = impactRetest(set(['10', '10', '10']), requirement);
    expect(allowance.allowed).toBe(false);
    expect(allowance.reason).toContain('not tough enough');
    expect(retestFindings(allowance)[0]?.severity).toBe('blocking');
  });
});

describe('grading a retest', () => {
  it('holds every specimen to the average figure', () => {
    expect(retestPassed(set(['16', '16', '16']), requirement).passed).toBe(true);
    const short = retestPassed(set(['16', '14', '16']), requirement);
    expect(short.passed).toBe(false);
    expect(short.below).toEqual(['C2']);
  });

  it('is a harder bar than the original set faced', () => {
    const energies = ['40', '40', '5'];
    expect(impactRetest(set(energies), requirement).allowed).toBe(true);
    expect(retestPassed(set(energies), requirement).passed).toBe(false);
  });

  it('adds the energies up for the record', () => {
    expect(totalRetestEnergy(set(['16', '17', '18'])).toString()).toBe('51');
  });
});
