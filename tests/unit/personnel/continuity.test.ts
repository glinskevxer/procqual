import { describe, expect, it } from 'vitest';

import { date } from '../../../src/core/plainDate.js';
import { DEFAULT_POLICY, policyFrom } from '../../../src/policy/shopPolicy.js';
import {
  continuityFindings,
  continuityStatusOn,
  dueWithinDays,
  isCurrent,
  renew,
} from '../../../src/personnel/continuity.js';
import { sampleQualification } from '../../support/welders.js';

const on = (text: string) => date(text);
const status = (uses: string[], today: string, overrides = {}) =>
  continuityStatusOn(
    sampleQualification(overrides),
    uses.map((value) => date(value)),
    on(today),
  );

describe('the six month clock', () => {
  it('runs from the coupon when nothing else has happened', () => {
    const result = status([], '2024-03-01');
    expect(result.lastUsed.toString()).toBe('2024-01-16');
    expect(result.expiresOn.toString()).toBe('2024-07-16');
    expect(result.state).toBe('current');
  });

  it('restarts on every day the process is used', () => {
    const result = status(['2024-04-02', '2024-05-20'], '2024-06-01');
    expect(result.lastUsed.toString()).toBe('2024-05-20');
    expect(result.expiresOn.toString()).toBe('2024-11-20');
  });

  it('lapses the day after the six months run out', () => {
    expect(status([], '2024-07-16').state).toBe('current');
    expect(status([], '2024-07-17').state).toBe('lapsed');
  });

  it('counts the months rather than a fixed number of days', () => {
    expect(DEFAULT_POLICY.continuityMonths).toBe(6);
    expect(status([], '2024-07-16').daysRemaining).toBe(0);
    expect(status([], '2024-07-01').daysRemaining).toBe(15);
  });

  it('ignores a use dated after the day being asked about', () => {
    const result = status(['2024-09-01'], '2024-08-01');
    expect(result.lastUsed.toString()).toBe('2024-01-16');
    expect(result.state).toBe('lapsed');
  });

  it('is not in force before the coupon was welded', () => {
    const result = status([], '2024-01-15');
    expect(result.state).toBe('not-yet');
    expect(isCurrent(result)).toBe(false);
  });
});

describe('a shop that sets a shorter window', () => {
  const strict = policyFrom({ continuityMonths: 3, continuityWarningDays: 60 });

  it('lapses a coupon the code would still allow', () => {
    const inside = continuityStatusOn(sampleQualification(), [], date('2024-06-01'));
    expect(inside.state).toBe('current');
    const outside = continuityStatusOn(sampleQualification(), [], date('2024-06-01'), strict);
    expect(outside.state).toBe('lapsed');
    expect(outside.reason).toContain('more than 3 months ago');
  });

  it('warns earlier as well', () => {
    const status = continuityStatusOn(sampleQualification(), [], date('2024-03-01'), strict);
    const findings = continuityFindings(sampleQualification(), status, strict);
    expect(findings[0]?.code).toBe('continuity.due_soon');
  });
});

describe('the other ways a qualification stops counting', () => {
  it('a coupon that failed never counted', () => {
    expect(status([], '2024-03-01', { passed: false }).state).toBe('failed');
  });

  it('a revocation beats a perfectly current clock', () => {
    const revoked = status([], '2024-06-01', {
      revokedOn: date('2024-05-01'),
      revokedReason: 'repair rate over the shop limit',
    });
    expect(revoked.state).toBe('revoked');
    expect(revoked.reason).toBe('repair rate over the shop limit');
  });

  it('a revocation dated later has not bitten yet', () => {
    expect(
      status([], '2024-04-01', { revokedOn: date('2024-05-01'), revokedReason: 'x' }).state,
    ).toBe('current');
  });
});

describe('renewal', () => {
  it('moves the date and keeps everything the coupon qualified', () => {
    const original = sampleQualification();
    const renewed = renew(original, date('2024-08-01'));
    expect(renewed.weldedOn.toString()).toBe('2024-08-01');
    expect(renewed.position).toBe(original.position);
    expect(renewed.depositThickness.equals(original.depositThickness)).toBe(true);
    expect(continuityStatusOn(renewed, [], date('2024-09-01')).state).toBe('current');
  });

  it('does not bring a revoked qualification back', () => {
    const revoked = sampleQualification({
      revokedOn: date('2024-05-01'),
      revokedReason: 'repair rate',
    });
    expect(
      continuityStatusOn(renew(revoked, date('2024-08-01')), [], date('2024-09-01')).state,
    ).toBe('revoked');
  });
});

describe('the warning list', () => {
  const entries = [
    { qualification: sampleQualification({ stencil: 'W-1' }), status: status([], '2024-07-10') },
    { qualification: sampleQualification({ stencil: 'W-2' }), status: status([], '2024-06-20') },
    { qualification: sampleQualification({ stencil: 'W-3' }), status: status([], '2024-08-01') },
  ];

  it('picks the ones inside the window, soonest first', () => {
    const due = dueWithinDays(entries, 30);
    expect(due.map((entry) => entry.qualification.stencil)).toEqual(['W-1', 'W-2']);
  });

  it('leaves out the ones that have already gone', () => {
    expect(dueWithinDays(entries, 365).map((entry) => entry.qualification.stencil)).toEqual([
      'W-1',
      'W-2',
    ]);
  });

  it('returns nothing for a window of zero when nothing expires today', () => {
    expect(dueWithinDays(entries, 0)).toEqual([]);
  });
});

describe('the findings', () => {
  it('says nothing about a qualification with months left', () => {
    expect(continuityFindings(sampleQualification(), status([], '2024-03-01'))).toEqual([]);
  });

  it('gives an advisory inside the last month', () => {
    const findings = continuityFindings(sampleQualification(), status([], '2024-07-10'));
    expect(findings[0]?.severity).toBe('advisory');
    expect(findings[0]?.message).toContain('lapses in 6 days');
  });

  it('calls a lapse a deficiency, because one coupon fixes it', () => {
    const findings = continuityFindings(sampleQualification(), status([], '2024-09-01'));
    expect(findings[0]?.severity).toBe('deficiency');
    expect(findings[0]?.code).toBe('continuity.lapsed');
  });

  it('calls a revocation blocking, because nothing short of requalifying fixes it', () => {
    const revoked = sampleQualification({
      revokedOn: date('2024-05-01'),
      revokedReason: 'repair rate',
    });
    const findings = continuityFindings(
      revoked,
      continuityStatusOn(revoked, [], date('2024-06-01')),
    );
    expect(findings[0]?.severity).toBe('blocking');
  });

  it('blocks a coupon that failed and one that has not happened yet', () => {
    expect(
      continuityFindings(
        sampleQualification({ passed: false }),
        status([], '2024-06-01', { passed: false }),
      )[0]?.code,
    ).toBe('continuity.failed');
    expect(continuityFindings(sampleQualification(), status([], '2024-01-01'))[0]?.code).toBe(
      'continuity.not_yet',
    );
  });
});
