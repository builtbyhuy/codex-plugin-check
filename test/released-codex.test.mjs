import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CURRENT_CODEX_VERSION,
  PRIOR_CODEX_VERSION,
  runFalsifier,
  validateBoundaryReport,
  validateReleasedReceipt
} from '../scripts/falsify-released-codex.mjs';

const EXACT_ENV = {
  CODEX_CURRENT_VERSION: '0.147.0',
  CODEX_PRIOR_VERSION: '0.146.1'
};

function releasedReceipt(version, overrides = {}) {
  return {
    schemaVersion: '0.1.0',
    status: 'PASS',
    codexVersion: version,
    platform: 'linux-x64',
    plugin: {
      name: 'sample',
      marketplace: 'local-marketplace',
      sourceRoot: '/workspace'
    },
    capabilities: [
      {
        kind: 'hook',
        key: 'sample@local-marketplace:hooks/hooks.json:session_start:0:0',
        source: 'plugin/read + hooks/list',
        status: 'DISCOVERED_UNTRUSTED'
      },
      {
        kind: 'mcp',
        key: 'sample-mcp',
        source: 'plugin/read',
        status: 'DECLARED_ONLY'
      },
      {
        kind: 'skill',
        key: 'sample:sample-skill',
        source: 'plugin/read + skills/list',
        status: 'DISCOVERED_EFFECTIVE'
      }
    ],
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' },
    ...overrides
  };
}

function negativeReceipt(version, overrides = {}) {
  const base = releasedReceipt(version);
  return {
    ...base,
    status: 'FAIL',
    capabilities: base.capabilities.map((capability) => capability.kind === 'skill'
      ? { ...capability, status: 'MISSING' }
      : capability),
    ...overrides
  };
}

function boundaryReport(overrides = {}) {
  return {
    schemaVersion: '0.1.0',
    credentialEnvironmentAbsent: true,
    stateWritable: true,
    outputWritable: true,
    workspaceReadOnly: true,
    unrelatedHostCanaryInvisible: true,
    hostLoopbackUnreachable: true,
    externalNetworkUnreachable: true,
    ...overrides
  };
}

async function temporaryDirectory(t, prefix) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function dockerServerAvailable() {
  if (process.platform !== 'linux') {
    return Promise.resolve({
      available: false,
      reason: `strict Linux Docker unavailable on ${process.platform}-${process.arch}`
    });
  }
  return new Promise((resolve) => {
    const child = spawn('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: 'ignore'
    });
    child.once('error', () => resolve({
      available: false,
      reason: 'Docker CLI or daemon unavailable; strict released-binary probe not observed'
    }));
    child.once('exit', (code) => resolve(code === 0
      ? { available: true }
      : {
          available: false,
          reason: 'Docker CLI or daemon unavailable; strict released-binary probe not observed'
        }));
  });
}

test('falsifier requires the exact current and prior released Codex versions before work starts', async () => {
  let touchedDocker = false;
  const dependencies = {
    assertStrictDocker: async () => { touchedDocker = true; }
  };

  for (const env of [
    {},
    { ...EXACT_ENV, CODEX_CURRENT_VERSION: 'latest' },
    { ...EXACT_ENV, CODEX_PRIOR_VERSION: '0.146.0' }
  ]) {
    await assert.rejects(
      runFalsifier({ env, platform: 'linux', architecture: 'x64' }, dependencies),
      /CODEX_CURRENT_VERSION=0\.147\.0.*CODEX_PRIOR_VERSION=0\.146\.1/i
    );
  }
  assert.equal(touchedDocker, false);
  assert.equal(CURRENT_CODEX_VERSION, '0.147.0');
  assert.equal(PRIOR_CODEX_VERSION, '0.146.1');
});

test('injected orchestration audits the boundary and validates both receipts without changing checkout', async (t) => {
  const outputRoot = await temporaryDirectory(t, 'released-codex-output-');
  const fixtureRoot = await temporaryDirectory(t, 'released-codex-fixture-');
  const observedLanes = [];
  const hashes = ['sha256-stable', 'sha256-stable'];

  const result = await runFalsifier({
    env: EXACT_ENV,
    platform: 'linux',
    architecture: 'x64',
    fixtureRoot,
    outputRoot,
    personalMarkers: ['alice']
  }, {
    assertStrictDocker: async () => {},
    hashCheckout: async () => hashes.shift(),
    auditBoundary: async ({ version }) => {
      assert.equal(version, '0.147.0');
      return boundaryReport();
    },
    probeVersion: async ({ outputPath, version }) => {
      observedLanes.push(`positive:${version}`);
      const receipt = releasedReceipt(version);
      await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
      return { durationMs: version === '0.147.0' ? 12_345 : 23_456, receipt };
    },
    probeNegativeVersion: async ({ outputPath, version }) => {
      observedLanes.push(`negative:${version}`);
      const receipt = negativeReceipt(version);
      await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
      return { durationMs: version === '0.147.0' ? 13_456 : 24_567, receipt };
    }
  });

  assert.equal(result.status, 'HOLD');
  assert.equal(result.boundedFalsifier, 'PASS');
  assert.deepEqual(result.gates.publicFixtureMatrix, {
    status: 'UNRUN',
    observed: 0,
    required: 10
  });
  assert.deepEqual(observedLanes, [
    'positive:0.147.0',
    'negative:0.147.0',
    'positive:0.146.1',
    'negative:0.146.1'
  ]);
  assert.deepEqual(
    result.versions.map(({ version, durationMs }) => ({ version, durationMs })),
    [
      { version: '0.147.0', durationMs: 12_345 },
      { version: '0.146.1', durationMs: 23_456 }
    ]
  );
  assert.deepEqual(
    result.negativeVersions.map(({ version, durationMs }) => ({ version, durationMs })),
    [
      { version: '0.147.0', durationMs: 13_456 },
      { version: '0.146.1', durationMs: 24_567 }
    ]
  );
  for (const version of [CURRENT_CODEX_VERSION, PRIOR_CODEX_VERSION]) {
    for (const lane of ['positive', 'negative']) {
      const receiptPath = path.join(outputRoot, `codex-${version}-${lane}.json`);
      assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).codexVersion, version);
    }
  }
});

test('positive probe rejects hook or MCP execution sentinels before isolation cleanup', async (t) => {
  const { probeReleasedVersion } = await import('../scripts/falsify-released-codex.mjs');
  for (const sentinel of [
    'codex-plugin-check-hook-executed',
    'codex-plugin-check-mcp-executed'
  ]) {
    const root = await temporaryDirectory(t, 'released-codex-sentinel-');
    const isolationOutput = path.join(root, 'isolation-output');
    const finalOutput = path.join(root, 'receipt.json');
    await mkdir(isolationOutput);
    let cleaned = false;

    await assert.rejects(probeReleasedVersion({
      architecture: 'x64',
      fixtureRoot: root,
      outputPath: finalOutput,
      version: '0.147.0'
    }, {
      createIsolation: async () => ({
        outputDirectory: isolationOutput,
        async cleanup() {
          cleaned = true;
          await rm(isolationOutput, { recursive: true, force: true });
        }
      }),
      cliMain: async (_argv, io, cliDependencies) => {
        const isolation = await cliDependencies.createIsolation({});
        await writeFile(path.join(isolation.outputDirectory, sentinel), 'executed\n');
        try {
          await isolation.cleanup();
          return 0;
        } catch (cause) {
          io.stderr.write(`Error: ${cause.message}\n`);
          return 2;
        }
      },
      now: () => 1
    }), /execution sentinel/i, sentinel);
    assert.equal(cleaned, true, `${sentinel} cleanup`);
  }
});

test('synthetic hook and MCP commands write dedicated execution sentinels', async (t) => {
  const plugin = JSON.parse(await readFile(new URL(
    './fixtures/marketplace/plugins/sample/.codex-plugin/plugin.json',
    import.meta.url
  ), 'utf8'));
  const hooks = JSON.parse(await readFile(new URL(
    './fixtures/marketplace/plugins/sample/hooks/hooks.json',
    import.meta.url
  ), 'utf8'));
  assert.equal(plugin.mcpServers['sample-mcp'].command, '/usr/local/bin/node');
  assert.deepEqual(plugin.mcpServers['sample-mcp'].args, [
    '/tool/scripts/execution-sentinel.mjs',
    'mcp'
  ]);
  assert.equal(
    hooks.hooks.SessionStart[0].hooks[0].command,
    '/usr/local/bin/node /tool/scripts/execution-sentinel.mjs hook'
  );

  const { writeExecutionSentinel } = await import('../scripts/execution-sentinel.mjs');
  const outputRoot = await temporaryDirectory(t, 'released-codex-execution-sentinel-');
  await writeExecutionSentinel('hook', outputRoot);
  await writeExecutionSentinel('mcp', outputRoot);
  assert.equal(
    await readFile(path.join(outputRoot, 'codex-plugin-check-hook-executed'), 'utf8'),
    'hook executed\n'
  );
  assert.equal(
    await readFile(path.join(outputRoot, 'codex-plugin-check-mcp-executed'), 'utf8'),
    'mcp executed\n'
  );
});

test('positive probe timing excludes image preparation and includes cleanup plus final validation', async (t) => {
  const { probeReleasedVersion } = await import('../scripts/falsify-released-codex.mjs');
  const root = await temporaryDirectory(t, 'released-codex-timing-');
  const isolationOutput = path.join(root, 'isolation-output');
  const finalOutput = path.join(root, 'receipt.json');
  await mkdir(isolationOutput);
  let clock = 0;

  const run = await probeReleasedVersion({
    architecture: 'x64',
    fixtureRoot: root,
    outputPath: finalOutput,
    version: '0.147.0'
  }, {
    createIsolation: async () => {
      clock += 200_000;
      return {
        outputDirectory: isolationOutput,
        async cleanup() {
          clock += 1_000;
        }
      };
    },
    cliMain: async (_argv, _io, cliDependencies) => {
      const isolation = await cliDependencies.createIsolation({});
      clock += 88_000;
      await isolation.cleanup();
      await writeFile(finalOutput, `${JSON.stringify(releasedReceipt('0.147.0'))}\n`);
      return 0;
    },
    now: () => clock
  });

  assert.equal(run.durationMs, 89_000, '200 seconds of image preparation must be excluded');
});

test('positive probe rejects when post-preparation cleanup pushes runtime to 90 seconds', async (t) => {
  const { probeReleasedVersion } = await import('../scripts/falsify-released-codex.mjs');
  const root = await temporaryDirectory(t, 'released-codex-timing-limit-');
  const isolationOutput = path.join(root, 'isolation-output');
  const finalOutput = path.join(root, 'receipt.json');
  await mkdir(isolationOutput);
  let clock = 0;

  await assert.rejects(probeReleasedVersion({
    architecture: 'x64',
    fixtureRoot: root,
    outputPath: finalOutput,
    version: '0.147.0'
  }, {
    createIsolation: async () => ({
      outputDirectory: isolationOutput,
      async cleanup() { clock += 1_000; }
    }),
    cliMain: async (_argv, _io, cliDependencies) => {
      const isolation = await cliDependencies.createIsolation({});
      clock += 89_000;
      await isolation.cleanup();
      await writeFile(finalOutput, `${JSON.stringify(releasedReceipt('0.147.0'))}\n`);
      return 0;
    },
    now: () => clock
  }), /90000ms limit/i);
});

test('released receipt hard gates reject false discovery, identity, isolation, privacy, and timing evidence', () => {
  const base = releasedReceipt('0.147.0');
  const cases = [
    {
      label: 'wrong platform architecture',
      receipt: { ...base, platform: 'linux-fake' },
      durationMs: 1
    },
    {
      label: 'missing effective skill',
      receipt: { ...base, capabilities: base.capabilities.filter(({ kind }) => kind !== 'skill') },
      durationMs: 1
    },
    {
      label: 'hook was not discovered',
      receipt: {
        ...base,
        capabilities: base.capabilities.map((capability) => capability.kind === 'hook'
          ? { ...capability, status: 'MISSING' }
          : capability)
      },
      durationMs: 1
    },
    {
      label: 'MCP claims runtime execution',
      receipt: {
        ...base,
        capabilities: base.capabilities.map((capability) => capability.kind === 'mcp'
          ? { ...capability, status: 'DISCOVERED_EFFECTIVE' }
          : capability)
      },
      durationMs: 1
    },
    {
      label: 'unexpected app declaration',
      receipt: {
        ...base,
        capabilities: [
          ...base.capabilities,
          { kind: 'app', key: 'sample-app', source: 'plugin/read', status: 'DECLARED_ONLY' }
        ]
      },
      durationMs: 1
    },
    {
      label: 'extra synthetic capability',
      receipt: {
        ...base,
        capabilities: [
          ...base.capabilities,
          {
            kind: 'skill',
            key: 'sample:unexpected-skill',
            source: 'plugin/read + skills/list',
            status: 'DISCOVERED_EFFECTIVE'
          }
        ]
      },
      durationMs: 1
    },
    {
      label: 'personal host marker leaked',
      receipt: {
        ...base,
        plugin: { ...base.plugin, marketplace: 'alice-marketplace' }
      },
      durationMs: 1
    },
    { label: 'runtime reached limit', receipt: base, durationMs: 90_000 }
  ];

  for (const { label, receipt, durationMs } of cases) {
    assert.throws(
      () => validateReleasedReceipt(receipt, {
        architecture: 'x64',
        durationMs,
        personalMarkers: ['alice'],
        version: '0.147.0'
      }),
      undefined,
      label
    );
  }

  assert.doesNotThrow(() => validateReleasedReceipt(base, {
    architecture: 'x64',
    durationMs: 89_999,
    personalMarkers: ['alice'],
    version: '0.147.0'
  }));
});

function canConnectToLoopback(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => finish(true));
  });
}

test('boundary audit keeps a reachable host loopback listener alive and passes its exact port', async (t) => {
  const { auditStrictBoundary } = await import('../scripts/falsify-released-codex.mjs');
  const fixtureRoot = await temporaryDirectory(t, 'released-codex-fixture-');
  const isolationRoot = await temporaryDirectory(t, 'released-codex-isolation-');
  const outputPath = path.join(isolationRoot, 'boundary-canary.json');
  let observedPort;

  const report = await auditStrictBoundary({
    fixtureRoot,
    version: '0.147.0'
  }, {
    createIsolation: async () => ({
      outputPath,
      containerReceiptPath: '/output/boundary-canary.json',
      env: {},
      wrap(command, args) {
        return { command, args };
      },
      async assertCheckoutUnchanged() {},
      async cleanup() {}
    }),
    runProcess: async (_command, args) => {
      const portIndex = args.indexOf('--host-loopback-port');
      assert.notEqual(portIndex, -1, 'canary must receive the live host listener port');
      observedPort = Number(args[portIndex + 1]);
      assert.equal(Number.isInteger(observedPort), true);
      assert.equal(await canConnectToLoopback(observedPort), true, 'host listener must be live');
      await writeFile(outputPath, `${JSON.stringify(boundaryReport(), null, 2)}\n`);
      return { code: 0, stdout: '', stderr: '' };
    }
  });

  assert.deepEqual(report, boundaryReport());
  assert.equal(await canConnectToLoopback(observedPort), false, 'host listener must be closed');
});

test('boundary report hard gate requires every observed denial and writable owned surface', () => {
  const valid = boundaryReport();
  assert.doesNotThrow(() => validateBoundaryReport(valid));

  for (const field of [
    'credentialEnvironmentAbsent',
    'stateWritable',
    'outputWritable',
    'workspaceReadOnly',
    'unrelatedHostCanaryInvisible',
    'hostLoopbackUnreachable',
    'externalNetworkUnreachable'
  ]) {
    assert.throws(
      () => validateBoundaryReport({ ...valid, [field]: false }),
      new RegExp(field, 'i')
    );
  }
});

test('boundary canary recognizes credential-file environment variables without probing the host', async () => {
  const { credentialEnvironmentIsClean } = await import('../scripts/boundary-canary.mjs');

  assert.equal(credentialEnvironmentIsClean({ CODEX_HOME: '/state/codex-home' }), true);
  assert.equal(credentialEnvironmentIsClean({
    CODEX_HOME: '/state/codex-home',
    AWS_SHARED_CREDENTIALS_FILE: '/unmounted/aws-credentials'
  }), false);
});

test('falsifier fails when the fixture hash changes across otherwise passing probes', async (t) => {
  const outputRoot = await temporaryDirectory(t, 'released-codex-output-');
  const fixtureRoot = await temporaryDirectory(t, 'released-codex-fixture-');
  const hashes = ['before-hash', 'after-hash'];

  await assert.rejects(runFalsifier({
    env: EXACT_ENV,
    platform: 'linux',
    architecture: 'x64',
    fixtureRoot,
    outputRoot,
    personalMarkers: []
  }, {
    assertStrictDocker: async () => {},
    hashCheckout: async () => hashes.shift(),
    auditBoundary: async () => boundaryReport(),
    probeVersion: async ({ outputPath, version }) => {
      const receipt = releasedReceipt(version);
      await writeFile(outputPath, `${JSON.stringify(receipt)}\n`);
      return { durationMs: 1, receipt };
    },
    probeNegativeVersion: async ({ outputPath, version }) => {
      const receipt = negativeReceipt(version);
      await writeFile(outputPath, `${JSON.stringify(receipt)}\n`);
      return { durationMs: 1, receipt };
    }
  }), /checkout.*changed/i);
});

test('falsifier removes its default owned output root on failure', async (t) => {
  const ownedOutputRoot = await temporaryDirectory(t, 'released-codex-owned-failure-');
  const fixtureRoot = await temporaryDirectory(t, 'released-codex-fixture-');

  await assert.rejects(runFalsifier({
    env: EXACT_ENV,
    platform: 'linux',
    architecture: 'x64',
    fixtureRoot,
    personalMarkers: []
  }, {
    assertStrictDocker: async () => {},
    makeOutputRoot: async () => ownedOutputRoot,
    hashCheckout: async () => 'stable',
    auditBoundary: async () => { throw new Error('bounded failure'); }
  }), /bounded failure/i);

  await assert.rejects(access(ownedOutputRoot), { code: 'ENOENT' });
});

const strictDocker = await dockerServerAvailable();
test('released Codex current and prior binaries pass the real strict Linux falsifier', {
  skip: strictDocker.available ? false : strictDocker.reason,
  timeout: 8 * 60_000
}, async () => {
  const result = await runFalsifier({ env: EXACT_ENV });

  assert.equal(result.status, 'HOLD');
  assert.equal(result.boundedFalsifier, 'PASS');
  assert.equal(result.gates.publicFixtureMatrix.status, 'UNRUN');
  assert.deepEqual(result.versions.map(({ version }) => version), ['0.147.0', '0.146.1']);
  assert.deepEqual(
    result.negativeVersions.map(({ version }) => version),
    ['0.147.0', '0.146.1']
  );
  for (const run of result.versions) {
    assert.ok(run.durationMs < 90_000, `${run.version} exceeded the 90 second probe limit`);
    validateReleasedReceipt(run.receipt, {
      architecture: process.arch,
      durationMs: run.durationMs,
      personalMarkers: [],
      version: run.version
    });
  }
  for (const run of result.negativeVersions) {
    assert.ok(run.durationMs < 90_000, `${run.version} negative lane exceeded 90 seconds`);
    assert.equal(run.receipt.status, 'FAIL');
    assert.equal(
      run.receipt.capabilities.find(({ kind }) => kind === 'skill')?.status,
      'MISSING'
    );
    assert.equal(
      run.receipt.capabilities.find(({ kind }) => kind === 'hook')?.status,
      'DISCOVERED_UNTRUSTED'
    );
  }
});
