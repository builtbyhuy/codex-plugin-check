import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  applyLocalSourceAdapter,
  assertPublicFixtureRuntime,
  auditExtractedSymlinks,
  CODEX_VERSIONS,
  extractArchiveEntries,
  fetchPublicArchive,
  inspectDockerReal,
  parseTarGzipArchive,
  preparePublicFixture,
  probePublicFixtureCell,
  publicFixtureMain,
  PUBLIC_FIXTURES,
  publicFixtureOptionsFromEnvironment,
  runPublicFixtureMatrix,
  validateArchiveEntries,
  validateFixtureDefinitions,
  validatePublicReceipt,
  validateRelativeEvidencePath,
  validateStaticPluginContract,
  writeAtomicEvidenceJson
} from '../scripts/falsify-public-fixtures.mjs';

const FIXED_IDENTITIES = [
  ['bitrouter/bitrouter', '678384888b73fc290ce4ce503a8a7f2a5cbf6da8', 'DIRECT', 'none'],
  ['Cassette-Editor/oh-my-cassette', 'cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32', 'STATIC_ADAPTER', 'local-source-v1'],
  ['mostlyharmless-ai/watercooler', 'a5efa89df02e7796e20881fef4847f129d84d367', 'DIRECT', 'none'],
  ['commercetools/commercetools-ai-plugins', '440d6bd56eb2969b6a0dd41e3fcff286def0787c', 'DIRECT', 'none'],
  ['agentis-tools/ctx', '1782436e0ebf8d95ef4c086d94351698c464c4ee', 'DIRECT', 'none'],
  ['agentmail-to/agentmail-plugins', '134887caf9375229415e09c760ae31baa4cc1ec3', 'DIRECT', 'none'],
  ['ujjwalredd/sarathi', '08a51154a2f30af3eb4f6acb11115b9db912c5f8', 'DIRECT', 'none'],
  ['sofus-nl/cc-plugin-codex', 'cc5123f7fa18db9c38f838a9b70119e5a0a6847c', 'DIRECT', 'none'],
  ['RMI/speedy-skills', 'e983f800056a12b63fd60d5148538f98aaafe643', 'DIRECT', 'none'],
  ['roadrunner-tuff/roadrunner-admin-plugin', '8e130c07656c8f9db8bf5431332c9aed60a4b133', 'DIRECT', 'none']
];

const OH_MY_CASSETTE_MARKETPLACE = `{
  "name": "cassette-editor",
  "interface": {
    "displayName": "Cassette Editor"
  },
  "plugins": [
    {
      "name": "oh-my-cassette",
      "source": {
        "source": "url",
        "url": "https://github.com/Cassette-Editor/oh-my-cassette.git",
        "ref": "release"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_USE"
      },
      "category": "Productivity"
    }
  ]
}
`;

const FIXED_DETAILS = [
  ['bitrouter', '.', 'bitrouter', 'bitrouter', ['LICENSE'], ['skill', 'mcp']],
  ['oh-my-cassette', '.', 'oh-my-cassette', 'cassette-editor', ['LICENSE'], ['skill', 'mcp']],
  ['watercooler', '.', 'watercooler', 'watercooler', ['LICENSE'], ['skill', 'mcp']],
  ['commercetools', '.', 'commercetools', 'commercetools', ['LICENSE'], ['skill', 'mcp']],
  ['ctx', 'plugins/codex/ctx', 'ctx', 'ctx-local', ['LICENSE-APACHE', 'LICENSE-MIT'], ['skill', 'hook']],
  ['agentmail', '.', 'agentmail', 'agentmail', ['LICENSE'], ['skill', 'mcp']],
  ['sarathi', '.', 'sarathi', 'sarathi', ['LICENSE'], ['skill']],
  [
    'cc-plugin-codex',
    '.',
    'cc-plugin-codex',
    'cc-plugin-codex',
    ['LICENSE', 'plugins/cc-plugin-codex/LICENSE', 'plugins/cc-plugin-codex/NOTICE'],
    ['skill', 'hook']
  ],
  ['speedy-skills', '.', 'example-minimal', 'speedy-skills', ['LICENSE'], ['skill']],
  ['roadrunner-admin', '.', 'roadrunner-admin', 'roadrunner', ['LICENSE'], ['skill', 'mcp']]
];

const FIXED_PLUGIN_CONTRACTS = [
  [
    'bitrouter', '.agents/plugins/marketplace.json', '.', '.codex-plugin/plugin.json', '0.1.0',
    'ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9',
    'ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9',
    [
      ['mcp', 'bitrouter', 'plugin/read'],
      ['skill', 'bitrouter:bitrouter', 'plugin/read + skills/list']
    ]
  ],
  [
    'oh-my-cassette', '.agents/plugins/marketplace.json', '.', '.codex-plugin/plugin.json', '0.4.14',
    '9dffb7f24db16606eeb44f7a23746073716069e63e4cf58a07631c02e1f57177',
    '32c159545ca3626c13dfae8f1c833e456584df10c204060539475fd6c301b8e8',
    [
      ['mcp', 'cassette', 'plugin/read'],
      ['skill', 'oh-my-cassette:cassette-model', 'plugin/read + skills/list'],
      ['skill', 'oh-my-cassette:cassette-video-edit', 'plugin/read + skills/list']
    ]
  ],
  [
    'watercooler', '.agents/plugins/marketplace.json', 'plugins/codex/watercooler',
    '.codex-plugin/plugin.json', '0.5.6',
    'ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19',
    'ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19',
    [
      ['mcp', 'watercooler', 'plugin/read'],
      ['skill', 'watercooler:find-related', 'plugin/read + skills/list'],
      ['skill', 'watercooler:recall', 'plugin/read + skills/list'],
      ['skill', 'watercooler:search-threads', 'plugin/read + skills/list'],
      ['skill', 'watercooler:threads', 'plugin/read + skills/list'],
      ['skill', 'watercooler:update-agent-context', 'plugin/read + skills/list'],
      ['skill', 'watercooler:watercooler-health', 'plugin/read + skills/list'],
      ['skill', 'watercooler:watercooler-onboarding', 'plugin/read + skills/list']
    ]
  ],
  [
    'commercetools', '.agents/plugins/marketplace.json', '.agents/plugins/commercetools',
    '.codex-plugin/plugin.json', '0.14.0',
    '749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0',
    '749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0',
    [
      ['mcp', 'commerce-mcp', 'plugin/read'],
      ['mcp', 'commercetools-knowledge', 'plugin/read'],
      ['skill', 'commercetools:commercetools-checkout', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-commerce-patterns', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-connect', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-platform', 'plugin/read + skills/list'],
      ['skill', 'commercetools:commercetools-storefront', 'plugin/read + skills/list']
    ]
  ],
  [
    'ctx', '.agents/plugins/marketplace.json', '.', '.codex-plugin/plugin.json', '0.4.0',
    '7f6934a57be05a126b968a5c5d346fb9d3150bdb6a57e199d2274204c94337eb',
    '7b3212dbd512ee0bbf7f8c3c2b69c86bdba41ed55f9f71e5f69e63dc0cce49f7',
    [
      ['hook', 'ctx@ctx-local:hooks/hooks.json:post_tool_use:0:0', 'plugin/read + hooks/list'],
      ['hook', 'ctx@ctx-local:hooks/hooks.json:session_start:0:0', 'plugin/read + hooks/list'],
      ['hook', 'ctx@ctx-local:hooks/hooks.json:stop:0:0', 'plugin/read + hooks/list'],
      ['skill', 'ctx:ctx', 'plugin/read + skills/list']
    ]
  ],
  [
    'agentmail', '.agents/plugins/marketplace.json', '.', '.codex-plugin/plugin.json', '0.3.0',
    '97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669',
    '97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669',
    [
      ['mcp', 'agentmail', 'plugin/read'],
      ['skill', 'agentmail:agent-email-patterns', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-cli', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-mcp', 'plugin/read + skills/list'],
      ['skill', 'agentmail:agentmail-toolkit', 'plugin/read + skills/list'],
      ['skill', 'agentmail:check-email', 'plugin/read + skills/list'],
      ['skill', 'agentmail:manage-inboxes', 'plugin/read + skills/list'],
      ['skill', 'agentmail:send-email', 'plugin/read + skills/list']
    ]
  ],
  [
    'sarathi', '.agents/plugins/marketplace.json', '.', '.codex-plugin/plugin.json', '0.6.0',
    'da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599',
    'da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599',
    [['skill', 'sarathi:sarathi', 'plugin/read + skills/list']]
  ],
  [
    'cc-plugin-codex', '.agents/plugins/marketplace.json', 'plugins/cc-plugin-codex',
    '.codex-plugin/plugin.json', '0.1.1',
    '1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed',
    '1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed',
    [
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
    ]
  ],
  [
    'speedy-skills', '.claude-plugin/marketplace.json', 'plugins/example-minimal',
    '.claude-plugin/plugin.json', '0.1.0',
    'd39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2',
    'd39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2',
    [['skill', 'example-minimal:summarizing-git-log', 'plugin/read + skills/list']]
  ],
  [
    'roadrunner-admin', '.agents/plugins/marketplace.json', 'plugins/roadrunner-admin',
    '.codex-plugin/plugin.json', '0.1.0',
    '33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1',
    '33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1',
    [
      ['mcp', 'roadrunner-admin', 'plugin/read'],
      ['skill', 'roadrunner-admin:roadrunner-admin', 'plugin/read + skills/list']
    ]
  ]
];

async function temporaryDirectory(t, prefix) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function publicReceipt(fixture, version, overrides = {}) {
  return {
    schemaVersion: '0.1.0',
    status: 'PASS',
    codexVersion: version,
    platform: 'linux-x64',
    plugin: {
      name: fixture.plugin,
      marketplace: fixture.marketplace,
      sourceRoot: '/workspace'
    },
    capabilities: fixture.expectedCapabilities.map(({ kind, key, source }) => ({
      kind,
      key,
      source,
      status: kind === 'skill'
        ? 'DISCOVERED_EFFECTIVE'
        : kind === 'hook'
          ? 'DISCOVERED_UNTRUSTED'
          : 'DECLARED_ONLY'
    })),
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' },
    ...overrides
  };
}

async function preparedFixtureStub(fixture, temporaryRoot) {
  const marketplaceRoot = path.join(temporaryRoot, fixture.evidenceId);
  await mkdir(marketplaceRoot);
  return {
    archiveSha256: 'a'.repeat(64),
    checkoutSha256: fixture.expectedCheckoutSha256,
    marketplaceSha256: fixture.expectedMarketplaceSha256,
    marketplaceRoot,
    adapter: fixture.adapterId === 'none'
      ? null
      : {
          id: 'local-source-v1',
          originalSha256: 'd'.repeat(64),
          adaptedSha256: 'e'.repeat(64)
        },
    pluginContract: {
      marketplaceManifestPath: fixture.marketplaceManifestPath,
      marketplace: fixture.marketplace,
      plugin: fixture.plugin,
      pluginRoot: fixture.pluginRoot,
      pluginManifestPath: fixture.pluginManifestPath,
      pluginVersion: fixture.pluginVersion
    }
  };
}

function writeTarString(header, offset, length, value) {
  Buffer.from(value).copy(header, offset, 0, length);
}

function tarArchive(entries) {
  const chunks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '');
    const header = Buffer.alloc(512);
    writeTarString(header, 0, 100, entry.path);
    writeTarString(header, 100, 8, `${(entry.mode ?? 0o644).toString(8).padStart(7, '0')}\0`);
    writeTarString(header, 108, 8, '0000000\0');
    writeTarString(header, 116, 8, '0000000\0');
    writeTarString(header, 124, 12, `${data.length.toString(8).padStart(11, '0')}\0`);
    writeTarString(header, 136, 12, '00000000000\0');
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? '0').charCodeAt(0);
    if (entry.linkPath) writeTarString(header, 157, 100, entry.linkPath);
    writeTarString(header, 257, 6, 'ustar\0');
    writeTarString(header, 263, 2, '00');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
    chunks.push(header, data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

function paxRecord(key, value) {
  let length = Buffer.byteLength(` ${key}=${value}\n`) + 1;
  while (true) {
    const record = `${length} ${key}=${value}\n`;
    const observed = Buffer.byteLength(record);
    if (observed === length) return record;
    length = observed;
  }
}

test('registry binds exactly the ten audited commits and only one static adapter', () => {
  assert.deepEqual(CODEX_VERSIONS, ['0.147.0', '0.146.1']);
  assert.deepEqual(
    PUBLIC_FIXTURES.map(({ repository, commit, classification, adapterId }) => [
      repository,
      commit,
      classification,
      adapterId
    ]),
    FIXED_IDENTITIES
  );
  assert.equal(validateFixtureDefinitions(PUBLIC_FIXTURES), PUBLIC_FIXTURES);
  assert.deepEqual(
    PUBLIC_FIXTURES.map(({
      evidenceId,
      marketplaceRoot,
      plugin,
      marketplace,
      licensePaths,
      expectedKinds
    }) => [evidenceId, marketplaceRoot, plugin, marketplace, licensePaths, expectedKinds]),
    FIXED_DETAILS
  );
  assert.deepEqual(
    PUBLIC_FIXTURES.map((fixture) => [
      fixture.evidenceId,
      fixture.marketplaceManifestPath,
      fixture.pluginRoot,
      fixture.pluginManifestPath,
      fixture.pluginVersion,
      fixture.expectedCheckoutSha256,
      fixture.expectedMarketplaceSha256,
      fixture.expectedCapabilities.map(({ kind, key, source }) => [kind, key, source])
    ]),
    FIXED_PLUGIN_CONTRACTS
  );
  for (const fixture of PUBLIC_FIXTURES) {
    assert.equal(fixture.repositoryUrl, `https://github.com/${fixture.repository}`);
    assert.equal(
      fixture.archiveUrl,
      `https://codeload.github.com/${fixture.repository}/tar.gz/${fixture.commit}`
    );
    assert.match(fixture.archiveRoot, new RegExp(`-${fixture.commit}$`));
  }

  const changedCommit = structuredClone(PUBLIC_FIXTURES);
  changedCommit[0].commit = '1111111111111111111111111111111111111111';
  assert.throws(() => validateFixtureDefinitions(changedCommit), /fixed fixture definition/i);

  const duplicate = structuredClone(PUBLIC_FIXTURES);
  duplicate[9] = structuredClone(duplicate[0]);
  assert.throws(() => validateFixtureDefinitions(duplicate), /fixed fixture definition|duplicate/i);

  const extraAdapter = structuredClone(PUBLIC_FIXTURES);
  extraAdapter[0].adapterId = 'local-source-v1';
  assert.throws(() => validateFixtureDefinitions(extraAdapter), /fixed fixture definition|adapter/i);
});

test('environment accepts only exact released versions and a checkout-relative output root', () => {
  const env = {
    CODEX_CURRENT_VERSION: '0.147.0',
    CODEX_PRIOR_VERSION: '0.146.1',
    CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT: 'artifacts/public-fixtures'
  };
  assert.deepEqual(publicFixtureOptionsFromEnvironment(env, '/checkout'), {
    architecture: process.arch,
    outputBoundary: '/checkout',
    outputRoot: '/checkout/artifacts/public-fixtures',
    platform: process.platform,
    provenance: null
  });

  const github = {
    ...env,
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'builtbyhuy/codex-plugin-check',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_RUN_ID: '31379758041',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_SHA: 'a'.repeat(40)
  };
  assert.deepEqual(publicFixtureOptionsFromEnvironment(github, '/checkout').provenance, {
    provider: 'github-actions',
    repository: 'builtbyhuy/codex-plugin-check',
    commit: 'a'.repeat(40),
    ref: 'refs/heads/main',
    event: 'push',
    runId: '31379758041',
    runAttempt: '2',
    runUrl: 'https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31379758041',
    artifactName: 'public-fixture-evidence-31379758041-2'
  });

  for (const invalid of [
    { ...env, CODEX_CURRENT_VERSION: 'latest' },
    { ...env, CODEX_PRIOR_VERSION: '0.146.0' },
    { ...env, CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT: '/tmp/evidence' },
    { ...env, CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT: '../evidence' },
    { ...env, CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT: 'artifacts/../../evidence' },
    { ...github, GITHUB_REF: 'refs/heads/feature' },
    { ...github, GITHUB_RUN_ID: 'not-a-run' },
    { ...github, GITHUB_SHA: 'short' },
    { ...github, GITHUB_ACTIONS: undefined }
  ]) {
    assert.throws(
      () => publicFixtureOptionsFromEnvironment(invalid, '/checkout'),
      /0\.147\.0|0\.146\.1|relative evidence directory|GitHub.*provenance/i
    );
  }
});

test('archive entries must remain under one exact root and links may not escape it', () => {
  const root = 'bitrouter-678384888b73fc290ce4ce503a8a7f2a5cbf6da8';
  const safe = [
    { path: `${root}/`, type: 'directory' },
    { path: `${root}/LICENSE`, type: 'file' },
    { path: `${root}/skills/current`, type: 'symlink', linkPath: '../LICENSE' }
  ];
  assert.equal(validateArchiveEntries(safe, root), safe);

  for (const entries of [
    [{ path: `${root}/../escape`, type: 'file' }],
    [{ path: `/absolute`, type: 'file' }],
    [{ path: `${root}/safe\\..\\escape`, type: 'file' }],
    [{ path: `other-root/LICENSE`, type: 'file' }],
    [{ path: `${root}/skills/current`, type: 'symlink', linkPath: '../../../escape' }],
    [{ path: `${root}/hard`, type: 'hardlink', linkPath: '../escape' }]
  ]) {
    assert.throws(() => validateArchiveEntries(entries, root), /archive|escape|root|path/i);
  }
});

test('local-source-v1 changes only plugins/0/source after the immutable precondition', () => {
  const adapted = applyLocalSourceAdapter(Buffer.from(OH_MY_CASSETTE_MARKETPLACE));
  assert.equal(adapted.originalSha256, 'd5c629f3a3b8dd2cdf560963c26b1c5e9dc062045fef13cafca178e7b1bd3d3f');
  assert.equal(adapted.adaptedSha256, 'bbecf8a43d3e993b8506f497a416a0cd83e535a18f3f647e79d6d2458fd6c7b1');
  const parsed = JSON.parse(adapted.bytes);
  assert.deepEqual(parsed.plugins[0].source, { source: 'local', path: './' });
  const restored = structuredClone(parsed);
  restored.plugins[0].source = {
    source: 'url',
    url: 'https://github.com/Cassette-Editor/oh-my-cassette.git',
    ref: 'release'
  };
  assert.deepEqual(restored, JSON.parse(OH_MY_CASSETTE_MARKETPLACE));
  assert.equal(createHash('sha256').update(adapted.bytes).digest('hex'), adapted.adaptedSha256);

  for (const invalid of [
    OH_MY_CASSETTE_MARKETPLACE.replace('"ref": "release"', '"ref": "main"'),
    OH_MY_CASSETTE_MARKETPLACE.replace('"name": "oh-my-cassette"', '"name": "other"'),
    JSON.stringify({ plugins: [] })
  ]) {
    assert.throws(() => applyLocalSourceAdapter(Buffer.from(invalid)), /precondition|immutable/i);
  }
});

test('receipt validator binds strict identity and audited capability semantics', () => {
  const fixture = PUBLIC_FIXTURES[0];
  const base = publicReceipt(fixture, '0.147.0');
  assert.deepEqual(
    validatePublicReceipt(base, { fixture, version: '0.147.0', architecture: 'x64' }),
    base
  );

  const cases = [
    { ...base, status: 'FAIL' },
    { ...base, codexVersion: '0.146.1' },
    { ...base, platform: 'linux-arm64' },
    { ...base, plugin: { ...base.plugin, name: 'other' } },
    { ...base, plugin: { ...base.plugin, marketplace: 'other' } },
    { ...base, plugin: { ...base.plugin, sourceRoot: '/tmp/fixture' } },
    { ...base, isolation: { mode: 'env', network: 'not_enforced', hostState: 'not_enforced' } },
    { ...base, capabilities: base.capabilities.filter(({ kind }) => kind !== 'skill') },
    {
      ...base,
      capabilities: base.capabilities.map((capability) => capability.kind === 'mcp'
        ? { ...capability, status: 'DISCOVERED_EFFECTIVE' }
        : capability)
    },
    {
      ...base,
      capabilities: [
        ...base.capabilities,
        { kind: 'app', key: 'unexpected', source: 'plugin/read', status: 'DECLARED_ONLY' }
      ]
    }
  ];
  for (const receipt of cases) {
    assert.throws(
      () => validatePublicReceipt(receipt, {
        fixture,
        version: '0.147.0',
        architecture: 'x64'
      }),
      /receipt|pass|identity|capability|strict|platform/i
    );
  }
  assert.throws(
    () => validatePublicReceipt({
      ...base,
      capabilities: base.capabilities.map((capability, index) => index === 0
        ? { ...capability, key: '/Users/alice/private' }
        : capability)
    }, {
      fixture,
      version: '0.147.0',
      architecture: 'x64',
      personalMarkers: ['/Users/alice']
    }),
    /personal|privacy|host path/i
  );

  const many = PUBLIC_FIXTURES.find(({ evidenceId }) => evidenceId === 'watercooler');
  const complete = publicReceipt(many, '0.147.0');
  for (const capabilities of [
    complete.capabilities.filter((_, index) => index !== 2),
    complete.capabilities.map((capability, index) => index === 0
      ? { ...capability, key: 'wrong-key' }
      : capability),
    complete.capabilities.map((capability, index) => index === 0
      ? { ...capability, source: 'wrong-source' }
      : capability)
  ]) {
    assert.throws(() => validatePublicReceipt({ ...complete, capabilities }, {
      fixture: many,
      version: '0.147.0',
      architecture: 'x64'
    }), /capability|receipt|source|key|expected/i);
  }

  const failed = {
    ...base,
    status: 'FAIL',
    capabilities: base.capabilities.map((capability) => capability.kind === 'skill'
      ? { ...capability, status: 'MISSING' }
      : capability)
  };
  assert.deepEqual(validatePublicReceipt(failed, {
    fixture,
    version: '0.147.0',
    architecture: 'x64',
    expectedExitCode: 1
  }), failed);
});

test('evidence paths are filenames under the output root, never absolute or traversing', () => {
  for (const safe of ['bitrouter--0.147.0.json', 'public-fixture-summary.json']) {
    assert.equal(validateRelativeEvidencePath(safe), safe);
  }
  for (const unsafe of [
    '/tmp/receipt.json',
    '../receipt.json',
    'nested/receipt.json',
    'nested\\receipt.json',
    '.',
    ''
  ]) {
    assert.throws(() => validateRelativeEvidencePath(unsafe), /relative evidence path/i);
  }
});

test('injected orchestration probes exactly ten by two cells and emits only sanitized evidence', async (t) => {
  const boundary = await temporaryDirectory(t, 'public-fixture-boundary-');
  const outputRoot = path.join(boundary, 'artifacts', 'public-fixtures');
  const scratchParent = await temporaryDirectory(t, 'public-fixture-scratch-parent-');
  const scratchRoot = path.join(scratchParent, 'owned-run');
  const calls = [];
  let cleanupCalls = 0;

  const summary = await runPublicFixtureMatrix({
    architecture: 'x64',
    outputBoundary: boundary,
    outputRoot,
    personalMarkers: ['/Users/alice'],
    platform: 'linux'
  }, {
    assertRuntime: async () => {},
    makeTemporaryRoot: async () => {
      await mkdir(scratchRoot);
      return scratchRoot;
    },
    prepareFixture: ({ fixture, temporaryRoot }) => preparedFixtureStub(fixture, temporaryRoot),
    probeCell: async ({ fixture, version }) => {
      calls.push(`${fixture.repository}@${version}`);
      return { code: 0, receipt: publicReceipt(fixture, version) };
    },
    removeTemporaryRoot: async (root) => {
      cleanupCalls += 1;
      await rm(root, { recursive: true, force: true });
    }
  });

  assert.equal(calls.length, 20);
  assert.deepEqual(calls.slice(0, 4), [
    'bitrouter/bitrouter@0.147.0',
    'bitrouter/bitrouter@0.146.1',
    'Cassette-Editor/oh-my-cassette@0.147.0',
    'Cassette-Editor/oh-my-cassette@0.146.1'
  ]);
  assert.equal(cleanupCalls, 1);
  assert.equal(summary.status, 'PASS');
  assert.deepEqual(summary.gate, {
    observed: 10,
    required: 10,
    cells: 20,
    passedCells: 20,
    failedCells: 0
  });
  assert.equal(summary.outputRoot, '.');
  assert.equal(summary.provenance, null);
  assert.equal(summary.fixtures.length, 10);
  assert.equal(summary.fixtures.flatMap(({ receipts }) => receipts).length, 20);

  const names = (await readdir(outputRoot)).sort();
  assert.equal(names.length, 21);
  assert.ok(names.includes('public-fixture-summary.json'));
  for (const name of names) validateRelativeEvidencePath(name);
  const serialized = await readFile(path.join(outputRoot, 'public-fixture-summary.json'), 'utf8');
  assert.equal(serialized.includes(boundary), false);
  assert.equal(serialized.includes(scratchParent), false);
  assert.equal(serialized.includes('/Users/alice'), false);
  assert.deepEqual(JSON.parse(serialized), summary);
});

test('orchestration rejects prepared tree or plugin identity drift before probing', async (t) => {
  const mutations = [
    ['checkout hash', (prepared) => { prepared.checkoutSha256 = 'f'.repeat(64); }],
    ['marketplace hash', (prepared) => { prepared.marketplaceSha256 = 'f'.repeat(64); }],
    ['plugin root', (prepared) => { prepared.pluginContract.pluginRoot = 'wrong-root'; }],
    ['plugin version', (prepared) => { prepared.pluginContract.pluginVersion = '9.9.9'; }]
  ];
  for (const [label, mutate] of mutations) {
    await t.test(label, async () => {
      const boundary = await temporaryDirectory(t, `public-fixture-drift-${label.replace(' ', '-')}-`);
      const scratchRoot = path.join(boundary, 'scratch');
      let probeCalls = 0;
      await assert.rejects(runPublicFixtureMatrix({
        architecture: 'x64',
        outputBoundary: boundary,
        outputRoot: path.join(boundary, 'artifacts', 'public-fixtures'),
        platform: 'linux'
      }, {
        assertRuntime: async () => {},
        makeTemporaryRoot: async () => {
          await mkdir(scratchRoot);
          return scratchRoot;
        },
        prepareFixture: async ({ fixture, temporaryRoot }) => {
          const prepared = await preparedFixtureStub(fixture, temporaryRoot);
          mutate(prepared);
          return prepared;
        },
        probeCell: async ({ fixture, version }) => {
          probeCalls += 1;
          return { code: 0, receipt: publicReceipt(fixture, version) };
        },
        removeTemporaryRoot: (root) => rm(root, { recursive: true, force: true })
      }), /prepared|hash|plugin|contract|identity/i);
      assert.equal(probeCalls, 0);
    });
  }
});

test('unexpected tool exits and cleanup failures fail closed without partial evidence', async (t) => {
  for (const failure of ['tool', 'cleanup']) {
    const boundary = await temporaryDirectory(t, `public-fixture-${failure}-boundary-`);
    const outputRoot = path.join(boundary, 'artifacts', 'public-fixtures');
    const scratchParent = await temporaryDirectory(t, `public-fixture-${failure}-scratch-`);
    const scratchRoot = path.join(scratchParent, 'owned-run');
    let probeCalls = 0;
    await assert.rejects(runPublicFixtureMatrix({
      architecture: 'x64',
      outputBoundary: boundary,
      outputRoot,
      platform: 'linux'
    }, {
      assertRuntime: async () => {},
      makeTemporaryRoot: async () => {
        await mkdir(scratchRoot);
        return scratchRoot;
      },
      prepareFixture: ({ fixture, temporaryRoot }) => preparedFixtureStub(fixture, temporaryRoot),
      probeCell: async ({ fixture, version }) => {
        probeCalls += 1;
        return failure === 'tool'
          ? { code: 2, receipt: null, stderr: 'unexpected loader error' }
          : { code: 0, receipt: publicReceipt(fixture, version) };
      },
      removeTemporaryRoot: async (root) => {
        await rm(root, { recursive: true, force: true });
        if (failure === 'cleanup') throw new Error('fixture cleanup failed');
      }
    }), failure === 'tool' ? /unexpected.*code 2|tool.*code 2/i : /cleanup failed/i);
    assert.ok(probeCalls >= 1);
    await assert.rejects(access(outputRoot), { code: 'ENOENT' });
  }
});

test('a valid strict FAIL is retained without inventing a cause and holds the summary', async (t) => {
  const boundary = await temporaryDirectory(t, 'public-fixture-incompatible-boundary-');
  const outputRoot = path.join(boundary, 'artifacts', 'public-fixtures');
  const scratchParent = await temporaryDirectory(t, 'public-fixture-incompatible-scratch-');
  const scratchRoot = path.join(scratchParent, 'owned-run');
  let first = true;

  const summary = await runPublicFixtureMatrix({
    architecture: 'x64',
    outputBoundary: boundary,
    outputRoot,
    platform: 'linux'
  }, {
    assertRuntime: async () => {},
    makeTemporaryRoot: async () => {
      await mkdir(scratchRoot);
      return scratchRoot;
    },
    prepareFixture: ({ fixture, temporaryRoot }) => preparedFixtureStub(fixture, temporaryRoot),
    probeCell: async ({ fixture, version }) => {
      const receipt = publicReceipt(fixture, version);
      if (!first) return { code: 0, receipt };
      first = false;
      return {
        code: 1,
        receipt: {
          ...receipt,
          status: 'FAIL',
          capabilities: receipt.capabilities.map((capability) => capability.kind === 'skill'
            ? { ...capability, status: 'MISSING' }
            : capability)
        }
      };
    },
    removeTemporaryRoot: (root) => rm(root, { recursive: true, force: true })
  });

  assert.equal(summary.status, 'HOLD');
  assert.equal(summary.gate.failedCells, 1);
  assert.equal(summary.gate.passedCells, 19);
  assert.equal(summary.fixtures[0].receipts[0].outcome, 'FAIL');
  assert.equal(summary.fixtures[0].receipts[1].outcome, 'PASS');
  assert.equal(JSON.stringify(summary).includes('VERSION_OR_API_INCOMPATIBLE'), false);
  assert.equal(
    JSON.parse(await readFile(
      path.join(outputRoot, summary.fixtures[0].receipts[0].receiptPath),
      'utf8'
    )).status,
    'FAIL'
  );
});

test('evidence root symlinks are rejected before writes and outside state remains unchanged', async (t) => {
  const boundary = await temporaryDirectory(t, 'public-fixture-symlink-boundary-');
  const outside = await temporaryDirectory(t, 'public-fixture-symlink-outside-');
  const sentinel = path.join(outside, 'sentinel.txt');
  await writeFile(sentinel, 'unchanged\n');
  await symlink(outside, path.join(boundary, 'artifacts'), 'dir');
  let prepared = false;

  await assert.rejects(runPublicFixtureMatrix({
    architecture: 'x64',
    outputBoundary: boundary,
    outputRoot: path.join(boundary, 'artifacts', 'public-fixtures'),
    platform: 'linux'
  }, {
    assertRuntime: async () => {},
    makeTemporaryRoot: async () => { prepared = true; }
  }), /symlink/i);
  assert.equal(prepared, false);
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n');
  await assert.rejects(access(path.join(outside, 'public-fixtures')), { code: 'ENOENT' });
});

test('swapping the created evidence root for a symlink cannot write outside', async (t) => {
  const boundary = await temporaryDirectory(t, 'public-fixture-swap-boundary-');
  const outside = await temporaryDirectory(t, 'public-fixture-swap-outside-');
  const outputRoot = path.join(boundary, 'artifacts', 'public-fixtures');
  const scratchParent = await temporaryDirectory(t, 'public-fixture-swap-scratch-');
  const scratchRoot = path.join(scratchParent, 'owned-run');
  const sentinel = path.join(outside, 'sentinel.txt');
  await writeFile(sentinel, 'unchanged\n');
  let swapped = false;

  await assert.rejects(runPublicFixtureMatrix({
    architecture: 'x64',
    outputBoundary: boundary,
    outputRoot,
    platform: 'linux'
  }, {
    assertRuntime: async () => {},
    makeTemporaryRoot: async () => {
      await mkdir(scratchRoot);
      return scratchRoot;
    },
    prepareFixture: ({ fixture, temporaryRoot }) => preparedFixtureStub(fixture, temporaryRoot),
    probeCell: async ({ fixture, version }) => {
      if (!swapped) {
        swapped = true;
        await rm(outputRoot, { recursive: true });
        await symlink(outside, outputRoot, 'dir');
      }
      return { code: 0, receipt: publicReceipt(fixture, version) };
    },
    removeTemporaryRoot: (root) => rm(root, { recursive: true, force: true })
  }), /evidence|symlink|cleanup/i);

  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n');
  assert.deepEqual(await readdir(outside), ['sentinel.txt']);
});

test('archive fetch uses only exact credential-free codeload and enforces byte bounds', async () => {
  const fixture = PUBLIC_FIXTURES[0];
  let observed;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]));
      controller.enqueue(Uint8Array.from([3, 4]));
      controller.close();
    }
  });
  const fetched = await fetchPublicArchive(fixture, {
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        url: fixture.archiveUrl,
        headers: { get: (name) => name.toLowerCase() === 'content-length' ? '4' : null },
        body
      };
    },
    maxBytes: 4,
    timeoutMs: 100
  });
  assert.deepEqual(fetched.bytes, Buffer.from([1, 2, 3, 4]));
  assert.equal(fetched.archiveSha256, '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
  assert.equal(observed.url, fixture.archiveUrl);
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.credentials, 'omit');
  assert.ok(observed.options.signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(observed.options.headers).sort(), ['accept', 'user-agent']);

  await assert.rejects(fetchPublicArchive(fixture, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: fixture.archiveUrl,
      headers: { get: () => '5' },
      body: new ReadableStream({ start(controller) { controller.close(); } })
    }),
    maxBytes: 4,
    timeoutMs: 100
  }), /archive.*size|exceed/i);

  await assert.rejects(fetchPublicArchive(fixture, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: 'https://evil.example/archive.tar.gz',
      headers: { get: () => '1' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1]));
          controller.close();
        }
      })
    }),
    maxBytes: 4,
    timeoutMs: 100
  }), /codeload|identity|url/i);
});

test('tar parser validates before manual extraction and never preserves executable bits', async (t) => {
  const fixture = PUBLIC_FIXTURES[6];
  const root = fixture.archiveRoot;
  const archive = tarArchive([
    { path: `${root}/`, type: '5', mode: 0o755 },
    { path: `${root}/LICENSE`, data: 'MIT\n' },
    { path: `${root}/run-me.sh`, data: '#!/bin/sh\ntouch EXECUTED\n', mode: 0o755 },
    { path: `${root}/license-link`, type: '2', linkPath: 'LICENSE' }
  ]);
  const entries = parseTarGzipArchive(archive, {
    expectedRoot: root,
    maxUncompressedBytes: 1024 * 1024
  });
  assert.deepEqual(entries.map(({ path: entryPath, type }) => [entryPath, type]), [
    [`${root}/`, 'directory'],
    [`${root}/LICENSE`, 'file'],
    [`${root}/run-me.sh`, 'file'],
    [`${root}/license-link`, 'symlink']
  ]);

  const destination = await temporaryDirectory(t, 'public-fixture-extract-');
  const checkoutRoot = await extractArchiveEntries(entries, destination, root);
  assert.equal(await readFile(path.join(checkoutRoot, 'LICENSE'), 'utf8'), 'MIT\n');
  const scriptMode = await lstat(path.join(checkoutRoot, 'run-me.sh'));
  assert.equal(scriptMode.mode & 0o111, 0);
  await auditExtractedSymlinks(checkoutRoot);
  await assert.rejects(access(path.join(checkoutRoot, 'EXECUTED')), { code: 'ENOENT' });

  for (const unsafe of [
    tarArchive([{ path: `${root}/../escape`, data: 'bad' }]),
    tarArchive([{ path: `${root}/link`, type: '2', linkPath: '../../escape' }])
  ]) {
    assert.throws(
      () => parseTarGzipArchive(unsafe, {
        expectedRoot: root,
        maxUncompressedBytes: 1024 * 1024
      }),
      /archive|escape|root|path/i
    );
  }

  const corrupt = Buffer.from(archive);
  corrupt[20] ^= 0xff;
  assert.throws(
    () => parseTarGzipArchive(corrupt, {
      expectedRoot: root,
      maxUncompressedBytes: 1024 * 1024
    }),
    /archive|gzip|checksum|invalid/i
  );
});

test('tar parser resolves bounded PAX path metadata without exposing metadata entries', () => {
  const fixture = PUBLIC_FIXTURES[6];
  const longPath = `${fixture.archiveRoot}/${'nested-'.repeat(16)}skill.md`;
  const archive = tarArchive([
    {
      path: 'pax_global_header',
      type: 'g',
      data: paxRecord('comment', fixture.commit)
    },
    {
      path: `${fixture.archiveRoot}/pax-header`,
      type: 'x',
      data: paxRecord('path', longPath)
    },
    { path: `${fixture.archiveRoot}/placeholder`, data: 'content\n' }
  ]);
  const entries = parseTarGzipArchive(archive, {
    expectedRoot: fixture.archiveRoot,
    maxUncompressedBytes: 1024 * 1024
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, longPath);
  assert.equal(entries[0].data.toString('utf8'), 'content\n');
});

test('on-disk symlink audit rejects a lexical escape from the checkout', async (t) => {
  const checkout = await temporaryDirectory(t, 'public-fixture-checkout-');
  const outside = await temporaryDirectory(t, 'public-fixture-checkout-outside-');
  await symlink(outside, path.join(checkout, 'escape'), 'dir');
  await assert.rejects(auditExtractedSymlinks(checkout), /symlink.*escape|escape.*symlink/i);
});

test('real preparation verifies licenses, hashes source, and applies only the audited adapter', async (t) => {
  const direct = PUBLIC_FIXTURES[6];
  const directMarketplace = `${JSON.stringify({
    name: direct.marketplace,
    plugins: [{
      name: direct.plugin,
      source: { source: 'local', path: './' }
    }]
  })}\n`;
  const directPluginManifest = `${JSON.stringify({
    name: direct.plugin,
    version: direct.pluginVersion
  })}\n`;
  const directArchive = tarArchive([
    { path: `${direct.archiveRoot}/`, type: '5' },
    { path: `${direct.archiveRoot}/LICENSE`, data: 'MIT\n' },
    { path: `${direct.archiveRoot}/.agents/`, type: '5' },
    { path: `${direct.archiveRoot}/.agents/plugins/`, type: '5' },
    {
      path: `${direct.archiveRoot}/.agents/plugins/marketplace.json`,
      data: directMarketplace
    },
    { path: `${direct.archiveRoot}/.codex-plugin/`, type: '5' },
    {
      path: `${direct.archiveRoot}/.codex-plugin/plugin.json`,
      data: directPluginManifest
    }
  ]);
  const directTemporaryRoot = await temporaryDirectory(t, 'public-fixture-prepare-direct-');
  const directPrepared = await preparePublicFixture({
    fixture: direct,
    temporaryRoot: directTemporaryRoot
  }, {
    fetchArchive: async () => ({
      bytes: directArchive,
      archiveSha256: createHash('sha256').update(directArchive).digest('hex')
    })
  });
  assert.equal(directPrepared.archiveSha256, createHash('sha256').update(directArchive).digest('hex'));
  assert.match(directPrepared.checkoutSha256, /^[a-f0-9]{64}$/);
  assert.match(directPrepared.marketplaceSha256, /^[a-f0-9]{64}$/);
  assert.equal(directPrepared.adapter, null);
  assert.deepEqual(directPrepared.pluginContract, {
    marketplaceManifestPath: direct.marketplaceManifestPath,
    marketplace: direct.marketplace,
    plugin: direct.plugin,
    pluginRoot: direct.pluginRoot,
    pluginManifestPath: direct.pluginManifestPath,
    pluginVersion: direct.pluginVersion
  });
  assert.equal(await readFile(path.join(directPrepared.marketplaceRoot, 'LICENSE'), 'utf8'), 'MIT\n');

  const adapted = PUBLIC_FIXTURES[1];
  const adaptedArchive = tarArchive([
    { path: `${adapted.archiveRoot}/`, type: '5' },
    { path: `${adapted.archiveRoot}/LICENSE`, data: 'MIT\n' },
    { path: `${adapted.archiveRoot}/.agents/`, type: '5' },
    { path: `${adapted.archiveRoot}/.agents/plugins/`, type: '5' },
    {
      path: `${adapted.archiveRoot}/.agents/plugins/marketplace.json`,
      data: OH_MY_CASSETTE_MARKETPLACE
    },
    { path: `${adapted.archiveRoot}/.codex-plugin/`, type: '5' },
    {
      path: `${adapted.archiveRoot}/.codex-plugin/plugin.json`,
      data: `${JSON.stringify({
        name: adapted.plugin,
        version: adapted.pluginVersion
      })}\n`
    }
  ]);
  const adaptedTemporaryRoot = await temporaryDirectory(t, 'public-fixture-prepare-adapted-');
  const adaptedPrepared = await preparePublicFixture({
    fixture: adapted,
    temporaryRoot: adaptedTemporaryRoot
  }, {
    fetchArchive: async () => ({
      bytes: adaptedArchive,
      archiveSha256: createHash('sha256').update(adaptedArchive).digest('hex')
    })
  });
  assert.deepEqual(adaptedPrepared.adapter, {
    id: 'local-source-v1',
    originalSha256: 'd5c629f3a3b8dd2cdf560963c26b1c5e9dc062045fef13cafca178e7b1bd3d3f',
    adaptedSha256: 'bbecf8a43d3e993b8506f497a416a0cd83e535a18f3f647e79d6d2458fd6c7b1'
  });
  assert.deepEqual(
    JSON.parse(await readFile(
      path.join(adaptedPrepared.marketplaceRoot, '.agents/plugins/marketplace.json'),
      'utf8'
    )).plugins[0].source,
    { source: 'local', path: './' }
  );
  assert.equal(adaptedPrepared.pluginContract.pluginVersion, adapted.pluginVersion);

  const directManifestPath = path.join(
    directPrepared.marketplaceRoot,
    direct.marketplaceManifestPath
  );
  const directPluginManifestPath = path.join(
    directPrepared.marketplaceRoot,
    direct.pluginManifestPath
  );
  await writeFile(directManifestPath, `${JSON.stringify({
    name: direct.marketplace,
    plugins: [{ name: direct.plugin, source: './wrong-plugin-root' }]
  })}\n`);
  await assert.rejects(
    validateStaticPluginContract(direct, directPrepared.marketplaceRoot),
    /plugin.*root|source.*path|marketplace.*source/i
  );
  await writeFile(directManifestPath, directMarketplace);
  await writeFile(directPluginManifestPath, `${JSON.stringify({
    name: direct.plugin,
    version: '9.9.9'
  })}\n`);
  await assert.rejects(
    validateStaticPluginContract(direct, directPrepared.marketplaceRoot),
    /plugin.*version|version.*plugin/i
  );

  const missingLicense = tarArchive([
    { path: `${direct.archiveRoot}/`, type: '5' },
    { path: `${direct.archiveRoot}/README.md`, data: 'no license\n' }
  ]);
  const missingTemporaryRoot = await temporaryDirectory(t, 'public-fixture-prepare-missing-');
  await assert.rejects(preparePublicFixture({
    fixture: direct,
    temporaryRoot: missingTemporaryRoot
  }, {
    fetchArchive: async () => ({
      bytes: missingLicense,
      archiveSha256: createHash('sha256').update(missingLicense).digest('hex')
    })
  }), /license/i);

  const adapterSymlink = tarArchive([
    { path: `${adapted.archiveRoot}/`, type: '5' },
    { path: `${adapted.archiveRoot}/LICENSE`, data: OH_MY_CASSETTE_MARKETPLACE },
    { path: `${adapted.archiveRoot}/.agents/`, type: '5' },
    { path: `${adapted.archiveRoot}/.agents/plugins/`, type: '5' },
    {
      path: `${adapted.archiveRoot}/.agents/plugins/marketplace.json`,
      type: '2',
      linkPath: '../../LICENSE'
    }
  ]);
  const symlinkTemporaryRoot = await temporaryDirectory(t, 'public-fixture-prepare-symlink-');
  await assert.rejects(preparePublicFixture({
    fixture: adapted,
    temporaryRoot: symlinkTemporaryRoot
  }, {
    fetchArchive: async () => ({
      bytes: adapterSymlink,
      archiveSha256: createHash('sha256').update(adapterSymlink).digest('hex')
    })
  }), /adapter.*regular|regular.*adapter|symlink/i);
});

test('production cell probe invokes the real CLI contract with a fresh staged receipt then removes it', async (t) => {
  const temporaryRoot = await temporaryDirectory(t, 'public-fixture-probe-');
  const marketplaceRoot = path.join(temporaryRoot, 'marketplace');
  await mkdir(marketplaceRoot);
  const fixture = PUBLIC_FIXTURES[0];
  const calls = [];

  const result = await probePublicFixtureCell({
    architecture: 'x64',
    fixture,
    marketplaceRoot,
    temporaryRoot,
    version: '0.147.0'
  }, {
    cliMain: async (argv) => {
      calls.push(argv);
      const output = argv[argv.indexOf('--output') + 1];
      await writeFile(output, `${JSON.stringify(publicReceipt(fixture, '0.147.0'))}\n`, {
        flag: 'wx'
      });
      return 0;
    }
  });

  assert.equal(result.code, 0);
  assert.deepEqual(result.receipt, publicReceipt(fixture, '0.147.0'));
  assert.deepEqual(calls, [[
    '--marketplace-root', marketplaceRoot,
    '--plugin', 'bitrouter',
    '--expected-plugin-root', '.',
    '--expected-plugin-version', '0.1.0',
    '--codex-version', '0.147.0',
    '--cwd', marketplaceRoot,
    '--output', path.join(temporaryRoot, 'staged-receipts', 'bitrouter--codex-0.147.0.json'),
    '--isolation', 'strict',
    '--quiet'
  ]]);
  assert.deepEqual(await readdir(path.join(temporaryRoot, 'staged-receipts')), []);
});

test('production cell probe binds code one to a valid FAIL and rejects code two or stale output', async (t) => {
  const temporaryRoot = await temporaryDirectory(t, 'public-fixture-probe-errors-');
  const marketplaceRoot = path.join(temporaryRoot, 'marketplace');
  await mkdir(marketplaceRoot);
  const fixture = PUBLIC_FIXTURES[0];
  const failed = publicReceipt(fixture, '0.147.0');
  failed.status = 'FAIL';
  failed.capabilities = failed.capabilities.map((capability) => capability.kind === 'skill'
    ? { ...capability, status: 'MISSING' }
    : capability);

  const validFailure = await probePublicFixtureCell({
    architecture: 'x64',
    fixture,
    marketplaceRoot,
    temporaryRoot,
    version: '0.147.0'
  }, {
    cliMain: async (argv) => {
      await writeFile(argv[argv.indexOf('--output') + 1], `${JSON.stringify(failed)}\n`, {
        flag: 'wx'
      });
      return 1;
    }
  });
  assert.equal(validFailure.code, 1);
  assert.equal(validFailure.receipt.status, 'FAIL');

  await assert.rejects(probePublicFixtureCell({
    architecture: 'x64',
    fixture,
    marketplaceRoot,
    temporaryRoot,
    version: '0.146.1'
  }, {
    cliMain: async (argv, io) => {
      io.stderr.write('unexpected loader error\n');
      await writeFile(
        argv[argv.indexOf('--output') + 1],
        `${JSON.stringify(publicReceipt(fixture, '0.146.1'))}\n`,
        { flag: 'wx' }
      );
      return 2;
    }
  }), /code 2|loader error/i);
  assert.deepEqual(await readdir(path.join(temporaryRoot, 'staged-receipts')), []);

  const stalePath = path.join(
    temporaryRoot,
    'staged-receipts',
    'bitrouter--codex-0.146.1.json'
  );
  await writeFile(stalePath, 'stale\n', { flag: 'wx' });
  let invoked = false;
  await assert.rejects(probePublicFixtureCell({
    architecture: 'x64',
    fixture,
    marketplaceRoot,
    temporaryRoot,
    version: '0.146.1'
  }, {
    cliMain: async () => { invoked = true; }
  }), /fresh|already exists|staged/i);
  assert.equal(invoked, false);
  assert.equal(await readFile(stalePath, 'utf8'), 'stale\n');
});

test('runtime preflight hard-fails outside Linux and requires a live Docker server', async () => {
  let inspections = 0;
  await assert.rejects(assertPublicFixtureRuntime({ platform: 'darwin' }, {
    inspectDocker: async () => { inspections += 1; }
  }), /requires Linux.*darwin/i);
  assert.equal(inspections, 0);

  await assertPublicFixtureRuntime({ platform: 'linux' }, {
    inspectDocker: async () => {
      inspections += 1;
      return { code: 0, stdout: '27.5.1\n', stderr: '' };
    }
  });
  assert.equal(inspections, 1);

  for (const result of [
    { code: 1, stdout: '', stderr: 'daemon unavailable' },
    { code: 0, stdout: '', stderr: '' }
  ]) {
    await assert.rejects(assertPublicFixtureRuntime({ platform: 'linux' }, {
      inspectDocker: async () => result
    }), /requires Docker|daemon unavailable/i);
  }
});

test('Docker inspection escalates a timeout from SIGTERM to SIGKILL', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === 'SIGKILL') {
      queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
    }
    return true;
  };

  await assert.rejects(inspectDockerReal({
    killGraceMs: 5,
    spawnProcess(command, args, options) {
      assert.equal(command, 'docker');
      assert.deepEqual(args, ['version', '--format', '{{.Server.Version}}']);
      assert.equal(options.shell, false);
      return child;
    },
    timeoutMs: 5
  }), /timed out after 5ms/i);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  child.stdout.destroy();
  child.stderr.destroy();
});

test('atomic evidence creation never overwrites an existing receipt and leaves no temp file', async (t) => {
  const boundary = await temporaryDirectory(t, 'public-fixture-atomic-boundary-');
  const outputRoot = path.join(boundary, 'evidence');
  await mkdir(outputRoot);
  await writeAtomicEvidenceJson(
    { boundary, outputRoot },
    'receipt.json',
    { status: 'PASS' }
  );
  assert.deepEqual(JSON.parse(await readFile(path.join(outputRoot, 'receipt.json'), 'utf8')), {
    status: 'PASS'
  });
  await assert.rejects(writeAtomicEvidenceJson(
    { boundary, outputRoot },
    'receipt.json',
    { status: 'FAIL' }
  ), /exist|fresh|atomic/i);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputRoot, 'receipt.json'), 'utf8')), {
    status: 'PASS'
  });
  assert.deepEqual(await readdir(outputRoot), ['receipt.json']);
});

test('entrypoint binds exact environment options and reports failures with exit code two', async () => {
  const env = {
    CODEX_CURRENT_VERSION: '0.147.0',
    CODEX_PRIOR_VERSION: '0.146.1',
    CODEX_PUBLIC_FIXTURE_OUTPUT_ROOT: 'artifacts/public-fixtures'
  };
  let observedOptions;
  let stderr = '';
  const code = await publicFixtureMain({
    cwd: '/checkout',
    env,
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    runMatrix: async (options) => {
      observedOptions = options;
      return { status: 'PASS' };
    }
  });
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.deepEqual(observedOptions, {
    architecture: process.arch,
    outputBoundary: '/checkout',
    outputRoot: '/checkout/artifacts/public-fixtures',
    platform: process.platform,
    provenance: null
  });

  const holdCode = await publicFixtureMain({
    cwd: '/checkout',
    env,
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    runMatrix: async () => ({ status: 'HOLD' })
  });
  assert.equal(holdCode, 1, 'a failed conformance cell must not make CI green');

  const toolErrorCode = await publicFixtureMain({
    cwd: '/checkout',
    env,
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    runMatrix: async () => { throw new Error('Docker unavailable'); }
  });
  assert.equal(toolErrorCode, 2);
  assert.match(stderr, /Error: Docker unavailable/i);

  let invoked = false;
  const invalidCode = await publicFixtureMain({
    cwd: '/checkout',
    env: { ...env, CODEX_CURRENT_VERSION: 'latest' },
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    runMatrix: async () => { invoked = true; }
  });
  assert.equal(invalidCode, 2);
  assert.equal(invoked, false);
  assert.match(stderr, /Error:.*0\.147\.0/i);
});
