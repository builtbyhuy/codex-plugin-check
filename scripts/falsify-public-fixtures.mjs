#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, realpathSync } from 'node:fs';
import {
  link,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { main as cliMainReal, validateReceipt } from '../src/cli.mjs';

export const CODEX_VERSIONS = Object.freeze(['0.147.0', '0.146.1']);

const FIXED_FIXTURES = [
  {
    evidenceId: 'bitrouter',
    repository: 'bitrouter/bitrouter',
    repositoryUrl: 'https://github.com/bitrouter/bitrouter',
    commit: '678384888b73fc290ce4ce503a8a7f2a5cbf6da8',
    archiveUrl: 'https://codeload.github.com/bitrouter/bitrouter/tar.gz/678384888b73fc290ce4ce503a8a7f2a5cbf6da8',
    archiveRoot: 'bitrouter-678384888b73fc290ce4ce503a8a7f2a5cbf6da8',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'bitrouter',
    marketplace: 'bitrouter',
    license: 'Apache-2.0',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  },
  {
    evidenceId: 'oh-my-cassette',
    repository: 'Cassette-Editor/oh-my-cassette',
    repositoryUrl: 'https://github.com/Cassette-Editor/oh-my-cassette',
    commit: 'cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32',
    archiveUrl: 'https://codeload.github.com/Cassette-Editor/oh-my-cassette/tar.gz/cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32',
    archiveRoot: 'oh-my-cassette-cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32',
    classification: 'STATIC_ADAPTER',
    adapterId: 'local-source-v1',
    adapterPath: '.agents/plugins/marketplace.json',
    marketplaceRoot: '.',
    plugin: 'oh-my-cassette',
    marketplace: 'cassette-editor',
    license: 'MIT',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  },
  {
    evidenceId: 'watercooler',
    repository: 'mostlyharmless-ai/watercooler',
    repositoryUrl: 'https://github.com/mostlyharmless-ai/watercooler',
    commit: 'a5efa89df02e7796e20881fef4847f129d84d367',
    archiveUrl: 'https://codeload.github.com/mostlyharmless-ai/watercooler/tar.gz/a5efa89df02e7796e20881fef4847f129d84d367',
    archiveRoot: 'watercooler-a5efa89df02e7796e20881fef4847f129d84d367',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'watercooler',
    marketplace: 'watercooler',
    license: 'Apache-2.0',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  },
  {
    evidenceId: 'commercetools',
    repository: 'commercetools/commercetools-ai-plugins',
    repositoryUrl: 'https://github.com/commercetools/commercetools-ai-plugins',
    commit: '440d6bd56eb2969b6a0dd41e3fcff286def0787c',
    archiveUrl: 'https://codeload.github.com/commercetools/commercetools-ai-plugins/tar.gz/440d6bd56eb2969b6a0dd41e3fcff286def0787c',
    archiveRoot: 'commercetools-ai-plugins-440d6bd56eb2969b6a0dd41e3fcff286def0787c',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'commercetools',
    marketplace: 'commercetools',
    license: 'CC-BY-4.0',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  },
  {
    evidenceId: 'ctx',
    repository: 'agentis-tools/ctx',
    repositoryUrl: 'https://github.com/agentis-tools/ctx',
    commit: '1782436e0ebf8d95ef4c086d94351698c464c4ee',
    archiveUrl: 'https://codeload.github.com/agentis-tools/ctx/tar.gz/1782436e0ebf8d95ef4c086d94351698c464c4ee',
    archiveRoot: 'ctx-1782436e0ebf8d95ef4c086d94351698c464c4ee',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: 'plugins/codex/ctx',
    plugin: 'ctx',
    marketplace: 'ctx-local',
    license: 'Apache-2.0 OR MIT',
    licensePaths: ['LICENSE-APACHE', 'LICENSE-MIT'],
    expectedKinds: ['skill', 'hook']
  },
  {
    evidenceId: 'agentmail',
    repository: 'agentmail-to/agentmail-plugins',
    repositoryUrl: 'https://github.com/agentmail-to/agentmail-plugins',
    commit: '134887caf9375229415e09c760ae31baa4cc1ec3',
    archiveUrl: 'https://codeload.github.com/agentmail-to/agentmail-plugins/tar.gz/134887caf9375229415e09c760ae31baa4cc1ec3',
    archiveRoot: 'agentmail-plugins-134887caf9375229415e09c760ae31baa4cc1ec3',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'agentmail',
    marketplace: 'agentmail',
    license: 'MIT',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  },
  {
    evidenceId: 'sarathi',
    repository: 'ujjwalredd/sarathi',
    repositoryUrl: 'https://github.com/ujjwalredd/sarathi',
    commit: '08a51154a2f30af3eb4f6acb11115b9db912c5f8',
    archiveUrl: 'https://codeload.github.com/ujjwalredd/sarathi/tar.gz/08a51154a2f30af3eb4f6acb11115b9db912c5f8',
    archiveRoot: 'sarathi-08a51154a2f30af3eb4f6acb11115b9db912c5f8',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'sarathi',
    marketplace: 'sarathi',
    license: 'MIT',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill']
  },
  {
    evidenceId: 'cc-plugin-codex',
    repository: 'sofus-nl/cc-plugin-codex',
    repositoryUrl: 'https://github.com/sofus-nl/cc-plugin-codex',
    commit: 'cc5123f7fa18db9c38f838a9b70119e5a0a6847c',
    archiveUrl: 'https://codeload.github.com/sofus-nl/cc-plugin-codex/tar.gz/cc5123f7fa18db9c38f838a9b70119e5a0a6847c',
    archiveRoot: 'cc-plugin-codex-cc5123f7fa18db9c38f838a9b70119e5a0a6847c',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'cc-plugin-codex',
    marketplace: 'cc-plugin-codex',
    license: 'Apache-2.0',
    licensePaths: [
      'LICENSE',
      'plugins/cc-plugin-codex/LICENSE',
      'plugins/cc-plugin-codex/NOTICE'
    ],
    expectedKinds: ['skill', 'hook']
  },
  {
    evidenceId: 'speedy-skills',
    repository: 'RMI/speedy-skills',
    repositoryUrl: 'https://github.com/RMI/speedy-skills',
    commit: 'e983f800056a12b63fd60d5148538f98aaafe643',
    archiveUrl: 'https://codeload.github.com/RMI/speedy-skills/tar.gz/e983f800056a12b63fd60d5148538f98aaafe643',
    archiveRoot: 'speedy-skills-e983f800056a12b63fd60d5148538f98aaafe643',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'example-minimal',
    marketplace: 'speedy-skills',
    license: 'MIT',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill']
  },
  {
    evidenceId: 'roadrunner-admin',
    repository: 'roadrunner-tuff/roadrunner-admin-plugin',
    repositoryUrl: 'https://github.com/roadrunner-tuff/roadrunner-admin-plugin',
    commit: '8e130c07656c8f9db8bf5431332c9aed60a4b133',
    archiveUrl: 'https://codeload.github.com/roadrunner-tuff/roadrunner-admin-plugin/tar.gz/8e130c07656c8f9db8bf5431332c9aed60a4b133',
    archiveRoot: 'roadrunner-admin-plugin-8e130c07656c8f9db8bf5431332c9aed60a4b133',
    classification: 'DIRECT',
    adapterId: 'none',
    marketplaceRoot: '.',
    plugin: 'roadrunner-admin',
    marketplace: 'roadrunner',
    license: 'Apache-2.0',
    licensePaths: ['LICENSE'],
    expectedKinds: ['skill', 'mcp']
  }
];

function fixedCapabilities(rows) {
  return rows.map(([kind, key, source]) => ({ kind, key, source }));
}

const FIXED_PLUGIN_CONTRACTS = {
  bitrouter: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.1.0',
    expectedCheckoutSha256: 'ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9',
    expectedMarketplaceSha256: 'ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'bitrouter', 'plugin/read'],
      ['skill', 'bitrouter:bitrouter', 'plugin/read + skills/list']
    ])
  },
  'oh-my-cassette': {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.4.14',
    expectedCheckoutSha256: '9dffb7f24db16606eeb44f7a23746073716069e63e4cf58a07631c02e1f57177',
    expectedMarketplaceSha256: '32c159545ca3626c13dfae8f1c833e456584df10c204060539475fd6c301b8e8',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'cassette', 'plugin/read'],
      ['skill', 'oh-my-cassette:cassette-model', 'plugin/read + skills/list'],
      ['skill', 'oh-my-cassette:cassette-video-edit', 'plugin/read + skills/list']
    ])
  },
  watercooler: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: 'plugins/codex/watercooler',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.5.6',
    expectedCheckoutSha256: 'ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19',
    expectedMarketplaceSha256: 'ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'watercooler', 'plugin/read'],
      ['skill', 'watercooler:find-related', 'plugin/read + skills/list'],
      ['skill', 'watercooler:recall', 'plugin/read + skills/list'],
      ['skill', 'watercooler:search-threads', 'plugin/read + skills/list'],
      ['skill', 'watercooler:threads', 'plugin/read + skills/list'],
      ['skill', 'watercooler:update-agent-context', 'plugin/read + skills/list'],
      ['skill', 'watercooler:watercooler-health', 'plugin/read + skills/list'],
      ['skill', 'watercooler:watercooler-onboarding', 'plugin/read + skills/list']
    ])
  },
  commercetools: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.agents/plugins/commercetools',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.14.0',
    expectedCheckoutSha256: '749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0',
    expectedMarketplaceSha256: '749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'commerce-mcp', 'plugin/read'],
      ['mcp', 'commercetools-knowledge', 'plugin/read'],
      ['skill', 'commercetools:commercetools-checkout', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-commerce-patterns', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-connect', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-platform', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-storefront', 'plugin/read + skills/list']
    ])
  },
  ctx: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.4.0',
    expectedCheckoutSha256: '7f6934a57be05a126b968a5c5d346fb9d3150bdb6a57e199d2274204c94337eb',
    expectedMarketplaceSha256: '7b3212dbd512ee0bbf7f8c3c2b69c86bdba41ed55f9f71e5f69e63dc0cce49f7',
    expectedCapabilities: fixedCapabilities([
      ['hook', 'ctx@ctx-local:hooks/hooks.json:post_tool_use:0:0', 'plugin/read + hooks/list'],
      ['hook', 'ctx@ctx-local:hooks/hooks.json:session_start:0:0', 'plugin/read + hooks/list'],
      ['hook', 'ctx@ctx-local:hooks/hooks.json:stop:0:0', 'plugin/read + hooks/list'],
      ['skill', 'ctx:ctx', 'plugin/read + skills/list']
    ])
  },
  agentmail: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.3.0',
    expectedCheckoutSha256: '97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669',
    expectedMarketplaceSha256: '97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'agentmail', 'plugin/read'],
      ['skill', 'agentmail:agent-email-patterns', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-cli', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-mcp', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-toolkit', 'plugin/read + skills/list'],
      ['skill', 'agentmail:check-email', 'plugin/read + skills/list'],
      ['skill', 'agentmail:manage-inboxes', 'plugin/read + skills/list'],
      ['skill', 'agentmail:send-email', 'plugin/read + skills/list']
    ])
  },
  sarathi: {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: '.',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.6.0',
    expectedCheckoutSha256: 'da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599',
    expectedMarketplaceSha256: 'da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599',
    expectedCapabilities: fixedCapabilities([
      ['skill', 'sarathi:sarathi', 'plugin/read + skills/list']
    ])
  },
  'cc-plugin-codex': {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: 'plugins/cc-plugin-codex',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.1.1',
    expectedCheckoutSha256: '1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed',
    expectedMarketplaceSha256: '1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed',
    expectedCapabilities: fixedCapabilities([
      ['hook', 'cc-plugin-codex@cc-plugin-codex:hooks/hooks.json:session_end:0:0', 'plugin/read + hooks/list'],
      ['hook', 'cc-plugin-codex@cc-plugin-codex:hooks/hooks.json:stop:0:0', 'plugin/read + hooks/list'],
      ['skill', 'cc-plugin-codex:claude-adversarial-review', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-cancel', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-cli-runtime', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-prompting', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-rescue', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-result', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-result-handling', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-review', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-setup', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-status', 'plugin/read + skills/list'],
      ['skill', 'cc-plugin-codex:claude-transfer', 'plugin/read + skills/list']
    ])
  },
  'speedy-skills': {
    marketplaceManifestPath: '.claude-plugin/marketplace.json',
    pluginRoot: 'plugins/example-minimal',
    pluginManifestPath: '.claude-plugin/plugin.json',
    pluginVersion: '0.1.0',
    expectedCheckoutSha256: 'd39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2',
    expectedMarketplaceSha256: 'd39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2',
    expectedCapabilities: fixedCapabilities([
      ['skill', 'example-minimal:summarizing-git-log', 'plugin/read + skills/list']
    ])
  },
  'roadrunner-admin': {
    marketplaceManifestPath: '.agents/plugins/marketplace.json',
    pluginRoot: 'plugins/roadrunner-admin',
    pluginManifestPath: '.codex-plugin/plugin.json',
    pluginVersion: '0.1.0',
    expectedCheckoutSha256: '33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1',
    expectedMarketplaceSha256: '33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1',
    expectedCapabilities: fixedCapabilities([
      ['mcp', 'roadrunner-admin', 'plugin/read'],
      ['skill', 'roadrunner-admin:roadrunner-admin', 'plugin/read + skills/list']
    ])
  }
};

for (const fixture of FIXED_FIXTURES) {
  Object.assign(fixture, FIXED_PLUGIN_CONTRACTS[fixture.evidenceId]);
}

export const PUBLIC_FIXTURES = Object.freeze(
  FIXED_FIXTURES.map((fixture) => Object.freeze({
    ...fixture,
    licensePaths: Object.freeze([...fixture.licensePaths]),
    expectedKinds: Object.freeze([...fixture.expectedKinds]),
    expectedCapabilities: Object.freeze(fixture.expectedCapabilities.map((capability) => (
      Object.freeze({ ...capability })
    )))
  }))
);

const FIXED_FIXTURE_JSON = JSON.stringify(FIXED_FIXTURES);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const EXPECTED_SOURCE = {
  source: 'url',
  url: 'https://github.com/Cassette-Editor/oh-my-cassette.git',
  ref: 'release'
};
const EXPECTED_MANIFEST_SHA256 = 'd5c629f3a3b8dd2cdf560963c26b1c5e9dc062045fef13cafca178e7b1bd3d3f';
const DEFAULT_ARCHIVE_LIMIT = 128 * 1024 * 1024;
const DEFAULT_UNCOMPRESSED_LIMIT = 512 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const MAX_ARCHIVE_ENTRIES = 100_000;
const PROBE_RECEIPT_LIMIT = 1024 * 1024;
const DOCKER_TIMEOUT_MS = 10_000;
const DOCKER_OUTPUT_LIMIT = 64 * 1024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateFixtureDefinitions(fixtures) {
  if (!Array.isArray(fixtures) || JSON.stringify(fixtures) !== FIXED_FIXTURE_JSON) {
    throw new Error('Public matrix must use the fixed fixture definitions');
  }
  return fixtures;
}

function githubProvenanceFromEnvironment(env) {
  const keys = [
    'GITHUB_ACTIONS',
    'GITHUB_EVENT_NAME',
    'GITHUB_REF',
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_RUN_ID',
    'GITHUB_SERVER_URL',
    'GITHUB_SHA'
  ];
  const hasGithubValue = keys.some((key) => (
    typeof env[key] === 'string' && env[key] !== ''
  ));
  if (!hasGithubValue) return null;
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_REPOSITORY !== 'builtbyhuy/codex-plugin-check' ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ||
    env.GITHUB_SERVER_URL !== 'https://github.com' ||
    !COMMIT_SHA.test(env.GITHUB_SHA ?? '')
  ) {
    throw new Error('GitHub Actions provenance was incomplete or outside trusted main');
  }
  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${
    env.GITHUB_RUN_ID
  }`;
  return {
    provider: 'github-actions',
    repository: env.GITHUB_REPOSITORY,
    commit: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    event: env.GITHUB_EVENT_NAME,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    runUrl,
    artifactName: `public-fixture-evidence-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`
  };
}

export function publicFixtureOptionsFromEnvironment(env = process.env, cwd = process.cwd()) {
  if (
    env.CODEX_CURRENT_VERSION !== CODEX_VERSIONS[0] ||
    env.CODEX_PRIOR_VERSION !== CODEX_VERSIONS[1]
  ) {
    throw new Error(
      `Public fixture matrix requires CODEX_CURRENT_VERSION=${CODEX_VERSIONS[0]} and ` +
      `CODEX_PRIOR_VERSION=${CODEX_VERSIONS[1]}`
    );
  }
  const requested = env.CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT;
  const outputBoundary = path.resolve(cwd);
  const outputRoot = path.resolve(outputBoundary, requested ?? '');
  const relative = path.relative(outputBoundary, outputRoot);
  if (
    typeof requested !== 'string' ||
    requested.trim() === '' ||
    path.isAbsolute(requested) ||
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT must name a relative evidence directory');
  }
  return {
    architecture: process.arch,
    outputBoundary,
    outputRoot,
    platform: process.platform,
    provenance: githubProvenanceFromEnvironment(env)
  };
}

function safeArchivePath(value, label, allowRelativeSegments = false) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`Unsafe archive ${label}`);
  }
  const withoutTrailingSlash = value.endsWith('/') ? value.slice(0, -1) : value;
  const components = withoutTrailingSlash.split('/');
  if (components.some((component) =>
    component === '' || (!allowRelativeSegments && (component === '.' || component === '..'))
  )) {
    throw new Error(`Unsafe archive ${label}`);
  }
  return withoutTrailingSlash;
}

function isInsideArchiveRoot(value, root) {
  return value === root || value.startsWith(`${root}/`);
}

export function validateArchiveEntries(entries, expectedRoot) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Archive must contain entries');
  }
  if (!COMMIT_SHA.test(expectedRoot.slice(expectedRoot.lastIndexOf('-') + 1))) {
    throw new Error('Archive root must end with the immutable commit');
  }
  const seen = new Set();
  for (const entry of entries) {
    const entryPath = safeArchivePath(entry?.path, 'path');
    if (!isInsideArchiveRoot(entryPath, expectedRoot)) {
      throw new Error('Archive entry escaped the fixed root');
    }
    if (seen.has(entryPath)) throw new Error(`Duplicate archive path: ${entryPath}`);
    seen.add(entryPath);
    if (!['file', 'directory', 'symlink', 'hardlink'].includes(entry?.type)) {
      throw new Error(`Unsupported archive entry type: ${entry?.type}`);
    }
    if (entry.type === 'symlink') {
      const linkPath = safeArchivePath(entry.linkPath, 'symlink target', true);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entryPath), linkPath));
      if (!isInsideArchiveRoot(resolved, expectedRoot)) {
        throw new Error('Archive symlink escaped the fixed root');
      }
    }
    if (entry.type === 'hardlink') {
      const linkPath = safeArchivePath(entry.linkPath, 'hardlink target', true);
      const resolved = path.posix.normalize(linkPath);
      if (!isInsideArchiveRoot(resolved, expectedRoot)) {
        throw new Error('Archive hardlink escaped the fixed root');
      }
    }
  }
  return entries;
}

export function applyLocalSourceAdapter(input) {
  const bytes = Buffer.from(input);
  const originalSha256 = sha256(bytes);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Immutable adapter precondition failed: manifest is not JSON');
  }
  if (
    originalSha256 !== EXPECTED_MANIFEST_SHA256 ||
    manifest?.plugins?.length !== 1 ||
    manifest.plugins[0]?.name !== 'oh-my-cassette' ||
    JSON.stringify(manifest.plugins[0].source) !== JSON.stringify(EXPECTED_SOURCE)
  ) {
    throw new Error('Immutable adapter precondition failed');
  }
  const adapted = structuredClone(manifest);
  adapted.plugins[0].source = { source: 'local', path: './' };
  const adaptedBytes = Buffer.from(`${JSON.stringify(adapted, null, 2)}\n`);
  return {
    bytes: adaptedBytes,
    originalSha256,
    adaptedSha256: sha256(adaptedBytes)
  };
}

function assertFixedFixture(fixture) {
  const fixed = FIXED_FIXTURES.find(({ repository }) => repository === fixture?.repository);
  if (fixed === undefined || JSON.stringify(fixture) !== JSON.stringify(fixed)) {
    throw new Error('Archive request must use an exact fixed fixture definition');
  }
  return fixture;
}

export async function fetchPublicArchive(fixture, dependencies = {}) {
  assertFixedFixture(fixture);
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Public archive fetch is unavailable');
  const maxBytes = dependencies.maxBytes ?? DEFAULT_ARCHIVE_LIMIT;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Public archive size limit must be a positive integer');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Public archive timeout must be a positive integer');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  let response;
  try {
    response = await fetchImpl(fixture.archiveUrl, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: {
        accept: 'application/x-gzip, application/octet-stream',
        'user-agent': 'codex-plugin-check-public-fixture/0.1.0'
      },
      signal: controller.signal
    });
    if (!response?.ok || response.status !== 200) {
      throw new Error(`Public archive fetch failed with HTTP ${response?.status ?? 'unknown'}`);
    }
    if (response.url !== fixture.archiveUrl) {
      throw new Error('Public archive response URL did not match the exact codeload identity');
    }
    const contentLengthValue = response.headers?.get?.('content-length');
    if (contentLengthValue !== null && contentLengthValue !== undefined) {
      if (!/^\d+$/.test(contentLengthValue)) {
        throw new Error('Public archive returned an invalid Content-Length');
      }
      const contentLength = Number(contentLengthValue);
      if (!Number.isSafeInteger(contentLength) || contentLength > maxBytes) {
        throw new Error(`Public archive size exceeds ${maxBytes} bytes`);
      }
    }
    const reader = response.body?.getReader?.();
    if (reader === undefined) throw new Error('Public archive response body is not streamable');
    const chunks = [];
    let observedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      observedBytes += chunk.length;
      if (observedBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Public archive size exceeds ${maxBytes} bytes`);
      }
      chunks.push(chunk);
    }
    if (observedBytes === 0) throw new Error('Public archive response was empty');
    const bytes = Buffer.concat(chunks, observedBytes);
    return { bytes, archiveSha256: sha256(bytes) };
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(`Public archive fetch timed out after ${timeoutMs}ms`, { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

function tarString(field) {
  const zero = field.indexOf(0);
  const value = field.subarray(0, zero === -1 ? field.length : zero).toString('utf8');
  if (value.includes('\uFFFD')) throw new Error('Archive header contained invalid UTF-8');
  return value;
}

function tarNumber(field, label) {
  if ((field[0] & 0x80) !== 0) {
    throw new Error(`Archive ${label} uses unsupported base-256 encoding`);
  }
  const value = tarString(field).trim();
  if (value === '') return 0;
  if (!/^[0-7]+$/.test(value)) throw new Error(`Archive ${label} is not octal`);
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Archive ${label} is outside the safe integer range`);
  }
  return number;
}

function verifyTarChecksum(header) {
  const expected = tarNumber(header.subarray(148, 156), 'checksum');
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const observed = copy.reduce((sum, byte) => sum + byte, 0);
  if (observed !== expected) throw new Error('Archive header checksum did not match');
}

function parsePaxRecords(data) {
  const records = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) throw new Error('Archive PAX record is missing a length separator');
    const lengthText = data.subarray(offset, space).toString('ascii');
    if (!/^[1-9]\d*$/.test(lengthText)) throw new Error('Archive PAX record has invalid length');
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || offset + length > data.length) {
      throw new Error('Archive PAX record exceeds its payload');
    }
    const record = data.subarray(space + 1, offset + length);
    if (record.at(-1) !== 0x0a) throw new Error('Archive PAX record is not newline terminated');
    const content = record.subarray(0, -1).toString('utf8');
    if (content.includes('\uFFFD')) throw new Error('Archive PAX record contained invalid UTF-8');
    const equals = content.indexOf('=');
    if (equals <= 0) throw new Error('Archive PAX record is missing a key');
    const key = content.slice(0, equals);
    if (Object.hasOwn(records, key)) throw new Error(`Archive PAX key is duplicated: ${key}`);
    records[key] = content.slice(equals + 1);
    offset += length;
  }
  return records;
}

function paddedTarSize(size) {
  return Math.ceil(size / 512) * 512;
}

export function parseTarGzipArchive(archive, options) {
  const compressed = Buffer.from(archive);
  const maxUncompressedBytes = options.maxUncompressedBytes ?? DEFAULT_UNCOMPRESSED_LIMIT;
  if (!Number.isSafeInteger(maxUncompressedBytes) || maxUncompressedBytes <= 0) {
    throw new Error('Archive uncompressed size limit must be a positive integer');
  }
  let tar;
  try {
    tar = gunzipSync(compressed, { maxOutputLength: maxUncompressedBytes });
  } catch (cause) {
    throw new Error('Archive gzip payload is invalid or exceeds its size limit', { cause });
  }
  if (tar.length === 0 || tar.length > maxUncompressedBytes) {
    throw new Error('Archive uncompressed payload is empty or exceeds its size limit');
  }
  const entries = [];
  let offset = 0;
  let nextPax = null;
  let pendingLongName = null;
  let pendingLongLink = null;
  let sawTerminator = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      sawTerminator = true;
      break;
    }
    verifyTarChecksum(header);
    const headerSize = tarNumber(header.subarray(124, 136), 'size');
    if (offset + paddedTarSize(headerSize) > tar.length) {
      throw new Error('Archive entry payload exceeds the tar stream');
    }
    const headerData = Buffer.from(tar.subarray(offset, offset + headerSize));
    offset += paddedTarSize(headerSize);
    const typeFlag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    if (typeFlag === 'g') {
      const globalPax = parsePaxRecords(headerData);
      if (['path', 'linkpath', 'size'].some((key) => Object.hasOwn(globalPax, key))) {
        throw new Error('Archive global PAX metadata may not override paths or sizes');
      }
      continue;
    }
    if (typeFlag === 'x') {
      if (nextPax !== null) throw new Error('Archive contains stacked local PAX metadata');
      nextPax = parsePaxRecords(headerData);
      continue;
    }
    if (typeFlag === 'L' || typeFlag === 'K') {
      const value = tarString(headerData);
      if (value === '') throw new Error('Archive GNU long path metadata was empty');
      if (typeFlag === 'L') pendingLongName = value;
      else pendingLongLink = value;
      continue;
    }

    const prefix = tarString(header.subarray(345, 500));
    const name = tarString(header.subarray(0, 100));
    const headerPath = prefix === '' ? name : `${prefix}/${name}`;
    const entryPath = nextPax?.path ?? pendingLongName ?? headerPath;
    const linkPath = nextPax?.linkpath ?? pendingLongLink ?? tarString(header.subarray(157, 257));
    const effectiveSizeText = nextPax?.size;
    let effectiveSize = headerSize;
    if (effectiveSizeText !== undefined) {
      if (!/^\d+$/.test(effectiveSizeText)) throw new Error('Archive PAX size is invalid');
      effectiveSize = Number(effectiveSizeText);
      if (!Number.isSafeInteger(effectiveSize) || effectiveSize !== headerSize) {
        throw new Error('Archive PAX size disagrees with the bounded header payload');
      }
    }
    nextPax = null;
    pendingLongName = null;
    pendingLongLink = null;
    const type = typeFlag === '0'
      ? 'file'
      : typeFlag === '5'
        ? 'directory'
        : typeFlag === '2'
          ? 'symlink'
          : typeFlag === '1'
            ? 'hardlink'
            : null;
    if (type === null) throw new Error(`Unsupported archive entry type: ${typeFlag}`);
    if (type !== 'file' && effectiveSize !== 0) {
      throw new Error(`Archive ${type} entry unexpectedly contained data`);
    }
    entries.push({
      path: entryPath,
      type,
      linkPath: type === 'symlink' || type === 'hardlink' ? linkPath : undefined,
      mode: tarNumber(header.subarray(100, 108), 'mode'),
      data: type === 'file' ? headerData : undefined
    });
    if (entries.length > MAX_ARCHIVE_ENTRIES) {
      throw new Error(`Archive exceeds ${MAX_ARCHIVE_ENTRIES} entries`);
    }
  }
  if (!sawTerminator) throw new Error('Archive tar stream is missing its zero terminator');
  if (nextPax !== null || pendingLongName !== null || pendingLongLink !== null) {
    throw new Error('Archive ended with unapplied path metadata');
  }
  return validateArchiveEntries(entries, options.expectedRoot);
}

function archiveRelativePath(entryPath, expectedRoot) {
  const normalized = entryPath.endsWith('/') ? entryPath.slice(0, -1) : entryPath;
  return normalized === expectedRoot ? '' : normalized.slice(expectedRoot.length + 1);
}

async function makeSafeDirectory(root, relative) {
  if (relative === '') return;
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Archive directory path is not an owned directory: ${relative}`);
      }
    } catch (cause) {
      if (cause?.code !== 'ENOENT') throw cause;
      await mkdir(current, { mode: 0o700 });
    }
  }
}

export async function extractArchiveEntries(entries, destination, expectedRoot) {
  validateArchiveEntries(entries, expectedRoot);
  const destinationRoot = await realpath(path.resolve(destination));
  const checkoutRoot = path.join(destinationRoot, expectedRoot);
  try {
    await lstat(checkoutRoot);
    throw new Error('Archive checkout root must not already exist');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
  await mkdir(checkoutRoot, { mode: 0o700 });

  const directories = entries
    .filter(({ type }) => type === 'directory')
    .map(({ path: entryPath }) => archiveRelativePath(entryPath, expectedRoot))
    .filter((relative) => relative !== '')
    .sort((left, right) => left.split('/').length - right.split('/').length);
  for (const relative of directories) await makeSafeDirectory(checkoutRoot, relative);

  for (const entry of entries.filter(({ type }) => type === 'file')) {
    const relative = archiveRelativePath(entry.path, expectedRoot);
    if (relative === '') throw new Error('Archive root may not be a file');
    await makeSafeDirectory(checkoutRoot, path.posix.dirname(relative) === '.'
      ? ''
      : path.posix.dirname(relative));
    await writeFile(path.join(checkoutRoot, ...relative.split('/')), entry.data, {
      flag: 'wx',
      mode: 0o600
    });
  }

  for (const entry of entries.filter(({ type }) => type === 'hardlink')) {
    const relative = archiveRelativePath(entry.path, expectedRoot);
    const targetRelative = archiveRelativePath(entry.linkPath, expectedRoot);
    if (relative === '' || targetRelative === '') throw new Error('Archive hardlink path is invalid');
    await makeSafeDirectory(checkoutRoot, path.posix.dirname(relative) === '.'
      ? ''
      : path.posix.dirname(relative));
    const target = path.join(checkoutRoot, ...targetRelative.split('/'));
    const targetMetadata = await lstat(target);
    if (!targetMetadata.isFile() || targetMetadata.isSymbolicLink()) {
      throw new Error('Archive hardlink target must be an extracted regular file');
    }
    await link(target, path.join(checkoutRoot, ...relative.split('/')));
  }

  for (const entry of entries.filter(({ type }) => type === 'symlink')) {
    const relative = archiveRelativePath(entry.path, expectedRoot);
    if (relative === '') throw new Error('Archive root may not be a symlink');
    await makeSafeDirectory(checkoutRoot, path.posix.dirname(relative) === '.'
      ? ''
      : path.posix.dirname(relative));
    await symlink(entry.linkPath, path.join(checkoutRoot, ...relative.split('/')));
  }
  await auditExtractedSymlinks(checkoutRoot);
  return await realpath(checkoutRoot);
}

export async function auditExtractedSymlinks(checkoutRoot) {
  const canonicalRoot = await realpath(checkoutRoot);
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = relativeDirectory === ''
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await readlink(absolute);
        if (path.isAbsolute(target) || target.includes('\0') || target.includes('\\')) {
          throw new Error(`Extracted symlink escaped checkout: ${relative}`);
        }
        const resolved = path.resolve(path.dirname(absolute), target);
        if (!pathIsWithin(resolved, canonicalRoot)) {
          throw new Error(`Extracted symlink escaped checkout: ${relative}`);
        }
      } else if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (!entry.isFile()) {
        throw new Error(`Extracted archive contains unsupported filesystem entry: ${relative}`);
      }
    }
  }
  await visit(canonicalRoot);
}

async function hashDirectory(root) {
  const hash = createHash('sha256');
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => Buffer.compare(
      Buffer.from(left.name, 'utf8'),
      Buffer.from(right.name, 'utf8')
    ));
    for (const entry of entries) {
      const relative = relativeDirectory === ''
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relative}\0`);
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        hash.update(`file\0${relative}\0`);
        hash.update(await readFile(absolute));
        hash.update('\0');
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relative}\0${await readlink(absolute)}\0`);
      } else {
        throw new Error(`Cannot hash unsupported fixture entry: ${relative}`);
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

async function assertRegularFixtureFile(checkoutRoot, relative, label) {
  const absolute = path.resolve(checkoutRoot, ...relative.split('/'));
  if (!pathIsWithin(absolute, checkoutRoot) || absolute === checkoutRoot) {
    throw new Error(`${label} path escaped the fixture checkout`);
  }
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink`);
  }
  if (await realpath(absolute) !== absolute) {
    throw new Error(`${label} must not traverse a symlink`);
  }
  return absolute;
}

function parseManifestObject(bytes, label) {
  let parsed;
  try {
    parsed = JSON.parse(bytes);
  } catch (cause) {
    throw new Error(`${label} was not valid JSON`, { cause });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function localPluginSourcePath(source) {
  if (typeof source === 'string') return source;
  if (
    source !== null &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    source.source === 'local' &&
    typeof source.path === 'string'
  ) {
    return source.path;
  }
  throw new Error('Marketplace plugin source must be a fixed local path');
}

export async function validateStaticPluginContract(fixture, marketplaceRoot) {
  assertFixedFixture(fixture);
  const canonicalMarketplaceRoot = await realpath(marketplaceRoot);
  if (canonicalMarketplaceRoot !== path.resolve(marketplaceRoot)) {
    throw new Error('Marketplace root must not traverse a symlink');
  }
  const marketplaceManifestFile = await assertRegularFixtureFile(
    canonicalMarketplaceRoot,
    fixture.marketplaceManifestPath,
    'Marketplace manifest'
  );
  const marketplaceManifest = parseManifestObject(
    await readFile(marketplaceManifestFile, 'utf8'),
    'Marketplace manifest'
  );
  if (marketplaceManifest.name !== fixture.marketplace) {
    throw new Error('Marketplace manifest returned the wrong marketplace name');
  }
  if (!Array.isArray(marketplaceManifest.plugins)) {
    throw new Error('Marketplace manifest must contain a plugin list');
  }
  const pluginEntries = marketplaceManifest.plugins.filter(
    (entry) => entry !== null && typeof entry === 'object' && entry.name === fixture.plugin
  );
  if (pluginEntries.length !== 1) {
    throw new Error('Marketplace manifest must contain exactly one expected plugin entry');
  }
  const sourcePath = localPluginSourcePath(pluginEntries[0].source);
  if (
    sourcePath === '' ||
    path.isAbsolute(sourcePath) ||
    sourcePath.includes('\\') ||
    sourcePath.includes('\0')
  ) {
    throw new Error('Marketplace plugin source path must be a safe relative path');
  }
  const requestedPluginRoot = path.resolve(canonicalMarketplaceRoot, sourcePath);
  const expectedPluginRoot = path.resolve(
    canonicalMarketplaceRoot,
    ...fixture.pluginRoot.split('/')
  );
  if (
    requestedPluginRoot !== expectedPluginRoot ||
    !pathIsWithin(requestedPluginRoot, canonicalMarketplaceRoot)
  ) {
    throw new Error('Marketplace plugin source did not match the audited plugin root');
  }
  const canonicalPluginRoot = await realpath(requestedPluginRoot);
  const pluginRootMetadata = await lstat(canonicalPluginRoot);
  if (
    canonicalPluginRoot !== requestedPluginRoot ||
    !pluginRootMetadata.isDirectory() ||
    !pathIsWithin(canonicalPluginRoot, canonicalMarketplaceRoot)
  ) {
    throw new Error('Audited plugin root must be a real directory inside the marketplace');
  }
  const pluginManifestFile = await assertRegularFixtureFile(
    canonicalPluginRoot,
    fixture.pluginManifestPath,
    'Plugin manifest'
  );
  const pluginManifest = parseManifestObject(
    await readFile(pluginManifestFile, 'utf8'),
    'Plugin manifest'
  );
  if (pluginManifest.name !== fixture.plugin) {
    throw new Error('Plugin manifest returned the wrong plugin name');
  }
  if (pluginManifest.version !== fixture.pluginVersion) {
    throw new Error('Plugin manifest returned the wrong plugin version');
  }
  return {
    marketplaceManifestPath: fixture.marketplaceManifestPath,
    marketplace: fixture.marketplace,
    plugin: fixture.plugin,
    pluginRoot: fixture.pluginRoot,
    pluginManifestPath: fixture.pluginManifestPath,
    pluginVersion: fixture.pluginVersion
  };
}

export async function preparePublicFixture({ fixture, temporaryRoot }, dependencies = {}) {
  assertFixedFixture(fixture);
  const canonicalTemporaryRoot = await realpath(temporaryRoot);
  const fixtureStateRoot = path.join(canonicalTemporaryRoot, `fixture-${fixture.evidenceId}`);
  await mkdir(fixtureStateRoot, { mode: 0o700 });
  const fetchArchive = dependencies.fetchArchive ?? fetchPublicArchive;
  const fetched = await fetchArchive(fixture);
  if (!Buffer.isBuffer(fetched?.bytes)) throw new Error('Public archive fetch returned no bytes');
  const archiveSha256 = sha256(fetched.bytes);
  if (fetched.archiveSha256 !== archiveSha256) {
    throw new Error('Public archive SHA256 did not match its downloaded bytes');
  }
  const entries = parseTarGzipArchive(fetched.bytes, {
    expectedRoot: fixture.archiveRoot,
    maxUncompressedBytes: dependencies.maxUncompressedBytes ?? DEFAULT_UNCOMPRESSED_LIMIT
  });
  const checkoutRoot = await extractArchiveEntries(
    entries,
    fixtureStateRoot,
    fixture.archiveRoot
  );
  for (const licensePath of fixture.licensePaths) {
    const license = await assertRegularFixtureFile(checkoutRoot, licensePath, 'License or notice');
    if ((await readFile(license)).length === 0) {
      throw new Error(`License or notice file was empty: ${licensePath}`);
    }
  }
  const checkoutSha256 = await hashDirectory(checkoutRoot);
  let adapter = null;
  if (fixture.adapterId === 'local-source-v1') {
    const adapterPath = await assertRegularFixtureFile(
      checkoutRoot,
      fixture.adapterPath,
      'Adapter manifest'
    );
    const adapted = applyLocalSourceAdapter(await readFile(adapterPath));
    const temporaryAdapterPath = path.join(path.dirname(adapterPath), '.marketplace.adapter.tmp');
    await writeFile(temporaryAdapterPath, adapted.bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporaryAdapterPath, adapterPath);
    adapter = {
      id: fixture.adapterId,
      originalSha256: adapted.originalSha256,
      adaptedSha256: adapted.adaptedSha256
    };
  }
  const marketplaceRequest = path.resolve(checkoutRoot, ...fixture.marketplaceRoot.split('/'));
  if (!pathIsWithin(marketplaceRequest, checkoutRoot)) {
    throw new Error('Marketplace root escaped the fixture checkout');
  }
  const marketplaceRoot = await realpath(marketplaceRequest);
  const marketplaceMetadata = await lstat(marketplaceRoot);
  if (!marketplaceMetadata.isDirectory() || !pathIsWithin(marketplaceRoot, checkoutRoot)) {
    throw new Error('Marketplace root must be an owned fixture directory');
  }
  await auditExtractedSymlinks(checkoutRoot);
  const pluginContract = await validateStaticPluginContract(fixture, marketplaceRoot);
  return {
    archiveSha256,
    checkoutSha256,
    marketplaceSha256: await hashDirectory(marketplaceRoot),
    marketplaceRoot,
    adapter,
    pluginContract
  };
}

function allStringValues(value, values = []) {
  if (typeof value === 'string') {
    values.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) allStringValues(item, values);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) allStringValues(item, values);
  }
  return values;
}

export function validatePublicReceipt(receipt, options) {
  const { architecture, fixture, version } = options;
  const receiptCode = validateReceipt(receipt, {
    codexVersion: version,
    plugin: fixture.plugin,
    sourceRoot: '/workspace',
    platform: `linux-${architecture}`,
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });
  const expectedExitCode = options.expectedExitCode ?? 0;
  const expectedStatus = expectedExitCode === 0
    ? 'PASS'
    : expectedExitCode === 1
      ? 'FAIL'
      : null;
  if (expectedStatus === null || receiptCode !== expectedExitCode || receipt.status !== expectedStatus) {
    throw new Error(
      `Public fixture ${fixture.repository} receipt did not match expected ${expectedStatus ?? 'exit'}`
    );
  }
  if (receipt.plugin.marketplace !== fixture.marketplace) {
    throw new Error(`Public fixture ${fixture.repository} returned the wrong marketplace identity`);
  }
  const markers = options.personalMarkers ?? [];
  const values = allStringValues(receipt);
  for (const marker of markers) {
    if (typeof marker === 'string' && marker !== '' && values.some((value) => value.includes(marker))) {
      throw new Error(`Public fixture ${fixture.repository} receipt leaked a personal host path`);
    }
  }
  for (const value of values) {
    if (
      value !== '/workspace' &&
      (/^(?:\/Users\/|\/home\/)/.test(value) || /^[A-Za-z]:[\\/]/.test(value))
    ) {
      throw new Error(`Public fixture ${fixture.repository} receipt leaked an absolute host path`);
    }
  }
  const expectedCapabilities = new Map(
    fixture.expectedCapabilities.map((capability) => [
      `${capability.kind}\0${capability.key}`,
      capability
    ])
  );
  if (receipt.capabilities.length !== expectedCapabilities.size) {
    throw new Error(
      `Public fixture ${fixture.repository} returned the wrong capability count`
    );
  }
  const capabilityKeys = new Set();
  for (const capability of receipt.capabilities) {
    const identity = `${capability.kind}\0${capability.key}`;
    if (capabilityKeys.has(identity)) {
      throw new Error(`Public fixture ${fixture.repository} returned a duplicate capability`);
    }
    const expectedCapability = expectedCapabilities.get(identity);
    if (expectedCapability === undefined) {
      throw new Error(`Public fixture ${fixture.repository} returned an unexpected capability key`);
    }
    if (capability.source !== expectedCapability.source) {
      throw new Error(`Public fixture ${fixture.repository} returned the wrong capability source`);
    }
    capabilityKeys.add(identity);
    if (
      capability.kind === 'skill' &&
      !['DISCOVERED_EFFECTIVE', ...(expectedExitCode === 1 ? ['MISSING'] : [])]
        .includes(capability.status)
    ) {
      throw new Error(`Public fixture ${fixture.repository} skill was not effective`);
    }
    if (
      capability.kind === 'hook' &&
      ![
        'DISCOVERED_UNTRUSTED',
        'DISCOVERED_EFFECTIVE',
        ...(expectedExitCode === 1 ? ['MISSING'] : [])
      ].includes(capability.status)
    ) {
      throw new Error(`Public fixture ${fixture.repository} hook trust state was not observed`);
    }
    if (
      capability.kind === 'mcp' &&
      !['DECLARED_ONLY', ...(expectedExitCode === 1 ? ['MISSING'] : [])]
        .includes(capability.status)
    ) {
      throw new Error(`Public fixture ${fixture.repository} MCP capability made a runtime claim`);
    }
  }
  for (const identity of expectedCapabilities.keys()) {
    if (!capabilityKeys.has(identity)) {
      throw new Error(`Public fixture ${fixture.repository} is missing an expected capability`);
    }
  }
  return receipt;
}

export function validateRelativeEvidencePath(value) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value === '.' ||
    value === '..' ||
    path.isAbsolute(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new Error('Evidence output must use a relative evidence path filename');
  }
  return value;
}

function pathIsWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function createOwnedOutputRoot(requestedRoot, requestedBoundary) {
  const boundary = await realpath(path.resolve(requestedBoundary));
  const outputRequest = path.resolve(requestedRoot);
  const relative = path.relative(boundary, outputRequest);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Evidence output root must be inside its checkout boundary');
  }
  let current = boundary;
  const components = relative.split(path.sep);
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const isOutputRoot = index === components.length - 1;
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Evidence output parent must not be a symlink: ${current}`);
      }
      if (!metadata.isDirectory()) {
        throw new Error(`Evidence output parent must be a directory: ${current}`);
      }
      if (isOutputRoot) {
        throw new Error('Evidence output root must not already exist');
      }
    } catch (cause) {
      if (cause?.code !== 'ENOENT') throw cause;
      await mkdir(current, { mode: 0o700 });
    }
  }
  const outputRoot = await realpath(outputRequest);
  if (!pathIsWithin(outputRoot, boundary)) {
    throw new Error('Evidence output root escaped its checkout boundary');
  }
  return { boundary, outputRoot };
}

async function removeOwnedOutputRoot(outputRoot, boundary) {
  let canonical;
  try {
    canonical = await realpath(outputRoot);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return;
    throw cause;
  }
  if (canonical !== outputRoot || !pathIsWithin(canonical, boundary) || canonical === boundary) {
    throw new Error('Refusing to clean an unowned evidence output root');
  }
  await rm(canonical, { recursive: true, force: true });
}

export async function writeAtomicEvidenceJson(binding, filename, value, dependencies = {}) {
  validateRelativeEvidencePath(filename);
  await assertOwnedOutputRoot(binding.outputRoot, binding.boundary);
  const openFile = dependencies.open ?? open;
  const createLink = dependencies.link ?? link;
  const removeLink = dependencies.unlink ?? unlink;
  const identifier = randomUUID().replace(/[^A-Za-z0-9_-]/g, '');
  const temporary = path.join(binding.outputRoot, `.${filename}.${identifier}.tmp`);
  const destination = path.join(binding.outputRoot, filename);
  const flags = fsConstants.O_WRONLY |
    fsConstants.O_CREAT |
    fsConstants.O_EXCL |
    (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  let temporaryExists = false;
  try {
    handle = await openFile(temporary, flags, 0o600);
    temporaryExists = true;
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertOwnedOutputRoot(binding.outputRoot, binding.boundary);
    try {
      await createLink(temporary, destination);
    } catch (cause) {
      if (cause?.code === 'EEXIST') {
        throw new Error(`Fresh atomic evidence destination already exists: ${filename}`, {
          cause
        });
      }
      throw cause;
    }
    await removeLink(temporary);
    temporaryExists = false;
  } catch (cause) {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        // Preserve the primary evidence-delivery error.
      }
    }
    if (temporaryExists) {
      try {
        await removeLink(temporary);
      } catch {
        // Preserve the primary evidence-delivery error.
      }
    }
    throw cause;
  }
}

async function assertOwnedOutputRoot(outputRoot, boundary) {
  const metadata = await lstat(outputRoot);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error('Evidence output root must remain an owned directory, not a symlink');
  }
  const canonical = await realpath(outputRoot);
  if (canonical !== outputRoot || !pathIsWithin(canonical, boundary)) {
    throw new Error('Evidence output root escaped its checkout boundary');
  }
}

function boundedIoWriter(chunks, state) {
  return {
    write(value) {
      const chunk = Buffer.from(String(value));
      state.bytes += chunk.length;
      if (state.bytes > DOCKER_OUTPUT_LIMIT) {
        throw new Error(`Tool output exceeded ${DOCKER_OUTPUT_LIMIT} bytes`);
      }
      chunks.push(chunk);
    }
  };
}

export async function probePublicFixtureCell(options, dependencies = {}) {
  assertFixedFixture(options.fixture);
  if (!CODEX_VERSIONS.includes(options.version)) {
    throw new Error('Public fixture probe requires an exact fixed Codex version');
  }
  const temporaryRoot = await realpath(options.temporaryRoot);
  const marketplaceRoot = await realpath(options.marketplaceRoot);
  if (!pathIsWithin(marketplaceRoot, temporaryRoot)) {
    throw new Error('Public fixture probe marketplace escaped owned temporary state');
  }
  const stagedDirectory = path.join(temporaryRoot, 'staged-receipts');
  try {
    const metadata = await lstat(stagedDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('Staged receipt parent must be an owned directory, not a symlink');
    }
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    await mkdir(stagedDirectory, { mode: 0o700 });
  }
  const stagedPath = path.join(
    stagedDirectory,
    `${options.fixture.evidenceId}--codex-${options.version}.json`
  );
  try {
    await lstat(stagedPath);
    throw new Error('Public fixture staged receipt must be fresh and must not already exist');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }

  const stdout = [];
  const stderr = [];
  const stdoutState = { bytes: 0 };
  const stderrState = { bytes: 0 };
  const cliMain = dependencies.cliMain ?? cliMainReal;
  let invoked = false;
  try {
    invoked = true;
    const code = await cliMain([
      '--marketplace-root', marketplaceRoot,
      '--plugin', options.fixture.plugin,
      '--expected-plugin-root', options.fixture.pluginRoot,
      '--expected-plugin-version', options.fixture.pluginVersion,
      '--codex-version', options.version,
      '--cwd', marketplaceRoot,
      '--output', stagedPath,
      '--isolation', 'strict',
      '--quiet'
    ], {
      stdout: boundedIoWriter(stdout, stdoutState),
      stderr: boundedIoWriter(stderr, stderrState)
    });
    if (code !== 0 && code !== 1) {
      const detail = Buffer.concat(stderr).toString('utf8').trim();
      throw new Error(
        `Public fixture CLI returned unexpected code ${code}${detail ? `: ${detail}` : ''}`
      );
    }
    const metadata = await lstat(stagedPath);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > PROBE_RECEIPT_LIMIT) {
      throw new Error('Public fixture staged receipt was not a bounded regular file');
    }
    let receipt;
    try {
      receipt = JSON.parse(await readFile(stagedPath, 'utf8'));
    } catch (cause) {
      throw new Error('Public fixture staged receipt was not valid JSON', { cause });
    }
    validatePublicReceipt(receipt, {
      architecture: options.architecture,
      expectedExitCode: code,
      fixture: options.fixture,
      personalMarkers: options.personalMarkers,
      version: options.version
    });
    return { code, receipt };
  } finally {
    if (invoked) await rm(stagedPath, { force: true });
  }
}

export function inspectDockerReal(dependencies = {}) {
  return new Promise((resolve, reject) => {
    const spawnProcess = dependencies.spawnProcess ?? spawn;
    const timeoutMs = dependencies.timeoutMs ?? DOCKER_TIMEOUT_MS;
    const killGraceMs = dependencies.killGraceMs ?? 100;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      reject(new Error('Docker inspection timeout must be a positive integer'));
      return;
    }
    if (!Number.isSafeInteger(killGraceMs) || killGraceMs <= 0) {
      reject(new Error('Docker inspection kill grace must be a positive integer'));
      return;
    }
    const child = spawnProcess('docker', ['version', '--format', '{{.Server.Version}}'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let forcedError;
    let killTimer;
    let settled = false;
    const terminate = (cause) => {
      forcedError ??= cause;
      if (killTimer !== undefined) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
      killTimer.unref?.();
    };
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      stream.on('data', (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > DOCKER_OUTPUT_LIMIT) {
          terminate(new Error(`Docker output exceeded ${DOCKER_OUTPUT_LIMIT} bytes`));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
    }
    const timer = setTimeout(
      () => terminate(new Error(`Docker inspection timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    timer.unref?.();
    child.once('error', (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(cause);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (forcedError) {
        reject(forcedError);
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

export async function assertPublicFixtureRuntime(options, dependencies = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'linux') {
    throw new Error(`Strict public fixture matrix requires Linux, observed ${platform}`);
  }
  const inspectDocker = dependencies.inspectDocker ?? inspectDockerReal;
  let result;
  try {
    result = await inspectDocker();
  } catch (cause) {
    throw new Error(`Strict public fixture matrix requires Docker: ${cause.message}`, { cause });
  }
  if (result?.code !== 0 || String(result?.stdout ?? '').trim() === '') {
    const detail = String(result?.stderr ?? '').trim();
    throw new Error(`Strict public fixture matrix requires Docker${detail ? `: ${detail}` : ''}`);
  }
}

function sanitizeReceipt(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    status: receipt.status,
    codexVersion: receipt.codexVersion,
    platform: receipt.platform,
    plugin: {
      name: receipt.plugin.name,
      marketplace: receipt.plugin.marketplace,
      sourceRoot: receipt.plugin.sourceRoot
    },
    capabilities: receipt.capabilities.map(({ kind, key, source, status }) => ({
      kind,
      key,
      source,
      status
    })),
    isolation: {
      mode: receipt.isolation.mode,
      network: receipt.isolation.network,
      hostState: receipt.isolation.hostState
    }
  };
}

function validatePreparedFixture(prepared, fixture, temporaryRoot) {
  for (const field of ['archiveSha256', 'checkoutSha256', 'marketplaceSha256']) {
    if (!SHA256.test(prepared?.[field] ?? '')) {
      throw new Error(`Prepared public fixture is missing ${field}`);
    }
  }
  if (prepared.checkoutSha256 !== fixture.expectedCheckoutSha256) {
    throw new Error('Prepared public fixture checkout hash did not match the audited tree');
  }
  if (prepared.marketplaceSha256 !== fixture.expectedMarketplaceSha256) {
    throw new Error('Prepared public fixture marketplace hash did not match the audited tree');
  }
  if (fixture.adapterId === 'none') {
    if (prepared.adapter !== null) throw new Error('DIRECT fixture must not record an adapter');
  } else if (
    prepared.adapter?.id !== 'local-source-v1' ||
    !SHA256.test(prepared.adapter.originalSha256 ?? '') ||
    !SHA256.test(prepared.adapter.adaptedSha256 ?? '')
  ) {
    throw new Error('STATIC_ADAPTER fixture must record exact adapter hashes');
  }
  if (!pathIsWithin(prepared.marketplaceRoot, temporaryRoot)) {
    throw new Error('Prepared marketplace root escaped owned temporary state');
  }
  const expectedContract = {
    marketplaceManifestPath: fixture.marketplaceManifestPath,
    marketplace: fixture.marketplace,
    plugin: fixture.plugin,
    pluginRoot: fixture.pluginRoot,
    pluginManifestPath: fixture.pluginManifestPath,
    pluginVersion: fixture.pluginVersion
  };
  if (
    prepared.pluginContract === null ||
    typeof prepared.pluginContract !== 'object' ||
    Array.isArray(prepared.pluginContract) ||
    Object.keys(prepared.pluginContract).length !== Object.keys(expectedContract).length ||
    Object.entries(expectedContract).some(
      ([key, value]) => prepared.pluginContract[key] !== value
    )
  ) {
    throw new Error('Prepared public fixture plugin contract did not match the audited identity');
  }
  return prepared;
}

function summaryFixture(fixture, prepared, receipts) {
  return {
    evidenceId: fixture.evidenceId,
    repository: fixture.repository,
    repositoryUrl: fixture.repositoryUrl,
    commit: fixture.commit,
    classification: fixture.classification,
    adapterId: fixture.adapterId,
    marketplaceRoot: fixture.marketplaceRoot,
    marketplaceManifestPath: fixture.marketplaceManifestPath,
    plugin: fixture.plugin,
    pluginRoot: fixture.pluginRoot,
    pluginManifestPath: fixture.pluginManifestPath,
    pluginVersion: fixture.pluginVersion,
    marketplace: fixture.marketplace,
    license: fixture.license,
    licensePaths: [...fixture.licensePaths],
    expectedKinds: [...fixture.expectedKinds],
    expectedCapabilities: fixture.expectedCapabilities.map(({ kind, key, source }) => ({
      kind,
      key,
      source
    })),
    archiveUrl: fixture.archiveUrl,
    archiveSha256: prepared.archiveSha256,
    checkoutSha256: prepared.checkoutSha256,
    marketplaceSha256: prepared.marketplaceSha256,
    adapter: prepared.adapter,
    receipts
  };
}

export async function runPublicFixtureMatrix(options, dependencies = {}) {
  const fixtures = validateFixtureDefinitions(options.fixtures ?? PUBLIC_FIXTURES);
  const versions = options.versions ?? CODEX_VERSIONS;
  if (JSON.stringify(versions) !== JSON.stringify(CODEX_VERSIONS)) {
    throw new Error('Public fixture matrix requires the fixed Codex versions');
  }
  const assertRuntime = dependencies.assertRuntime ?? assertPublicFixtureRuntime;
  const makeTemporaryRoot = dependencies.makeTemporaryRoot ?? makeTemporaryRootReal;
  const prepareFixture = dependencies.prepareFixture ?? preparePublicFixture;
  const probeCell = dependencies.probeCell ?? probePublicFixtureCell;
  const removeTemporaryRoot = dependencies.removeTemporaryRoot ?? removeTemporaryRootReal;

  let ownedOutput;
  let temporaryRoot;
  let primaryError;
  try {
    await assertRuntime({ platform: options.platform });
    ownedOutput = await createOwnedOutputRoot(options.outputRoot, options.outputBoundary);
    temporaryRoot = await realpath(await makeTemporaryRoot());
    const fixturesSummary = [];
    let passedCells = 0;
    let failedCells = 0;
    for (const fixture of fixtures) {
      const prepared = validatePreparedFixture(
        await prepareFixture({ fixture, temporaryRoot }),
        fixture,
        temporaryRoot
      );
      const receipts = [];
      for (const version of versions) {
        const evidencePath = `${fixture.evidenceId}--codex-${version}.json`;
        const staged = await probeCell({
          architecture: options.architecture,
          fixture,
          marketplaceRoot: prepared.marketplaceRoot,
          personalMarkers: options.personalMarkers,
          temporaryRoot,
          version
        });
        if (staged?.code !== 0 && staged?.code !== 1) {
          throw new Error(
            `Unexpected public fixture tool exit code ${staged?.code}${
              staged?.stderr ? `: ${String(staged.stderr).trim()}` : ''
            }`
          );
        }
        const receipt = sanitizeReceipt(validatePublicReceipt(staged.receipt, {
          architecture: options.architecture,
          expectedExitCode: staged.code,
          fixture,
          personalMarkers: options.personalMarkers,
          version
        }));
        await assertOwnedOutputRoot(ownedOutput.outputRoot, ownedOutput.boundary);
        await writeAtomicEvidenceJson(ownedOutput, evidencePath, receipt);
        const outcome = staged.code === 0 ? 'PASS' : 'FAIL';
        if (outcome === 'PASS') passedCells += 1;
        else failedCells += 1;
        receipts.push({ version, receiptPath: evidencePath, outcome });
      }
      fixturesSummary.push(summaryFixture(fixture, prepared, receipts));
    }
    await removeTemporaryRoot(temporaryRoot);
    temporaryRoot = undefined;
    const summary = {
      schemaVersion: '0.1.0',
      status: failedCells === 0 ? 'PASS' : 'HOLD',
      outputRoot: '.',
      platform: `linux-${options.architecture}`,
      provenance: options.provenance ?? null,
      versions: [...versions],
      gate: {
        observed: fixtures.length,
        required: 10,
        cells: fixtures.length * versions.length,
        passedCells,
        failedCells
      },
      fixtures: fixturesSummary
    };
    await assertOwnedOutputRoot(ownedOutput.outputRoot, ownedOutput.boundary);
    await writeAtomicEvidenceJson(ownedOutput, 'public-fixture-summary.json', summary);
    return summary;
  } catch (cause) {
    primaryError = cause;
  }

  if (temporaryRoot !== undefined) {
    try {
      await removeTemporaryRoot(temporaryRoot);
    } catch (cause) {
      primaryError = new AggregateError([primaryError, cause], 'Public fixture cleanup failed');
    }
  }
  if (ownedOutput !== undefined) {
    try {
      await removeOwnedOutputRoot(ownedOutput.outputRoot, ownedOutput.boundary);
    } catch (cause) {
      primaryError = new AggregateError([primaryError, cause], 'Evidence cleanup failed');
    }
  }
  throw primaryError;
}

async function makeTemporaryRootReal() {
  const temporaryDirectory = await realpath(os.tmpdir());
  return await realpath(await mkdtemp(path.join(
    temporaryDirectory,
    'codex-plugin-public-fixtures-'
  )));
}

async function removeTemporaryRootReal(root) {
  const temporaryDirectory = await realpath(os.tmpdir());
  const canonical = await realpath(root);
  if (
    path.dirname(canonical) !== temporaryDirectory ||
    !path.basename(canonical).startsWith('codex-plugin-public-fixtures-')
  ) {
    throw new Error(`Refusing to clean unowned public fixture state: ${canonical}`);
  }
  await rm(canonical, { recursive: true, force: true });
}

export async function publicFixtureMain(io = {}, dependencies = {}) {
  try {
    const options = publicFixtureOptionsFromEnvironment(
      io.env ?? process.env,
      io.cwd ?? process.cwd()
    );
    const runMatrix = dependencies.runMatrix ?? runPublicFixtureMatrix;
    const summary = await runMatrix(options);
    if (summary?.status === 'PASS') return 0;
    if (summary?.status === 'HOLD') return 1;
    throw new Error('Public fixture matrix returned an invalid summary status');
  } catch (cause) {
    const stderr = io.stderr ?? process.stderr;
    stderr?.write?.(`Error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 2;
  }
}

function isEntrypoint() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  process.exitCode = await publicFixtureMain();
}
