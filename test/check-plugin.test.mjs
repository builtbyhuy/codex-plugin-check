import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPlugin, resolveMarketplaceManifestPath } from '../src/check-plugin.mjs';

const fixtureRoot = fileURLToPath(new URL('./fixtures/marketplace', import.meta.url));
const pluginRoot = path.join(fixtureRoot, 'plugins', 'sample');
const manifestPath = path.join(fixtureRoot, '.agents', 'plugins', 'marketplace.json');
const installedRoot = '/isolated/codex-home/plugins/cache/local-marketplace/sample/1.0.0';
const pluginId = 'sample@local-marketplace';
const env = { HOME: '/isolated/home', PATH: '/test/bin' };

function successfulResponses() {
  return {
    marketplace: {
      marketplaceName: 'local-marketplace',
      installedRoot: fixtureRoot,
      alreadyAdded: false
    },
    install: {
      pluginId,
      name: 'sample',
      marketplaceName: 'local-marketplace',
      version: '1.0.0',
      installedPath: installedRoot,
      authPolicy: 'ON_USE'
    },
    list: {
      installed: [{
        pluginId,
        name: 'sample',
        marketplaceName: 'local-marketplace',
        version: '1.0.0',
        installed: true,
        enabled: true,
        source: { source: 'local', path: pluginRoot },
        marketplaceSource: { sourceType: 'local', source: fixtureRoot },
        authPolicy: 'ON_USE'
      }],
      available: []
    },
    plugin: {
      plugin: {
        summary: {
          id: pluginId,
          name: 'sample',
          installed: true,
          enabled: true,
          localVersion: '1.0.0',
          source: { type: 'local', path: pluginRoot },
          authPolicy: 'ON_USE',
          installPolicy: 'AVAILABLE'
        },
        marketplaceName: 'local-marketplace',
        marketplacePath: manifestPath,
        skills: [{ name: 'sample:sample-skill', description: 'Sample', enabled: true, path: path.join(pluginRoot, 'skills', 'sample-skill', 'SKILL.md') }],
        hooks: [{ key: 'sample@local-marketplace:hooks/hooks.json:session_start:0:0', eventName: 'sessionStart' }],
        mcpServers: ['sample-mcp'],
        apps: [{ id: 'sample-app', name: 'Sample App' }],
        appTemplates: []
      }
    },
    skills: {
      data: [
        { cwd: fixtureRoot, errors: [], skills: [] },
        { cwd: fixtureRoot, errors: [], skills: [{ name: 'sample:sample-skill', description: 'Sample', enabled: true, path: path.join(installedRoot, 'skills', 'sample-skill'), scope: 'repo' }] }
      ]
    },
    hooks: {
      data: [{
        cwd: fixtureRoot,
        errors: [],
        warnings: [],
        hooks: [{
          key: 'sample@local-marketplace:hooks/hooks.json:session_start:0:0', eventName: 'sessionStart', source: 'plugin',
          sourcePath: path.join(installedRoot, 'hooks', 'hooks.json'), pluginId,
          trustStatus: 'trusted', enabled: true, handlerType: 'command',
          command: 'nonexistent-sample-hook', currentHash: 'abc', displayOrder: 0,
          isManaged: false, matcher: null, statusMessage: null, timeoutSec: 10
        }]
      }]
    }
  };
}

function harness(overrides = {}, failures = {}) {
  const responses = { ...successfulResponses(), ...overrides };
  const commands = [];
  const requests = [];
  const lifecycle = [];
  const events = [];
  let commandIndex = 0;
  const commandOutputs = [
    JSON.stringify(responses.marketplace),
    JSON.stringify(responses.install),
    JSON.stringify(responses.list)
  ];
  const dependencies = {
    runCommand: async (invocation) => {
      commands.push(invocation);
      events.push(['command', invocation]);
      return { stdout: commandOutputs[commandIndex++], stderr: '' };
    },
    startAppServer: async (options) => {
      lifecycle.push(['start', options]);
      events.push(['start']);
      return {
        initialize: async () => {
          lifecycle.push(['initialize']);
          events.push(['initialize']);
        },
        request: async (method, params) => {
          requests.push([method, params]);
          events.push(['request', method, params]);
          if (method === failures.requestMethod) throw new Error('primary request failure');
          return { 'plugin/read': responses.plugin, 'skills/list': responses.skills, 'hooks/list': responses.hooks }[method];
        },
        close: async () => {
          lifecycle.push(['close']);
          events.push(['close']);
          if (failures.close) throw new Error('close failure');
        }
      };
    },
    createIsolation: async (options) => {
      lifecycle.push(['isolation', options]);
      return {
        env,
        wrap() { throw new Error('checkPlugin must use direct commands'); },
        async assertCheckoutUnchanged() {
          lifecycle.push(['assertCheckoutUnchanged']);
          events.push(['assertCheckoutUnchanged']);
          if (failures.assert) throw new Error('assert failure');
        },
        async cleanup() {
          lifecycle.push(['cleanup']);
          events.push(['cleanup']);
          if (failures.cleanup) throw new Error('cleanup failure');
        }
      };
    }
  };
  return { commands, dependencies, events, lifecycle, requests };
}

const options = {
  marketplaceRoot: fixtureRoot,
  plugin: 'sample',
  codex: '/opt/codex',
  codexVersion: '0.147.0',
  cwd: '/different/workspace',
  output: 'receipt.json',
  isolation: 'env',
  platform: 'darwin',
  architecture: 'arm64'
};

test('runs the exact Codex command and app-server discovery sequence', async () => {
  const observed = harness();
  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(observed.events, [
    ['command', { command: '/opt/codex', args: ['plugin', 'marketplace', 'add', fixtureRoot, '--json'], cwd: '/different/workspace', env }],
    ['command', { command: '/opt/codex', args: ['plugin', 'add', 'sample', '--marketplace', 'local-marketplace', '--json'], cwd: '/different/workspace', env }],
    ['command', { command: '/opt/codex', args: ['plugin', 'list', '--json'], cwd: '/different/workspace', env }],
    ['start'],
    ['initialize'],
    ['request', 'plugin/read', { pluginName: 'sample', marketplacePath: manifestPath }],
    ['request', 'skills/list', { cwds: [fixtureRoot], forceReload: true }],
    ['request', 'hooks/list', { cwds: [fixtureRoot] }],
    ['close'],
    ['assertCheckoutUnchanged'],
    ['cleanup']
  ]);
  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.plugin, { name: 'sample', marketplace: 'local-marketplace', sourceRoot: fixtureRoot });
  assert.deepEqual(observed.lifecycle.map(([name]) => name), [
    'isolation', 'start', 'initialize', 'close', 'assertCheckoutUnchanged', 'cleanup'
  ]);
});

test('canonicalizes a symlink marketplace root across every Codex boundary', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-symlink-'));
  const linkedRoot = path.join(temporaryRoot, 'marketplace');
  await symlink(fixtureRoot, linkedRoot, 'dir');
  try {
    const observed = harness();
    const receipt = await checkPlugin(
      { ...options, marketplaceRoot: linkedRoot, cwd: undefined },
      observed.dependencies
    );

    assert.deepEqual(observed.lifecycle[0], ['isolation', {
      targetRoot: fixtureRoot,
      receiptPath: 'receipt.json',
      mode: 'env',
      platform: 'darwin',
      codexVersion: '0.147.0'
    }]);
    assert.deepEqual(observed.commands.map(({ args, cwd }) => ({ args, cwd })), [
      { args: ['plugin', 'marketplace', 'add', fixtureRoot, '--json'], cwd: fixtureRoot },
      { args: ['plugin', 'add', 'sample', '--marketplace', 'local-marketplace', '--json'], cwd: fixtureRoot },
      { args: ['plugin', 'list', '--json'], cwd: fixtureRoot }
    ]);
    assert.equal(observed.lifecycle.find(([name]) => name === 'start')[1].cwd, fixtureRoot);
    assert.deepEqual(observed.requests, [
      ['plugin/read', { pluginName: 'sample', marketplacePath: manifestPath }],
      ['skills/list', { cwds: [fixtureRoot], forceReload: true }],
      ['hooks/list', { cwds: [fixtureRoot] }]
    ]);
    assert.equal(receipt.plugin.sourceRoot, fixtureRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('resolves a Claude-compatible marketplace when earlier Codex layouts are absent', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-manifest-'));
  const claudeDirectory = path.join(temporaryRoot, '.claude-plugin');
  const claudeManifest = path.join(claudeDirectory, 'marketplace.json');
  await mkdir(claudeDirectory, { recursive: true });
  await writeFile(
    claudeManifest,
    '{"name":"local-marketplace","plugins":[]}\n'
  );
  try {
    assert.equal(
      await resolveMarketplaceManifestPath(temporaryRoot, 'local-marketplace'),
      await realpath(claudeManifest)
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('mirrors released Codex marketplace-layout precedence when manifests overlap', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-manifest-'));
  const agentsDirectory = path.join(temporaryRoot, '.agents', 'plugins');
  const claudeDirectory = path.join(temporaryRoot, '.claude-plugin');
  const agentsManifest = path.join(agentsDirectory, 'marketplace.json');
  await mkdir(agentsDirectory, { recursive: true });
  await mkdir(claudeDirectory, { recursive: true });
  await writeFile(agentsManifest, '{"name":"local-marketplace","plugins":[]}\n');
  await writeFile(
    path.join(claudeDirectory, 'marketplace.json'),
    '{"name":"local-marketplace","plugins":[]}\n'
  );
  try {
    assert.equal(
      await resolveMarketplaceManifestPath(temporaryRoot, 'local-marketplace'),
      await realpath(agentsManifest)
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects identity drift in the first marketplace layout Codex would select', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-manifest-'));
  const agentsDirectory = path.join(temporaryRoot, '.agents', 'plugins');
  const claudeDirectory = path.join(temporaryRoot, '.claude-plugin');
  await mkdir(agentsDirectory, { recursive: true });
  await mkdir(claudeDirectory, { recursive: true });
  await writeFile(
    path.join(agentsDirectory, 'marketplace.json'),
    '{"name":"different-marketplace","plugins":[]}\n'
  );
  await writeFile(
    path.join(claudeDirectory, 'marketplace.json'),
    '{"name":"local-marketplace","plugins":[]}\n'
  );
  try {
    await assert.rejects(
      resolveMarketplaceManifestPath(temporaryRoot, 'local-marketplace'),
      /identity did not match Codex marketplace output/
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('supports Codex API and Cursor-compatible marketplace layouts', async () => {
  for (const relativePath of [
    path.join('.agents', 'plugins', 'api_marketplace.json'),
    path.join('.cursor-plugin', 'marketplace.json')
  ]) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-manifest-'));
    const manifestPath = path.join(temporaryRoot, relativePath);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, '{"name":"local-marketplace","plugins":[]}\n');
    try {
      assert.equal(
        await resolveMarketplaceManifestPath(temporaryRoot, 'local-marketplace'),
        await realpath(manifestPath)
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('rejects a matching marketplace manifest symlink that escapes the checkout', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-manifest-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-outside-'));
  const outsideManifest = path.join(outsideRoot, 'marketplace.json');
  const agentsDirectory = path.join(temporaryRoot, '.agents', 'plugins');
  await mkdir(agentsDirectory, { recursive: true });
  await writeFile(outsideManifest, '{"name":"local-marketplace","plugins":[]}\n');
  await symlink(outsideManifest, path.join(agentsDirectory, 'marketplace.json'));
  let reads = 0;
  try {
    await assert.rejects(
      resolveMarketplaceManifestPath(temporaryRoot, 'local-marketplace', {
        async readFile() {
          reads += 1;
          throw new Error('outside manifest must not be read');
        }
      }),
      /escaped the marketplace root/
    );
    assert.equal(reads, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test('requests plugin evidence from the resolved marketplace manifest', async () => {
  const claudeManifest = path.join(fixtureRoot, '.claude-plugin', 'marketplace.json');
  const responses = successfulResponses();
  responses.plugin.plugin.marketplacePath = claudeManifest;
  const observed = harness({ plugin: responses.plugin });
  observed.dependencies.resolveMarketplaceManifestPath = async (root, name) => {
    assert.equal(root, fixtureRoot);
    assert.equal(name, 'local-marketplace');
    return claudeManifest;
  };

  await checkPlugin(options, observed.dependencies);

  assert.deepEqual(observed.requests[0], [
    'plugin/read',
    { pluginName: 'sample', marketplacePath: claudeManifest }
  ]);
});

test('rejects install JSON that lacks Codex-owned install evidence', async () => {
  const observed = harness({ install: { name: 'sample', marketplaceName: 'local-marketplace' } });

  await assert.rejects(
    checkPlugin(options, observed.dependencies),
    /Codex plugin add returned invalid install JSON/
  );
  assert.equal(observed.lifecycle.some(([name]) => name === 'start'), false);
  assert.deepEqual(observed.lifecycle.slice(-2).map(([name]) => name), [
    'assertCheckoutUnchanged', 'cleanup'
  ]);
});

test('rejects marketplace JSON that points at a different installed root', async () => {
  const observed = harness({
    marketplace: {
      marketplaceName: 'local-marketplace',
      installedRoot: '/different/marketplace',
      alreadyAdded: false
    }
  });

  await assert.rejects(
    checkPlugin(options, observed.dependencies),
    /Codex marketplace add returned invalid marketplace JSON/
  );
  assert.equal(observed.commands.length, 1);
  assert.deepEqual(observed.lifecycle.slice(-2).map(([name]) => name), [
    'assertCheckoutUnchanged', 'cleanup'
  ]);
});

test('rejects a plugin list source that does not identify the requested checkout', async () => {
  const responses = successfulResponses();
  responses.list.installed[0].marketplaceSource.source = '/different/checkout';
  const observed = harness({ list: responses.list });

  await assert.rejects(
    checkPlugin(options, observed.dependencies),
    /installed plugin source does not match the requested marketplace/
  );
  assert.equal(observed.lifecycle.some(([name]) => name === 'start'), false);
});

test('rejects plugin/read identity that disagrees with CLI evidence', async () => {
  for (const mutate of [
    (plugin) => { plugin.summary.id = 'different@local-marketplace'; },
    (plugin) => { plugin.summary.name = 'different'; },
    (plugin) => { plugin.marketplaceName = 'different-marketplace'; }
  ]) {
    const responses = successfulResponses();
    mutate(responses.plugin.plugin);
    const observed = harness({ plugin: responses.plugin });
    await assert.rejects(
      checkPlugin(options, observed.dependencies),
      /plugin\/read evidence does not match the installed plugin/
    );
  }
});

test('rejects plugin/read when Codex does not report installed and enabled', async () => {
  for (const field of ['installed', 'enabled']) {
    const responses = successfulResponses();
    responses.plugin.plugin.summary[field] = false;
    const observed = harness({ plugin: responses.plugin });
    await assert.rejects(
      checkPlugin(options, observed.dependencies),
      /plugin\/read evidence does not match the installed plugin/
    );
  }
});

test('rejects plugin/read for a different marketplace manifest path', async () => {
  const responses = successfulResponses();
  responses.plugin.plugin.marketplacePath = path.join(fixtureRoot, 'marketplace.json');
  const observed = harness({ plugin: responses.plugin });

  await assert.rejects(
    checkPlugin(options, observed.dependencies),
    /plugin\/read evidence does not match the installed plugin/
  );
});

test('rejects plugin/read source that disagrees with the listed checkout source', async () => {
  for (const source of [
    { type: 'git', path: pluginRoot },
    { type: 'local', path: path.join(fixtureRoot, 'plugins', 'different') }
  ]) {
    const responses = successfulResponses();
    responses.plugin.plugin.summary.source = source;
    const observed = harness({ plugin: responses.plugin });
    await assert.rejects(
      checkPlugin(options, observed.dependencies),
      /plugin\/read evidence does not match the installed plugin/
    );
  }
});

test('rejects plugin/read local version that disagrees with install evidence', async () => {
  const responses = successfulResponses();
  responses.plugin.plugin.summary.localVersion = '2.0.0';
  const observed = harness({ plugin: responses.plugin });

  await assert.rejects(
    checkPlugin(options, observed.dependencies),
    /plugin\/read evidence does not match the installed plugin/
  );
});

test('marks a declared skill missing when no skills/list entry exposes it', async () => {
  const observed = harness({ skills: { data: [{ cwd: fixtureRoot, errors: [], skills: [] }] } });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities.find(({ kind }) => kind === 'skill'), {
    kind: 'skill', key: 'sample:sample-skill', source: 'plugin/read + skills/list', status: 'MISSING'
  });
});

test('disables a declared skill through released Codex before observing negative discovery', async () => {
  const responses = successfulResponses();
  responses.skills.data[1].skills[0].enabled = false;
  responses.hooks.data[0].hooks[0].trustStatus = 'untrusted';
  const observed = harness({ skills: responses.skills, hooks: responses.hooks });

  const receipt = await checkPlugin({
    ...options,
    disabledSkills: ['sample:sample-skill']
  }, observed.dependencies);

  assert.deepEqual(observed.requests.slice(0, 4), [
    ['plugin/read', { pluginName: 'sample', marketplacePath: manifestPath }],
    ['skills/config/write', {
      path: null,
      name: 'sample:sample-skill',
      enabled: false
    }],
    ['skills/list', { cwds: [fixtureRoot], forceReload: true }],
    ['hooks/list', { cwds: [fixtureRoot] }]
  ]);
  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(
    receipt.capabilities.map(({ kind, status }) => ({ kind, status })),
    [
      { kind: 'app', status: 'DECLARED_ONLY' },
      { kind: 'hook', status: 'DISCOVERED_UNTRUSTED' },
      { kind: 'mcp', status: 'DECLARED_ONLY' },
      { kind: 'skill', status: 'MISSING' }
    ]
  );
});

test('does not let an unrelated same-name skill satisfy plugin discovery', async () => {
  const responses = successfulResponses();
  responses.skills.data = [{
    cwd: fixtureRoot,
    errors: [],
    skills: [{
      name: 'sample:sample-skill',
      description: 'Unrelated',
      enabled: true,
      path: '/unrelated/cache/sample-skill/SKILL.md',
      scope: 'user'
    }]
  }];
  const observed = harness({ skills: responses.skills });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(receipt.capabilities.find(({ kind }) => kind === 'skill'), {
    kind: 'skill', key: 'sample:sample-skill', source: 'plugin/read + skills/list', status: 'MISSING'
  });
});

test('keeps a matching untrusted plugin hook distinct without executing it', async () => {
  const responses = successfulResponses();
  responses.hooks.data[0].hooks[0].trustStatus = 'untrusted';
  responses.hooks.data[0].hooks.unshift({
    ...responses.hooks.data[0].hooks[0],
    source: 'project',
    sourcePath: path.join(fixtureRoot, 'hooks.json'),
    trustStatus: 'trusted'
  });
  const observed = harness({ hooks: responses.hooks });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(receipt.capabilities.find(({ kind }) => kind === 'hook'), {
    kind: 'hook', key: 'sample@local-marketplace:hooks/hooks.json:session_start:0:0',
    source: 'plugin/read + hooks/list', status: 'DISCOVERED_UNTRUSTED'
  });
  assert.equal(receipt.status, 'PASS');
  assert.equal(observed.commands.some(({ args }) => args.includes('nonexistent-sample-hook')), false);
});

test('requires exact plugin hook identity and an installed-cache source path', async () => {
  const responses = successfulResponses();
  const valid = responses.hooks.data[0].hooks[0];
  responses.hooks.data[0].hooks = [
    { ...valid, pluginId: 'different@local-marketplace' },
    { ...valid, sourcePath: '/unrelated/cache/hooks/hooks.json' },
    { ...valid, source: 'project' }
  ];
  const observed = harness({ hooks: responses.hooks });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(receipt.capabilities.find(({ kind }) => kind === 'hook'), {
    kind: 'hook', key: 'sample@local-marketplace:hooks/hooks.json:session_start:0:0',
    source: 'plugin/read + hooks/list', status: 'MISSING'
  });
});

test('does not count disabled skill or hook registry entries as effective', async () => {
  const responses = successfulResponses();
  responses.skills.data[1].skills[0].enabled = false;
  responses.hooks.data[0].hooks[0].enabled = false;
  const observed = harness({ skills: responses.skills, hooks: responses.hooks });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(
    receipt.capabilities
      .filter(({ kind }) => kind === 'skill' || kind === 'hook')
      .map(({ kind, status }) => ({ kind, status })),
    [
      { kind: 'hook', status: 'MISSING' },
      { kind: 'skill', status: 'MISSING' }
    ]
  );
});

test('reports app and MCP declarations as declared-only without runtime calls', async () => {
  const observed = harness();

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(receipt.capabilities.filter(({ kind }) => kind === 'app' || kind === 'mcp'), [
    { kind: 'app', key: 'sample-app', source: 'plugin/read', status: 'DECLARED_ONLY' },
    { kind: 'mcp', key: 'sample-mcp', source: 'plugin/read', status: 'DECLARED_ONLY' }
  ]);
  assert.deepEqual(observed.requests.map(([method]) => method), ['plugin/read', 'skills/list', 'hooks/list']);
});

test('does not claim network or host-state enforcement in env mode', async () => {
  const observed = harness();

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(receipt.isolation, {
    mode: 'env', network: 'not_enforced', hostState: 'not_enforced'
  });
});

test('rejects strict mode before isolation or process dependencies can run', async () => {
  const calls = [];
  const dependencies = {
    createIsolation: async () => { calls.push('createIsolation'); },
    runCommand: async () => { calls.push('runCommand'); },
    startAppServer: async () => { calls.push('startAppServer'); }
  };

  await assert.rejects(
    checkPlugin({ ...options, isolation: 'strict' }, dependencies),
    /checkPlugin only supports env isolation/
  );
  assert.deepEqual(calls, []);
});

test('preserves the primary failure while attempting every finalizer', async () => {
  const observed = harness({}, {
    requestMethod: 'skills/list', close: true, assert: true, cleanup: true
  });

  await assert.rejects(checkPlugin(options, observed.dependencies), /primary request failure/);
  assert.deepEqual(observed.lifecycle.slice(-3).map(([name]) => name), [
    'close', 'assertCheckoutUnchanged', 'cleanup'
  ]);
});
