import { describe, expect, it } from 'vitest';

import { Interval } from '../../../src/core/interval.js';
import { date } from '../../../src/core/plainDate.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  assessRevision,
  compareClaims,
  nextRevision,
} from '../../../src/qualification/revision.js';
import { samplePqr } from '../../support/pqr.js';
import { sampleWps } from '../../support/wps.js';

const records = [samplePqr()];
const issued = date('2024-06-01');

describe('taking the next revision', () => {
  it('bumps the number and the date and keeps everything else', () => {
    const revised = nextRevision(sampleWps(), { title: 'reworded' }, issued);
    expect(revised.number.toString()).toBe('WPS-0110 Rev 1');
    expect(revised.issuedOn.toString()).toBe('2024-06-01');
    expect(revised.title).toBe('reworded');
    expect(revised.pNumbers).toEqual(['1']);
  });
});

describe('narrowing a claim', () => {
  it('is free', () => {
    const revised = nextRevision(sampleWps(), { positions: ['flat', 'horizontal'] }, issued);
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.movements.map((item) => item.direction)).toEqual(['narrowed']);
    expect(impact.widened).toEqual([]);
    expect(impact.needsNewRecord).toBe(false);
  });

  it('reads as a narrowing when a process is dropped', () => {
    const wide = sampleWps({
      layers: [
        sampleWps().layers[0]!,
        { ...sampleWps().layers[0]!, process: 'GTAW', fNumbers: [6] },
      ],
    });
    const impact = compareClaims(wide, sampleWps());
    expect(impact.map((item) => item.detail)).toContain('GTAW removed from the procedure');
  });

  it('reads a tighter thickness range as a narrowing', () => {
    const revised = nextRevision(
      sampleWps(),
      { baseMetalThickness: Interval.closed(inches('0.125'), inches('0.5')) },
      issued,
    );
    expect(compareClaims(sampleWps(), revised)[0]?.direction).toBe('narrowed');
  });
});

describe('widening a claim', () => {
  it('is only free while a record still reaches that far', () => {
    const revised = nextRevision(
      sampleWps(),
      { baseMetalThickness: Interval.closed(inches('0.0625'), inches('1')) },
      issued,
    );
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.widened.map((item) => item.field)).toContain('base metal thickness');
    expect(impact.needsNewRecord).toBe(true);
    expect(impact.findings.map((item) => item.code)).toContain('support.base_metal_thickness');
  });

  it('is fine when the record already covers the wider claim', () => {
    const narrow = sampleWps({
      baseMetalThickness: Interval.closed(inches('0.25'), inches('0.5')),
    });
    const impact = assessRevision(narrow, sampleWps(), records);
    expect(impact.widened).toHaveLength(1);
    expect(impact.needsNewRecord).toBe(false);
  });

  it('counts adding a process as widening', () => {
    const revised = nextRevision(
      sampleWps(),
      {
        layers: [
          sampleWps().layers[0]!,
          { ...sampleWps().layers[0]!, process: 'GTAW', fNumbers: [6] },
        ],
      },
      issued,
    );
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.widened.map((item) => item.detail)).toContain('GTAW added to the procedure');
    expect(impact.needsNewRecord).toBe(true);
  });

  it('counts a lower preheat as widening and a higher one as narrowing', () => {
    const lower = nextRevision(
      sampleWps(),
      { layers: [{ ...sampleWps().layers[0]!, preheatMinimum: fahrenheit('40') }] },
      issued,
    );
    expect(compareClaims(sampleWps(), lower)[0]?.direction).toBe('widened');
    const higher = nextRevision(
      sampleWps(),
      { layers: [{ ...sampleWps().layers[0]!, preheatMinimum: fahrenheit('200') }] },
      issued,
    );
    expect(compareClaims(sampleWps(), higher)[0]?.direction).toBe('narrowed');
  });
});

describe('turning the toughness flag on', () => {
  it('widens nothing on the paper and can still break the procedure', () => {
    const revised = nextRevision(sampleWps(), { toughnessQualified: true }, issued);
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.movements.map((item) => item.field)).toEqual(['notch toughness']);
    expect(impact.movements[0]?.direction).toBe('widened');
    expect(
      impact.findings.some(
        (item) => item.code === 'support.interpass' && item.severity === 'blocking',
      ),
    ).toBe(false);
  });

  it('takes the interpass allowance away, which the record may not survive', () => {
    const revised = nextRevision(
      sampleWps(),
      {
        toughnessQualified: true,
        layers: [{ ...sampleWps().layers[0]!, interpassMaximum: fahrenheit('550') }],
      },
      issued,
    );
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.needsNewRecord).toBe(true);
    expect(impact.findings.map((item) => item.code)).toContain('support.interpass');
  });
});

describe('faults in the revision itself', () => {
  it('refuses a revision carrying the same number', () => {
    const impact = assessRevision(sampleWps(), sampleWps({ title: 'changed' }), records);
    expect(impact.findings.map((item) => item.code)).toContain('revision.same_number');
  });

  it('refuses a revision issued before the one it replaces', () => {
    const revised = nextRevision(sampleWps(), {}, date('2024-01-01'));
    expect(
      assessRevision(sampleWps(), revised, records).findings.map((item) => item.code),
    ).toContain('revision.issued_backwards');
  });

  it('says so when nothing actually moved', () => {
    const revised = nextRevision(sampleWps(), { title: 'reworded only' }, issued);
    const impact = assessRevision(sampleWps(), revised, records);
    expect(impact.movements).toEqual([]);
    expect(impact.findings.map((item) => item.code)).toContain('revision.no_change');
  });
});

describe('a heat treatment change', () => {
  it('is neither a widening nor a narrowing', () => {
    const revised = nextRevision(sampleWps(), { pwht: 'below-transformation' }, issued);
    const movement = compareClaims(sampleWps(), revised)[0];
    expect(movement?.direction).toBe('moved');
    expect(assessRevision(sampleWps(), revised, records).needsNewRecord).toBe(true);
  });
});
