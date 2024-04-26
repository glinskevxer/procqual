import { describe, expect, it } from 'vitest';

import { isAcceptable } from '../../../src/core/errors.js';
import { fahrenheit } from '../../../src/core/temperature.js';
import { inches } from '../../../src/core/units.js';
import {
  changeFor,
  compareBothWays,
  compareVariables,
  comparisonFindings,
  describeChange,
  requiresRequalification,
} from '../../../src/qualification/comparison.js';
import type { WeldingVariables } from '../../../src/qualification/variables.js';
import { baseVariables } from '../../support/variables.js';

const ordinary = { impactTestingRequired: false } as const;
const toughness = { impactTestingRequired: true } as const;

const change = (changes: (draft: WeldingVariables) => WeldingVariables): WeldingVariables =>
  changes(baseVariables());

describe('no change at all', () => {
  it('reports nothing', () => {
    const comparison = compareVariables(baseVariables(), baseVariables(), ordinary);
    expect(comparison.changes).toEqual([]);
    expect(requiresRequalification(comparison)).toBe(false);
    expect(comparisonFindings(comparison)).toEqual([]);
  });
});

describe('a changed process', () => {
  it('stops the comparison rather than listing every field', () => {
    const comparison = compareVariables(
      baseVariables(),
      change((draft) => ({ ...draft, process: 'GTAW' })),
      ordinary,
    );
    expect(comparison.processChanged).toBe(true);
    expect(comparison.changes).toEqual([]);
    expect(requiresRequalification(comparison)).toBe(true);
    expect(comparisonFindings(comparison).map((item) => item.code)).toEqual([
      'comparison.process_changed',
    ]);
  });
});

describe('an essential change', () => {
  const comparison = compareVariables(
    baseVariables(),
    change((draft) => ({
      ...draft,
      baseMetal: { ...draft.baseMetal, pNumber: '8' },
    })),
    ordinary,
  );

  it('is picked out of the register with its clause', () => {
    expect(comparison.essential).toHaveLength(1);
    expect(comparison.essential[0]?.definition.clause).toBe('QW-403.11');
  });

  it('forces requalification', () => {
    expect(requiresRequalification(comparison)).toBe(true);
  });

  it('reads as a blocking finding', () => {
    const findings = comparisonFindings(comparison);
    expect(findings[0]?.severity).toBe('blocking');
    expect(isAcceptable(findings)).toBe(false);
  });

  it('describes what moved and where it moved to', () => {
    expect(describeChange(comparison.essential[0]!)).toBe(
      'base metal P number moved from 1 to 8',
    );
  });
});

describe('a nonessential change', () => {
  const comparison = compareVariables(
    baseVariables(),
    change((draft) => ({
      ...draft,
      technique: { ...draft.technique, beadType: 'weave' },
    })),
    ordinary,
  );

  it('is reported but does not force requalification', () => {
    expect(comparison.changes).toHaveLength(1);
    expect(comparison.essential).toEqual([]);
    expect(requiresRequalification(comparison)).toBe(false);
  });

  it('reads as advisory', () => {
    expect(comparisonFindings(comparison)[0]?.severity).toBe('advisory');
  });
});

describe('a supplementary change', () => {
  const proposed = change((draft) => ({
    ...draft,
    preheat: { ...draft.preheat, interpassMaximum: fahrenheit('600') },
  }));

  it('is only a deficiency on ordinary work', () => {
    const comparison = compareVariables(baseVariables(), proposed, ordinary);
    expect(comparison.essential).toEqual([]);
    expect(comparisonFindings(comparison)[0]?.severity).toBe('deficiency');
    expect(requiresRequalification(comparison)).toBe(false);
  });

  it('becomes a requalification once the job wants toughness', () => {
    const comparison = compareVariables(baseVariables(), proposed, toughness);
    expect(comparison.essential).toHaveLength(1);
    expect(requiresRequalification(comparison)).toBe(true);
    expect(comparisonFindings(comparison)[0]?.severity).toBe('blocking');
  });
});

describe('reading it both ways at once', () => {
  it('separates the changes that only bite on a toughness job', () => {
    const proposed = change((draft) => ({
      ...draft,
      preheat: { ...draft.preheat, interpassMaximum: fahrenheit('600') },
      technique: { ...draft.technique, peening: true },
    }));
    const both = compareBothWays(baseVariables(), proposed);
    expect(requiresRequalification(both.ordinary)).toBe(false);
    expect(requiresRequalification(both.withToughness)).toBe(true);
    expect(both.onlyEssentialWithToughness.map((item) => item.definition.key)).toEqual([
      'preheat.interpassMaximum',
    ]);
  });

  it('reports an empty list when the change bites either way', () => {
    const proposed = change((draft) => ({
      ...draft,
      baseMetal: { ...draft.baseMetal, pNumber: '8' },
    }));
    const both = compareBothWays(baseVariables(), proposed);
    expect(both.onlyEssentialWithToughness).toEqual([]);
    expect(requiresRequalification(both.ordinary)).toBe(true);
  });
});

describe('ignoring variables handled by a range rule', () => {
  it('leaves out the keys the caller names', () => {
    const proposed = change((draft) => ({
      ...draft,
      baseMetal: { ...draft.baseMetal, thickness: inches('1/2') },
    }));
    const compared = compareVariables(baseVariables(), proposed, ordinary);
    expect(changeFor(compared, 'baseMetal.thickness')).toBeDefined();

    const ignored = compareVariables(baseVariables(), proposed, {
      ...ordinary,
      ignore: ['baseMetal.thickness', 'baseMetal.thicknessForToughness'],
    });
    expect(ignored.changes).toEqual([]);
  });

  it('finds a change by key or reports none', () => {
    const compared = compareVariables(baseVariables(), baseVariables(), ordinary);
    expect(changeFor(compared, 'baseMetal.pNumber')).toBeUndefined();
  });
});

describe('variables the process does not record', () => {
  it('are never compared, so a stray field cannot fail a shielded metal arc procedure', () => {
    const proposed = change((draft) => ({
      ...draft,
      filler: { ...draft.filler, flux: 'F7A2' },
    }));
    expect(compareVariables(baseVariables(), proposed, ordinary).changes).toEqual([]);
  });
});
