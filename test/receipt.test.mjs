import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, evaluateCapability, exitCodeForStatus } from '../src/receipt.mjs';

test('serializes the complete deterministic receipt contract', () => {
  const receipt = buildReceipt({
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    declarations: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', eventName: 'stop' }],
      mcpServers: ['server-a'],
      apps: [{ id: 'app-a' }]
    },
    effective: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', trustStatus: 'untrusted' }]
    },
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });

  assert.deepEqual(receipt, {
    schemaVersion: '0.1.0',
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' },
    capabilities: [
      { kind: 'app', key: 'app-a', source: 'plugin/read', status: 'DECLARED_ONLY' },
      { kind: 'hook', key: 'alpha', source: 'plugin/read + hooks/list', status: 'DISCOVERED_UNTRUSTED' },
      { kind: 'mcp', key: 'server-a', source: 'plugin/read', status: 'DECLARED_ONLY' },
      { kind: 'skill', key: 'zeta', source: 'plugin/read + skills/list', status: 'DISCOVERED_EFFECTIVE' }
    ],
    status: 'PASS'
  });
});

test('maps stable run statuses to exit codes', () => {
  assert.deepEqual(['PASS', 'FAIL', 'TOOL_ERROR', 'INCONCLUSIVE', 'ISOLATION_VIOLATION'].map(exitCodeForStatus), [0, 1, 2, 3, 4]);
});

test('fails the receipt when a declared skill or hook is missing from discovery', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'missing-skill' }],
      hooks: [{ key: 'missing-hook' }]
    },
    effective: { skills: [], hooks: [] }
  });

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities.map(({ kind, key, status }) => ({ kind, key, status })), [
    { kind: 'hook', key: 'missing-hook', status: 'MISSING' },
    { kind: 'skill', key: 'missing-skill', status: 'MISSING' }
  ]);
});

test('marks omitted and null effective registries unobservable', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'unobserved-skill' }],
      hooks: [{ key: 'unobserved-hook' }]
    },
    effective: { hooks: null }
  });

  assert.equal(receipt.status, 'INCONCLUSIVE');
  assert.deepEqual(receipt.capabilities, [
    {
      kind: 'hook',
      key: 'unobserved-hook',
      source: 'plugin/read + hooks/list',
      status: 'UNOBSERVABLE'
    },
    {
      kind: 'skill',
      key: 'unobserved-skill',
      source: 'plugin/read + skills/list',
      status: 'UNOBSERVABLE'
    }
  ]);
});

test('fails when an observed capability is missing despite another unobservable registry', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'missing-skill' }],
      hooks: [{ key: 'unobserved-hook' }]
    },
    effective: { skills: [] }
  });

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities.map(({ kind, key, status }) => ({ kind, key, status })), [
    { kind: 'hook', key: 'unobserved-hook', status: 'UNOBSERVABLE' },
    { kind: 'skill', key: 'missing-skill', status: 'MISSING' }
  ]);
});

test('normalizes app and MCP declarations without asserting runtime behavior', () => {
  const receipt = buildReceipt({
    declarations: {
      mcpServers: ['z-server', 'a-server'],
      apps: [{ id: 'z-app' }, { id: 'a-app' }]
    },
    effective: {
      apps: [{ id: 'a-app' }]
    }
  });

  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.capabilities.map(({ kind, key, status }) => ({ kind, key, status })), [
    { kind: 'app', key: 'a-app', status: 'DECLARED_ONLY' },
    { kind: 'app', key: 'z-app', status: 'DECLARED_ONLY' },
    { kind: 'mcp', key: 'a-server', status: 'DECLARED_ONLY' },
    { kind: 'mcp', key: 'z-server', status: 'DECLARED_ONLY' }
  ]);
});

test('evaluates a trusted discovered skill from a plain JSON record', () => {
  assert.deepEqual(evaluateCapability({
    kind: 'skill',
    key: 'receipt',
    declaration: { name: 'receipt' },
    effectiveMatch: { name: 'receipt' }
  }), {
    kind: 'skill',
    key: 'receipt',
    source: 'plugin/read + skills/list',
    status: 'DISCOVERED_EFFECTIVE'
  });
});
