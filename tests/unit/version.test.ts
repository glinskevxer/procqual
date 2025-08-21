import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildInfo, describeBuild, VERSION } from '../../src/version.js';

describe('the version', () => {
  it('is a plain three part number', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the one in the manifest', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(VERSION).toBe(manifest.version);
  });

  it('is named in the changelog', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toContain(`## ${VERSION}`);
  });
});

describe('the build information', () => {
  it('carries the version, the runtime and the platform', () => {
    const info = buildInfo();
    expect(info.version).toBe(VERSION);
    expect(info.node).toBe(process.versions.node);
    expect(info.platform).toContain(process.platform);
  });

  it('reads back as one line', () => {
    expect(describeBuild()).toBe(
      `arc ${VERSION} on node ${process.versions.node}, ${process.platform} ${process.arch}`,
    );
  });

  it('describes whatever it is given rather than only the live build', () => {
    expect(describeBuild({ version: '0.0.1', node: '18.0.0', platform: 'linux x64' })).toBe(
      'arc 0.0.1 on node 18.0.0, linux x64',
    );
  });
});
