/**
 * What this build is.
 *
 * The version was written out twice, in package.json and in the command line,
 * and the release check existed largely to notice when the two had drifted. A
 * check that exists to catch a duplication is a hint that the duplication is
 * the problem, so there is one literal now and the check compares the manifest
 * against this file rather than against another copy of the same number.
 *
 * It is not read out of package.json at runtime on purpose. The published
 * package has no package.json beside the built javascript in every layout it
 * might be installed under, and a version that reads as undefined on somebody
 * else's machine is worse than one that has to be bumped in two places.
 */
export const VERSION = '1.0.0';

export interface BuildInfo {
  readonly version: string;
  readonly node: string;
  readonly platform: string;
}

export function buildInfo(): BuildInfo {
  return {
    version: VERSION,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
  };
}

export function describeBuild(info: BuildInfo = buildInfo()): string {
  return `arc ${info.version} on node ${info.node}, ${info.platform}`;
}
