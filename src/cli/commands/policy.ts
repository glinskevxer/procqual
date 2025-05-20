import { Command } from 'commander';

import { ValidationError } from '../../core/errors.js';
import { keyValues } from '../../core/text.js';
import {
  CODE_CONTINUITY_LIMIT_MONTHS,
  DEFAULT_POLICY,
  describePolicy,
  loadPolicy,
  policyFrom,
  type ShopPolicy,
} from '../../policy/shopPolicy.js';
import type { Context } from '../context.js';
import { readJsonFile } from '../files.js';
import type { Output } from '../output.js';
import { printHeading, printTable } from '../output.js';

/**
 * The shop's own numbers.
 *
 * `check` reads a file without adopting it, which is the command somebody runs
 * before dropping a policy into a live workspace. Getting it wrong there
 * quietly changes who is qualified, and the failure is silent: nobody notices
 * a continuity window that got longer, only one that got shorter.
 */
export function policyCommand(out: Output, context: Context): Command {
  const command = new Command('policy').description('the numbers this shop sets for itself');

  const show = (policy: ShopPolicy, title: string): void => {
    printHeading(out, title);
    out.line(keyValues([...describePolicy(policy)]));
  };

  command
    .command('show')
    .description('what this workspace is running on')
    .action(() => {
      show(context.workspace().policy, `Policy for ${context.workspace().marker.shop}`);
    });

  command
    .command('defaults')
    .description('the figures a workspace uses when it sets none of its own')
    .action(() => {
      show(DEFAULT_POLICY, 'Default policy');
      out.line('');
      out.line(
        `the construction code caps continuity at ${String(CODE_CONTINUITY_LIMIT_MONTHS)} months, and a shop may only be stricter`,
      );
    });

  command
    .command('check <file>')
    .description('read a policy file without adopting it')
    .action((file: string) => {
      const parsed = readJsonFile(file);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ValidationError('policy', `${file} is not an object`, { file });
      }
      const policy = policyFrom(parsed as Partial<ShopPolicy>);
      show(policy, `Policy in ${file}`);
      out.line('');
      printTable(
        out,
        [...describePolicy(policy)].map(([field, value], index) => ({
          field,
          value,
          fallback: describePolicy(DEFAULT_POLICY)[index]?.[1] ?? '',
        })),
        [
          { header: 'field', value: (row) => row.field },
          { header: 'this file', value: (row) => row.value },
          { header: 'default', value: (row) => row.fallback },
          { header: 'changed', value: (row) => (row.value === row.fallback ? '' : 'yes') },
        ],
      );
    });

  command
    .command('workspace <directory>')
    .description('read the policy a workspace directory would load')
    .action((directory: string) => {
      show(loadPolicy(directory), `Policy at ${directory}`);
    });

  return command;
}
