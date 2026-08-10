import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPlugin } from '../src/check-plugin.mjs';

const fixtureRoot = fileURLToPath(new URL('./fixtures/marketplace', import.meta.url));
const pluginRoot = path.join(fixtureRoot, 'plugins', 'sample');
const pluginId = 'sample@local-marketplace';
const env = { HOME: '/isolated/home', PATH: '/test/bin' };

function successfulResponses() {
  return {
    install: {
      pluginId,
      name: 'sample',
      marketplaceName: 'local-marketplace',
      version: '1.0.0',
      installedPath: pluginRoot,
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
          source: { type: 'local', path: pluginRoot },
          authPolicy: 'ON_USE',
          installPolicy: 'AVAILABLE'
        },
        marketplaceName: 'local-marketplace',
        marketplacePath: fixtureRoot,
        skills: [{ name: 'sample-skill', description: 'Sample', enabled: true, path: path.join(pluginRoot, 'skills', 'sample-skill') }],
        hooks: [{ key: 'sample-hook', eventName: 'sessionStart' }],
        mcpServers: ['sample-mcp'],
        apps: [{ id: 'sample-app', name: 'Sample App' }],
        appTemplates: []
      }
    },
    skills: {
      data: [
        { cwd: fixtureRoot, errors: [], skills: [] },
        { cwd: fixtureRoot, errors: [], skills: [{ name: 'sample-skill', description: 'Sample', enabled: true, path: path.join(pluginRoot, 'skills', 'sample-skill'), scope: 'repo' }] }
      ]
    },
    hooks: {
      data: [{
        cwd: fixtureRoot,
        errors: [],
        warnings: [],
        hooks: [{
          key: 'sample-hook', eventName: 'sessionStart', source: 'plugin',
          sourcePath: path.join(pluginRoot, 'hooks', 'hooks.json'), pluginId,
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
  let commandIndex = 0;
  const commandOutputs = ['', JSON.stringify(responses.install), JSON.stringify(responses.list)];
  const dependencies = {
    runCommand: async (invocation) => {
      commands.push(invocation);
      return { stdout: commandOutputs[commandIndex++], stderr: '' };
    },
    startAppServer: async (options) => {
      lifecycle.push(['start', options]);
      return {
        initialize: async () => lifecycle.push(['initialize']),
        request: async (method, params) => {
          requests.push([method, params]);
          if (method === failures.requestMethod) throw new Error('primary request failure');
          return { 'plugin/read': responses.plugin, 'skills/list': responses.skills, 'hooks/list': responses.hooks }[method];
        },
        close: async () => {
          lifecycle.push(['close']);
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
          if (failures.assert) throw new Error('assert failure');
        },
        async cleanup() {
          lifecycle.push(['cleanup']);
          if (failures.cleanup) throw new Error('cleanup failure');
        }
      };
    }
  };
  return { commands, dependencies, lifecycle, requests };
}

const options = {
  marketplaceRoot: fixtureRoot,
  plugin: 'sample',
  codex: '/opt/codex',
  codexVersion: '0.147.0',
  cwd: fixtureRoot,
  output: 'receipt.json',
  isolation: 'env',
  platform: 'darwin',
  architecture: 'arm64'
};

test('runs the exact Codex command and app-server discovery sequence', async () => {
  const observed = harness();
  const receipt = await checkPlugin(options, observed.dependencies);

  assert.deepEqual(observed.commands, [
    { command: '/opt/codex', args: ['plugin', 'marketplace', 'add', fixtureRoot], cwd: fixtureRoot, env },
    { command: '/opt/codex', args: ['plugin', 'add', 'sample', '--json'], cwd: fixtureRoot, env },
    { command: '/opt/codex', args: ['plugin', 'list', '--json'], cwd: fixtureRoot, env }
  ]);
  assert.deepEqual(observed.requests, [
    ['plugin/read', { pluginName: 'sample', marketplacePath: fixtureRoot }],
    ['skills/list', { cwds: [fixtureRoot], forceReload: true }],
    ['hooks/list', { cwds: [fixtureRoot] }]
  ]);
  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.plugin, { name: 'sample', marketplace: 'local-marketplace', sourceRoot: fixtureRoot });
  assert.deepEqual(observed.lifecycle.map(([name]) => name), [
    'isolation', 'start', 'initialize', 'close', 'assertCheckoutUnchanged', 'cleanup'
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

test('marks a declared skill missing when no skills/list entry exposes it', async () => {
  const observed = harness({ skills: { data: [{ cwd: fixtureRoot, errors: [], skills: [] }] } });

  const receipt = await checkPlugin(options, observed.dependencies);

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities.find(({ kind }) => kind === 'skill'), {
    kind: 'skill', key: 'sample-skill', source: 'plugin/read + skills/list', status: 'MISSING'
  });
});

test('keeps a matching untrusted plugin hook distinct without executing it', async () => {
  const responses = successfulResponses();
  responses.hooks.data[0].hooks[0].pluginId = null;
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
    kind: 'hook', key: 'sample-hook', source: 'plugin/read + hooks/list', status: 'DISCOVERED_UNTRUSTED'
  });
  assert.equal(receipt.status, 'PASS');
  assert.equal(observed.commands.some(({ args }) => args.includes('nonexistent-sample-hook')), false);
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

test('preserves the primary failure while attempting every finalizer', async () => {
  const observed = harness({}, {
    requestMethod: 'skills/list', close: true, assert: true, cleanup: true
  });

  await assert.rejects(checkPlugin(options, observed.dependencies), /primary request failure/);
  assert.deepEqual(observed.lifecycle.slice(-3).map(([name]) => name), [
    'close', 'assertCheckoutUnchanged', 'cleanup'
  ]);
});
