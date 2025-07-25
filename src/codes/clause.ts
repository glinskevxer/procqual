import { allVariables } from './essentialVariable.js';

/**
 * The clauses this system rests on, and one line each about what it does with
 * them.
 *
 * The list matters for one reason. When an auditor asks where a rule comes
 * from, the answer has to be a clause number, and when the code is reissued
 * somebody has to work out which of these moved. A program that cites clauses
 * in its findings and cannot list them is asking its users to grep the source.
 *
 * The variable register is read rather than copied, so the clauses it cites
 * are on this list by construction. The rest are written down here because
 * they are cited from findings scattered across the tree.
 */

export type ClauseArea =
  | 'welding variables'
  | 'qualification testing'
  | 'welder performance'
  | 'construction'
  | 'examination'
  | 'materials';

export interface Clause {
  readonly number: string;
  readonly area: ClauseArea;
  readonly what: string;
}

const CITED: readonly Clause[] = [
  {
    number: 'QW-153.1',
    area: 'qualification testing',
    what: 'tensile acceptance, and the ninety five percent relaxation for a break in the base metal',
  },
  {
    number: 'QW-163',
    area: 'qualification testing',
    what: 'guided bend acceptance, and the corner tear allowance',
  },
  { number: 'QW-171', area: 'qualification testing', what: 'impact testing of a procedure coupon' },
  { number: 'QW-171.2', area: 'qualification testing', what: 'three specimens to an impact set' },
  {
    number: 'QW-304',
    area: 'welder performance',
    what: 'qualifying a welder on production radiography, and where that route is shut',
  },
  {
    number: 'QW-304.1',
    area: 'welder performance',
    what: 'gas metal arc coupons are bend tested rather than radiographed',
  },
  { number: 'QW-320', area: 'qualification testing', what: 'retests, on double the specimens' },
  { number: 'QW-322.1', area: 'welder performance', what: 'the continuity window' },
  {
    number: 'QW-322.2',
    area: 'welder performance',
    what: 'revocation, and what it takes to come back from one',
  },
  {
    number: 'QW-401.1',
    area: 'welding variables',
    what: 'a change of process is a change of everything',
  },
  {
    number: 'QW-451.1',
    area: 'qualification testing',
    what: 'the thickness ranges a coupon qualifies, and the specimens it has to yield',
  },
  { number: 'QW-462.5', area: 'qualification testing', what: 'hardness surveys across the weld' },
  {
    number: 'UCS-56',
    area: 'construction',
    what: 'post weld heat treatment, its ramp rates and its holding time',
  },
  {
    number: 'UCS-66',
    area: 'construction',
    what: 'the exemption curves, and whether the job needs notch toughness',
  },
  {
    number: 'UG-84',
    area: 'construction',
    what: 'impact test acceptance, read three ways at once',
  },
  { number: 'UHA-51', area: 'construction', what: 'toughness on the high alloy steels' },
  {
    number: 'UW-11',
    area: 'examination',
    what: 'how much radiography a joint gets, and when the code insists',
  },
  {
    number: 'UW-12',
    area: 'construction',
    what: 'joint efficiency by construction type and examination level',
  },
  { number: 'UW-16', area: 'examination', what: 'attachment welds and their surface examination' },
  { number: 'UW-35', area: 'examination', what: 'every weld is looked at' },
  {
    number: 'UW-38',
    area: 'examination',
    what: 'repairs, and examining them by the method that found the fault',
  },
  {
    number: 'UW-52',
    area: 'examination',
    what: 'spot radiography and the escalation when a spot fails',
  },
];

/** Every clause the variable register cites, taken from the register itself. */
export function variableClauses(): readonly Clause[] {
  const seen = new Map<string, string[]>();
  for (const definition of allVariables()) {
    const held = seen.get(definition.clause) ?? [];
    held.push(definition.label);
    seen.set(definition.clause, held);
  }
  return [...seen.entries()]
    .map(([number, labels]) => ({
      number,
      area: 'welding variables' as const,
      what: labels.join('; '),
    }))
    .sort((left, right) => left.number.localeCompare(right.number));
}

export function allClauses(): readonly Clause[] {
  return [...CITED, ...variableClauses()].sort((left, right) =>
    left.number.localeCompare(right.number),
  );
}

export function clausesIn(area: ClauseArea): readonly Clause[] {
  return allClauses().filter((clause) => clause.area === area);
}

export function clause(number: string): Clause | undefined {
  return allClauses().find((item) => item.number === number.trim().toUpperCase());
}

export function clauseAreas(): readonly ClauseArea[] {
  return [...new Set(allClauses().map((item) => item.area))].sort();
}
