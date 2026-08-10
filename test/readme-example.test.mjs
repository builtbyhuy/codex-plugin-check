import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkPlugin } from '../src/check-plugin.mjs';
import { main } from '../src/cli.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureSource = path.join(repositoryRoot, 'test', 'fixtures', 'marketplace');

function shellBlockUnderHeading(markdown, expectedHeading) {
  const lines = markdown.split(/\r?\n/u);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/u);
    if (heading) {
      inSection = heading[2] === expectedHeading;
      continue;
    }
    if (!inSection || !/^```(?:sh|shell|bash)$/u.test(lines[index])) continue;
    const body = [];
    for (index += 1; index < lines.length && lines[index] !== '```'; index += 1) {
      body.push(lines[index]);
    }
    if (lines[index] !== '```') throw new Error(`Unclosed shell block under ${expectedHeading}`);
    return body.join('\n');
  }
  throw new Error(`Missing shell block under ${expectedHeading}`);
}

function parseDocumentedCommand(block) {
  const command = block.replace(/\\\r?\n\s*/gu, ' ').trim();
  if (/[;&|`$()]/u.test(command)) {
    throw new Error('README CLI example must be one literal command without shell expansion');
  }
  const tokens = command.split(/\s+/u);
  assert.deepEqual(tokens.slice(0, 2), ['node', './src/cli.mjs']);
  return tokens.slice(2);
}

function injectedCodexBoundary(marketplaceRoot) {
  const pluginRoot = path.join(marketplaceRoot, 'plugins', 'sample');
  const installedRoot = '/isolated/codex-home/plugins/cache/local-marketplace/sample/1.0.0';
  const pluginId = 'sample@local-marketplace';
  const hookKey = `${pluginId}:hooks/hooks.json:session_start:0:0`;
  const marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const isolatedEnvironment = {
    HOME: '/isolated/home',
    CODEX_HOME: '/isolated/codex-home',
    PATH: '/bin'
  };
  let commandIndex = 0;
  const expectedCommands = [
    ['plugin', 'marketplace', 'add', marketplaceRoot, '--json'],
    ['plugin', 'add', 'sample', '--marketplace', 'local-marketplace', '--json'],
    ['plugin', 'list', '--json']
  ];
  const commandResults = [
    {
      marketplaceName: 'local-marketplace',
      installedRoot: marketplaceRoot,
      alreadyAdded: false
    },
    {
      pluginId,
      name: 'sample',
      marketplaceName: 'local-marketplace',
      version: '1.0.0',
      installedPath: installedRoot,
      authPolicy: 'ON_USE'
    },
    {
      installed: [{
        pluginId,
        name: 'sample',
        marketplaceName: 'local-marketplace',
        version: '1.0.0',
        installed: true,
        enabled: true,
        source: { source: 'local', path: pluginRoot },
        marketplaceSource: { sourceType: 'local', source: marketplaceRoot },
        authPolicy: 'ON_USE'
      }],
      available: []
    }
  ];
  return {
    runCommand: async (invocation) => {
      assert.equal(invocation.command, 'codex');
      assert.deepEqual(invocation.args, expectedCommands[commandIndex]);
      assert.equal(invocation.cwd, marketplaceRoot);
      assert.deepEqual(invocation.env, isolatedEnvironment);
      return {
        stdout: `${JSON.stringify(commandResults[commandIndex++])}\n`,
        stderr: ''
      };
    },
    createIsolation: async (options) => {
      assert.deepEqual(options, {
        targetRoot: marketplaceRoot,
        receiptPath: path.join(path.dirname(marketplaceRoot), '..', '..', 'conformance.json'),
        mode: 'env',
        platform: process.platform,
        codexVersion: '0.147.0'
      });
      return {
        env: isolatedEnvironment,
        async assertCheckoutUnchanged() {},
        async cleanup() {}
      };
    },
    startAppServer: async (options) => {
      assert.equal(options.command, 'codex');
      assert.deepEqual(options.args, ['app-server', '--stdio', '--disable', 'remote_plugin']);
      assert.equal(options.cwd, marketplaceRoot);
      assert.deepEqual(options.env, isolatedEnvironment);
      return {
        async initialize() {},
        async request(method, params) {
          if (method === 'plugin/read') {
            assert.deepEqual(params, { pluginName: 'sample', marketplacePath });
            return {
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
                marketplacePath,
                skills: [{
                  name: 'sample:sample-skill',
                  description: 'Sample',
                  enabled: true,
                  path: path.join(pluginRoot, 'skills', 'sample-skill', 'SKILL.md')
                }],
                hooks: [{ key: hookKey, eventName: 'sessionStart' }],
                mcpServers: ['sample-mcp'],
                apps: [],
                appTemplates: []
              }
            };
          }
          if (method === 'skills/list') {
            assert.deepEqual(params, { cwds: [marketplaceRoot], forceReload: true });
            return {
              data: [{
                cwd: marketplaceRoot,
                errors: [],
                skills: [{
                  name: 'sample:sample-skill',
                  description: 'Sample',
                  enabled: true,
                  path: path.join(installedRoot, 'skills', 'sample-skill'),
                  scope: 'repo'
                }]
              }]
            };
          }
          if (method === 'hooks/list') {
            assert.deepEqual(params, { cwds: [marketplaceRoot] });
            return {
              data: [{
                cwd: marketplaceRoot,
                errors: [],
                warnings: [],
                hooks: [{
                  key: hookKey,
                  eventName: 'sessionStart',
                  source: 'plugin',
                  sourcePath: path.join(installedRoot, 'hooks', 'hooks.json'),
                  pluginId,
                  trustStatus: 'untrusted',
                  enabled: true,
                  handlerType: 'command',
                  command: '/must-not-run',
                  currentHash: 'fixture-hash',
                  displayOrder: 0,
                  isManaged: false,
                  matcher: null,
                  statusMessage: null,
                  timeoutSec: 10
                }]
              }]
            };
          }
          throw new Error(`README boundary rejected unexpected app-server method ${method}`);
        },
        async close() {}
      };
    }
  };
}

test('README CLI block executes against the synthetic marketplace through Codex boundaries', async (t) => {
  const temporaryRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'readme-cli-')));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const fixtureRoot = path.join(temporaryRoot, 'test', 'fixtures', 'marketplace');
  await mkdir(path.dirname(fixtureRoot), { recursive: true });
  await cp(fixtureSource, fixtureRoot, { recursive: true });

  const markdown = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  const argv = parseDocumentedCommand(shellBlockUnderHeading(markdown, 'CLI diagnostic example'));
  let stdout = '';
  let stderr = '';
  const code = await main(argv, {
    stdout: { write: (value) => { stdout += String(value); } },
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    cwd: temporaryRoot,
    runProcess: async (command, args, options) => {
      assert.equal(command, 'codex');
      assert.deepEqual(args, ['--version']);
      assert.equal(options.cwd, await realpath(fixtureRoot));
      assert.equal(options.shell, false);
      return { code: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' };
    },
    checkPlugin: async (options) => checkPlugin(
      options,
      injectedCodexBoundary(await realpath(fixtureRoot))
    )
  });

  const receipt = JSON.parse(await readFile(path.join(temporaryRoot, 'conformance.json'), 'utf8'));
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, 'codex-plugin-check: PASS (sample, Codex 0.147.0)\n');
  assert.deepEqual(receipt.capabilities.map(({ kind, status }) => ({ kind, status })), [
    { kind: 'hook', status: 'DISCOVERED_UNTRUSTED' },
    { kind: 'mcp', status: 'DECLARED_ONLY' },
    { kind: 'skill', status: 'DISCOVERED_EFFECTIVE' }
  ]);
  assert.deepEqual(receipt.isolation, {
    mode: 'env',
    network: 'not_enforced',
    hostState: 'not_enforced'
  });
});
