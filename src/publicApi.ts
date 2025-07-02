/**
 * What this package promises to anybody importing it rather than running it.
 *
 * The barrel in `index.ts` is the promise and this is the list that keeps it
 * honest. A module named here is public: renaming one of its exports is a
 * breaking change. Anything not named here is internal, and the test beside
 * this file fails if a module is neither.
 *
 * Most of the tree is internal on purpose. The store, the command line and the
 * importers all move around, and a caller who reaches into them has bought a
 * dependency on this month's shape of the program rather than on the rules,
 * which are the part worth depending on.
 */

export const PUBLIC_MODULES: readonly string[] = [
  'codes/anumber',
  'codes/classification',
  'codes/essentialVariable',
  'codes/fnumber',
  'codes/heatTreatment',
  'codes/performanceRange',
  'codes/pnumber',
  'codes/position',
  'codes/process',
  'codes/thicknessRange',
  'codes/toughness',
  'core/clock',
  'core/decimal',
  'core/errors',
  'core/identifier',
  'core/interval',
  'core/plainDate',
  'core/result',
  'core/schema',
  'core/temperature',
  'core/text',
  'core/units',
  'materials/baseMetal',
  'materials/fillerMetal',
  'materials/heat',
  'qualification/bend',
  'qualification/hardness',
  'qualification/impact',
  'qualification/tensile',
  'qualification/testPlan',
];

/**
 * Modules that are deliberately not exported. Named rather than assumed, so
 * that adding a module is a decision rather than an oversight.
 */
export const INTERNAL_PREFIXES: readonly string[] = [
  'cli/',
  'core/limits',
  'exporting/',
  'fabrication/',
  'importing/',
  'nde/',
  'personnel/',
  'policy/',
  'qualification/comparison',
  'qualification/couponPlanner',
  'qualification/draft',
  'qualification/evaluation',
  'qualification/pqr',
  'qualification/qualifiedRanges',
  'qualification/retest',
  'qualification/revision',
  'qualification/support',
  'qualification/variables',
  'qualification/wps',
  'reporting/',
  'store/',
];

export function isPublic(module: string): boolean {
  return PUBLIC_MODULES.includes(module);
}

export function isInternal(module: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? module.startsWith(prefix) : module === prefix,
  );
}
