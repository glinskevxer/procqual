import { ValidationError } from '../core/errors.js';

/**
 * Test positions, production positions, and which of the second the first
 * buys you.
 *
 * The table is the one every welder in the shop can recite the useful half of:
 * weld the 6G coupon and you are good for everything. The half nobody
 * remembers is that a groove test qualifies fillets but never the other way
 * round, and that a plate coupon does not carry over to small bore pipe.
 */

export const TEST_POSITIONS = [
  '1G',
  '2G',
  '3G',
  '4G',
  '5G',
  '6G',
  '6GR',
  '1F',
  '2F',
  '3F',
  '4F',
  '5F',
] as const;

export type TestPosition = (typeof TEST_POSITIONS)[number];

export const PRODUCTION_POSITIONS = ['flat', 'horizontal', 'vertical', 'overhead'] as const;

export type ProductionPosition = (typeof PRODUCTION_POSITIONS)[number];

export type WeldType = 'groove' | 'fillet';

export type ProductForm = 'plate' | 'pipe';

/**
 * Uphill and downhill behave differently enough to be tracked separately, and
 * `not-applicable` is a third real answer rather than a missing one: a flat
 * coupon has no progression and never will have.
 */
export type Progression = 'uphill' | 'downhill' | 'not-applicable';

export interface PositionFacts {
  readonly code: TestPosition;
  readonly weldType: WeldType;
  /** The form the coupon is normally run on. Some positions only exist on pipe. */
  readonly couponForm: ProductForm | 'either';
  readonly axisFixed: boolean;
  readonly description: string;
}

const FACTS: Readonly<Record<TestPosition, PositionFacts>> = {
  '1G': {
    code: '1G',
    weldType: 'groove',
    couponForm: 'either',
    axisFixed: false,
    description: 'flat, rolled',
  },
  '2G': {
    code: '2G',
    weldType: 'groove',
    couponForm: 'either',
    axisFixed: true,
    description: 'horizontal',
  },
  '3G': {
    code: '3G',
    weldType: 'groove',
    couponForm: 'plate',
    axisFixed: true,
    description: 'vertical',
  },
  '4G': {
    code: '4G',
    weldType: 'groove',
    couponForm: 'plate',
    axisFixed: true,
    description: 'overhead',
  },
  '5G': {
    code: '5G',
    weldType: 'groove',
    couponForm: 'pipe',
    axisFixed: true,
    description: 'horizontal axis, fixed',
  },
  '6G': {
    code: '6G',
    weldType: 'groove',
    couponForm: 'pipe',
    axisFixed: true,
    description: 'inclined axis, fixed',
  },
  '6GR': {
    code: '6GR',
    weldType: 'groove',
    couponForm: 'pipe',
    axisFixed: true,
    description: 'inclined axis with a restriction ring',
  },
  '1F': {
    code: '1F',
    weldType: 'fillet',
    couponForm: 'either',
    axisFixed: false,
    description: 'flat, rolled',
  },
  '2F': {
    code: '2F',
    weldType: 'fillet',
    couponForm: 'either',
    axisFixed: true,
    description: 'horizontal',
  },
  '3F': {
    code: '3F',
    weldType: 'fillet',
    couponForm: 'plate',
    axisFixed: true,
    description: 'vertical',
  },
  '4F': {
    code: '4F',
    weldType: 'fillet',
    couponForm: 'plate',
    axisFixed: true,
    description: 'overhead',
  },
  '5F': {
    code: '5F',
    weldType: 'fillet',
    couponForm: 'pipe',
    axisFixed: true,
    description: 'horizontal axis, fixed',
  },
};

interface QualifiedPositions {
  readonly groove: readonly ProductionPosition[];
  readonly fillet: readonly ProductionPosition[];
}

const ALL: readonly ProductionPosition[] = ['flat', 'horizontal', 'vertical', 'overhead'];

const TABLE: Readonly<Record<TestPosition, QualifiedPositions>> = {
  '1G': { groove: ['flat'], fillet: ['flat'] },
  '2G': { groove: ['flat', 'horizontal'], fillet: ['flat', 'horizontal'] },
  '3G': { groove: ['flat', 'vertical'], fillet: ['flat', 'horizontal', 'vertical'] },
  '4G': { groove: ['flat', 'overhead'], fillet: ['flat', 'horizontal', 'overhead'] },
  '5G': { groove: ['flat', 'vertical', 'overhead'], fillet: ALL },
  '6G': { groove: ALL, fillet: ALL },
  '6GR': { groove: ALL, fillet: ALL },
  '1F': { groove: [], fillet: ['flat'] },
  '2F': { groove: [], fillet: ['flat', 'horizontal'] },
  '3F': { groove: [], fillet: ['flat', 'horizontal', 'vertical'] },
  '4F': { groove: [], fillet: ['flat', 'horizontal', 'overhead'] },
  '5F': { groove: [], fillet: ALL },
};

export function isTestPosition(value: string): value is TestPosition {
  return (TEST_POSITIONS as readonly string[]).includes(value.toUpperCase());
}

export function parseTestPosition(value: string): TestPosition {
  const upper = value.trim().toUpperCase();
  if (!isTestPosition(upper)) {
    throw new ValidationError('position', `not a test position: ${value}`, { value });
  }
  return upper;
}

export function isProductionPosition(value: string): value is ProductionPosition {
  return (PRODUCTION_POSITIONS as readonly string[]).includes(value.trim().toLowerCase());
}

export function parseProductionPosition(value: string): ProductionPosition {
  const lower = value.trim().toLowerCase();
  if (!isProductionPosition(lower)) {
    throw new ValidationError('position', `not a production position: ${value}`, {
      value,
      allowed: PRODUCTION_POSITIONS,
    });
  }
  return lower;
}

export function positionFacts(code: TestPosition): PositionFacts {
  const facts = FACTS[code];
  if (facts === undefined) {
    throw new ValidationError('position', `no facts recorded for ${code}`, { code });
  }
  return facts;
}

/**
 * Production positions a single coupon buys, for one weld type.
 *
 * A fillet coupon buys nothing for grooves, which is the asymmetry that
 * catches people out when a welder qualified 3F is put on a seam.
 */
export function positionsQualifiedBy(
  test: TestPosition,
  weldType: WeldType,
): readonly ProductionPosition[] {
  const row = TABLE[test];
  return weldType === 'groove' ? row.groove : row.fillet;
}

/** The combined coverage of several coupons, which is how 2G plus 5G works. */
export function combinedPositions(
  tests: readonly TestPosition[],
  weldType: WeldType,
): readonly ProductionPosition[] {
  const found = new Set<ProductionPosition>();
  for (const test of tests) {
    for (const position of positionsQualifiedBy(test, weldType)) {
      found.add(position);
    }
  }
  return ALL.filter((position) => found.has(position));
}

export function qualifiesAllPositions(tests: readonly TestPosition[], weldType: WeldType): boolean {
  return combinedPositions(tests, weldType).length === ALL.length;
}

/**
 * Whether a coupon run on one product form covers work on another.
 *
 * Pipe carries over to plate because the pipe coupon is the harder one. Plate
 * only carries over to pipe above the diameter where the curvature stops
 * mattering, which the caller decides with the diameter tables.
 */
export function coversProductForm(couponForm: ProductForm, production: ProductForm): boolean {
  if (couponForm === production) {
    return true;
  }
  return couponForm === 'pipe' && production === 'plate';
}

export function describePosition(code: TestPosition): string {
  const facts = positionFacts(code);
  return `${facts.code} ${facts.weldType} ${facts.description}`;
}

/**
 * Whether a coupon welded in one progression covers a joint run in another.
 *
 * Progression only exists on a vertical weld, so anywhere else the question
 * does not arise and the answer is yes. A coupon that recorded no progression
 * covers anything for the same reason: there was no vertical run on it to
 * record one from.
 */
export function progressionCovers(
  qualified: Progression,
  joint: Progression,
  position: ProductionPosition,
): boolean {
  if (position !== 'vertical') {
    return true;
  }
  if (qualified === 'not-applicable' || joint === 'not-applicable') {
    return true;
  }
  return qualified === joint;
}

export function positionsForWeldType(weldType: WeldType): readonly TestPosition[] {
  return TEST_POSITIONS.filter((code) => positionFacts(code).weldType === weldType);
}
