import { describe, expect, it } from 'vitest';

import { ValidationError, isAcceptable } from '../../../src/core/errors.js';
import { inches } from '../../../src/core/units.js';
import {
  coverageFindings,
  incrementsFor,
  isSatisfied,
  readAllIncrements,
  readIncrement,
  shortFilms,
  spotsRequired,
  type Spot,
} from '../../../src/nde/coverage.js';

const spot = (overrides: Partial<Spot> = {}): Spot => ({
  id: 'S-1',
  examination: 'X-4410',
  increment: 1,
  filmLength: inches('10'),
  accepted: true,
  additional: false,
  ...overrides,
});

describe('how many spots', () => {
  it('is one for anything up to fifty feet', () => {
    expect(incrementsFor(inches('96'))).toBe(1);
    expect(incrementsFor(inches('600'))).toBe(1);
    expect(spotsRequired(inches('600'))).toBe(1);
  });

  it('rounds a part increment up', () => {
    expect(incrementsFor(inches('601'))).toBe(2);
    expect(incrementsFor(inches('1800'))).toBe(3);
  });

  it('refuses a weld with no length', () => {
    expect(() => incrementsFor(inches('0'))).toThrow(ValidationError);
  });
});

describe('one increment', () => {
  it('is satisfied by a clean first film', () => {
    const reading = readIncrement(1, [spot()]);
    expect(reading.state).toBe('satisfied');
    expect(reading.reason).toBe('the spot was clean');
  });

  it('has not started when no film has been taken', () => {
    expect(readIncrement(2, [spot()]).state).toBe('not-started');
  });

  it('asks for two more films when the first is rejected', () => {
    const reading = readIncrement(1, [spot({ accepted: false })]);
    expect(reading.state).toBe('two-more-required');
    expect(reading.reason).toMatch(/0 has been taken/);
  });

  it('still asks when only one of the two has been taken', () => {
    const reading = readIncrement(1, [
      spot({ accepted: false }),
      spot({ id: 'S-2', additional: true }),
    ]);
    expect(reading.state).toBe('two-more-required');
    expect(reading.reason).toMatch(/1 has been taken/);
  });

  it('is satisfied when both additional films are clean', () => {
    const reading = readIncrement(1, [
      spot({ accepted: false }),
      spot({ id: 'S-2', additional: true }),
      spot({ id: 'S-3', additional: true }),
    ]);
    expect(reading.state).toBe('satisfied');
    expect(reading.reason).toMatch(/only the original defect is repaired/);
  });

  it('rejects the whole increment when either additional film is bad', () => {
    const reading = readIncrement(1, [
      spot({ accepted: false }),
      spot({ id: 'S-2', additional: true }),
      spot({ id: 'S-3', additional: true, accepted: false }),
    ]);
    expect(reading.state).toBe('increment-rejected');
    expect(reading.reason).toMatch(/fully radiographed or cut out/);
  });

  it('keeps the increments apart', () => {
    const spots = [spot({ increment: 1, accepted: false }), spot({ id: 'S-9', increment: 2 })];
    expect(readIncrement(1, spots).state).toBe('two-more-required');
    expect(readIncrement(2, spots).state).toBe('satisfied');
  });
});

describe('a whole weld', () => {
  it('reads one increment for every fifty feet', () => {
    const readings = readAllIncrements(inches('1200'), [spot()]);
    expect(readings.map((item) => item.increment)).toEqual([1, 2]);
    expect(readings[1]?.state).toBe('not-started');
  });

  it('is satisfied only when every increment is', () => {
    expect(isSatisfied(readAllIncrements(inches('600'), [spot()]))).toBe(true);
    expect(isSatisfied(readAllIncrements(inches('1200'), [spot()]))).toBe(false);
  });
});

describe('the findings', () => {
  it('says nothing about a satisfied increment', () => {
    expect(coverageFindings(readAllIncrements(inches('600'), [spot()]))).toEqual([]);
  });

  it('records a missing film and an unfinished escalation as deficiencies', () => {
    const findings = coverageFindings(
      readAllIncrements(inches('1200'), [spot({ accepted: false })]),
    );
    expect(findings.map((item) => item.code)).toEqual([
      'coverage.two_more_required',
      'coverage.no_spot',
    ]);
    expect(isAcceptable(findings)).toBe(true);
  });

  it('blocks on a rejected increment', () => {
    const findings = coverageFindings(
      readAllIncrements(inches('600'), [
        spot({ accepted: false }),
        spot({ id: 'S-2', additional: true, accepted: false }),
        spot({ id: 'S-3', additional: true }),
      ]),
    );
    expect(findings[0]?.severity).toBe('blocking');
    expect(findings[0]?.clause).toBe('UW-52');
  });
});

describe('film length', () => {
  it('picks out films shorter than the minimum', () => {
    const spots = [spot(), spot({ id: 'S-2', filmLength: inches('4') })];
    expect(shortFilms(spots).map((item) => item.id)).toEqual(['S-2']);
  });
});
