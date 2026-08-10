import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, evaluateCapability, exitCodeForStatus } from '../src/receipt.mjs';

test('sorts capabilities and distinguishes untrusted discovery', () => {
  const receipt = buildReceipt({
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    declarations: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', eventName: 'stop' }],
      mcpServers: ['server-a'],
      apps: []
    },
    effective: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', trustStatus: 'untrusted' }]
    },
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });

  assert.deepEqual(receipt.capabilities.map(({ kind, key, status }) => ({ kind, key, status })), [
    { kind: 'hook', key: 'alpha', status: 'DISCOVERED_UNTRUSTED' },
    { kind: 'mcp', key: 'server-a', status: 'DECLARED_ONLY' },
    { kind: 'skill', key: 'zeta', status: 'DISCOVERED_EFFECTIVE' }
  ]);
  assert.equal(receipt.status, 'PASS');
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
    declaration: { name: 'receipt' },
    effective: { name: 'receipt' },
    status: 'DISCOVERED_EFFECTIVE'
  });
});
