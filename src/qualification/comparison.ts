import {
  variableDefinition,
  variablesForProcess,
  type VariableClass,
  type VariableDefinition,
} from '../codes/essentialVariable.js';
import { blocking, deficiency, advisory, type Finding } from '../core/errors.js';
import { describeValue, readVariable, sameValue, type WeldingVariables } from './variables.js';

/**
 * Comparing what was qualified against what is proposed.
 *
 * Every question in this system eventually comes down to this. Does the
 * procedure still cover the work. Does the revision need requalifying. Did the
 * welder run the joint the way the procedure says.
 *
 * The answer is never a plain diff, because the same difference means three
 * different things depending on the class the variable holds, and the class
 * depends on the process and on whether the job wants notch toughness. Two
 * identical comparisons of two identical procedures can come out differently
 * on two different vessels, and that is correct.
 */

export interface VariableChange {
  readonly definition: VariableDefinition;
  readonly variableClass: VariableClass;
  readonly qualified: unknown;
  readonly proposed: unknown;
}

export interface ComparisonOptions {
  readonly impactTestingRequired: boolean;
  /** Variables the caller has already handled by a range rule rather than equality. */
  readonly ignore?: readonly string[] | undefined;
}

export interface Comparison {
  readonly changes: readonly VariableChange[];
  readonly essential: readonly VariableChange[];
  readonly nonessential: readonly VariableChange[];
  readonly processChanged: boolean;
}

export function compareVariables(
  qualified: WeldingVariables,
  proposed: WeldingVariables,
  options: ComparisonOptions,
): Comparison {
  const ignore = new Set(options.ignore ?? []);
  if (qualified.process !== proposed.process) {
    return {
      changes: [],
      essential: [],
      nonessential: [],
      processChanged: true,
    };
  }
  const changes: VariableChange[] = [];
  for (const entry of variablesForProcess(qualified.process, options.impactTestingRequired)) {
    const key = entry.definition.key;
    if (ignore.has(key)) {
      continue;
    }
    const before = readVariable(qualified, key);
    const after = readVariable(proposed, key);
    if (!sameValue(before, after)) {
      changes.push({
        definition: entry.definition,
        variableClass: entry.variableClass,
        qualified: before,
        proposed: after,
      });
    }
  }
  return {
    changes,
    essential: changes.filter((change) => change.variableClass === 'essential'),
    nonessential: changes.filter((change) => change.variableClass === 'nonessential'),
    processChanged: false,
  };
}

export function requiresRequalification(comparison: Comparison): boolean {
  return comparison.processChanged || comparison.essential.length > 0;
}

export function describeChange(change: VariableChange): string {
  return `${change.definition.label} moved from ${describeValue(change.qualified)} to ${describeValue(change.proposed)}`;
}

export function comparisonFindings(comparison: Comparison): readonly Finding[] {
  if (comparison.processChanged) {
    return [
      blocking('comparison.process_changed', 'the welding process itself is different', {
        clause: 'QW-401.1',
      }),
    ];
  }
  const findings: Finding[] = [];
  for (const change of comparison.changes) {
    const message = describeChange(change);
    const extra = { clause: change.definition.clause, subject: change.definition.key };
    if (change.variableClass === 'essential') {
      findings.push(blocking('comparison.essential_changed', message, extra));
    } else if (change.variableClass === 'supplementary') {
      findings.push(deficiency('comparison.supplementary_changed', message, extra));
    } else {
      findings.push(advisory('comparison.nonessential_changed', message, extra));
    }
  }
  return findings;
}

/**
 * The same comparison read twice, once as an ordinary job and once as a job
 * wanting notch toughness.
 *
 * This is what a welding engineer actually wants before quoting. A revision
 * that is free today is a requalification the moment the next vessel is
 * stamped for a colder temperature, and finding that out at quotation time
 * rather than at fabrication time is worth the extra pass.
 */
export function compareBothWays(
  qualified: WeldingVariables,
  proposed: WeldingVariables,
  ignore: readonly string[] = [],
): {
  ordinary: Comparison;
  withToughness: Comparison;
  onlyEssentialWithToughness: readonly VariableChange[];
} {
  const ordinary = compareVariables(qualified, proposed, {
    impactTestingRequired: false,
    ignore,
  });
  const withToughness = compareVariables(qualified, proposed, {
    impactTestingRequired: true,
    ignore,
  });
  const ordinaryEssential = new Set(ordinary.essential.map((change) => change.definition.key));
  return {
    ordinary,
    withToughness,
    onlyEssentialWithToughness: withToughness.essential.filter(
      (change) => !ordinaryEssential.has(change.definition.key),
    ),
  };
}

export function changeFor(comparison: Comparison, key: string): VariableChange | undefined {
  const definition = variableDefinition(key);
  return comparison.changes.find((change) => change.definition.key === definition.key);
}
