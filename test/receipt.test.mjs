import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, evaluateCapability, exitCodeForStatus } from '../src/receipt.mjs';

test('maps stable run statuses to exit codes', () => {
  assert.deepEqual(
    ['PASS', 'FAIL', 'TOOL_ERROR', 'INCONCLUSIVE', 'ISOLATION_VIOLATION'].map(exitCodeForStatus),
    [0, 1, 2, 3, 4]
  );
});

test('keeps MCP and app declarations declaration-only', () => {
  assert.deepEqual([
    evaluateCapability({ kind: 'mcp', key: 'server-a', declaration: 'server-a' }),
    evaluateCapability({ kind: 'app', key: 'app-a', declaration: { id: 'app-a' } })
  ], [
    { kind: 'mcp', key: 'server-a', source: 'plugin/read', status: 'DECLARED_ONLY' },
    { kind: 'app', key: 'app-a', source: 'plugin/read', status: 'DECLARED_ONLY' }
  ]);
});

test('marks a trusted discovered skill effective', () => {
  assert.deepEqual(evaluateCapability({
    kind: 'skill',
    key: 'skill-a',
    declaration: { name: 'skill-a' },
    effectiveMatch: { name: 'skill-a' }
  }), {
    kind: 'skill',
    key: 'skill-a',
    source: 'plugin/read + skills/list',
    status: 'DISCOVERED_EFFECTIVE'
  });
});

test('distinguishes an untrusted discovered hook', () => {
  assert.deepEqual(evaluateCapability({
    kind: 'hook',
    key: 'hook-a',
    declaration: { key: 'hook-a' },
    effectiveMatch: { key: 'hook-a', trustStatus: 'untrusted' }
  }), {
    kind: 'hook',
    key: 'hook-a',
    source: 'plugin/read + hooks/list',
    status: 'DISCOVERED_UNTRUSTED'
  });
});

test('marks a trusted discovered hook effective', () => {
  assert.deepEqual(evaluateCapability({
    kind: 'hook',
    key: 'hook-a',
    declaration: { key: 'hook-a' },
    effectiveMatch: { key: 'hook-a', trustStatus: 'trusted' }
  }), {
    kind: 'hook',
    key: 'hook-a',
    source: 'plugin/read + hooks/list',
    status: 'DISCOVERED_EFFECTIVE'
  });
});

test('marks absent entries in observed skill and hook registries missing', () => {
  assert.deepEqual([
    evaluateCapability({ kind: 'skill', key: 'skill-a', declaration: { name: 'skill-a' } }),
    evaluateCapability({ kind: 'hook', key: 'hook-a', declaration: { key: 'hook-a' } })
  ], [
    { kind: 'skill', key: 'skill-a', source: 'plugin/read + skills/list', status: 'MISSING' },
    { kind: 'hook', key: 'hook-a', source: 'plugin/read + hooks/list', status: 'MISSING' }
  ]);
});

test('marks unobserved skill and hook registries unobservable from plugin declarations only', () => {
  assert.deepEqual([
    evaluateCapability({
      kind: 'skill',
      key: 'skill-a',
      declaration: { name: 'skill-a' },
      effectiveMatch: null
    }),
    evaluateCapability({
      kind: 'hook',
      key: 'hook-a',
      declaration: { key: 'hook-a' },
      effectiveMatch: null
    })
  ], [
    { kind: 'skill', key: 'skill-a', source: 'plugin/read', status: 'UNOBSERVABLE' },
    { kind: 'hook', key: 'hook-a', source: 'plugin/read', status: 'UNOBSERVABLE' }
  ]);
});

test('selects capability keys by kind and matches effective registry entries', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'skill-a' }],
      hooks: [{ key: 'hook-a' }],
      mcpServers: ['server-a'],
      apps: [{ id: 'app-a' }]
    },
    effective: {
      skills: [{ name: 'skill-a' }],
      hooks: [{ key: 'hook-a', trustStatus: 'trusted' }]
    }
  });

  assert.deepEqual(Object.fromEntries(
    receipt?.capabilities?.map(({ kind, key, status }) => [kind, { key, status }]) ?? []
  ), {
    skill: { key: 'skill-a', status: 'DISCOVERED_EFFECTIVE' },
    hook: { key: 'hook-a', status: 'DISCOVERED_EFFECTIVE' },
    mcp: { key: 'server-a', status: 'DECLARED_ONLY' },
    app: { key: 'app-a', status: 'DECLARED_ONLY' }
  });
});

test('serializes the complete schema and sorts capabilities by kind then key', () => {
  const receipt = buildReceipt({
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    declarations: {
      skills: [{ name: 'zeta' }, { name: 'alpha' }],
      hooks: [{ key: 'beta' }],
      mcpServers: ['gamma'],
      apps: [{ id: 'omega' }]
    },
    effective: {
      skills: [{ name: 'zeta' }, { name: 'alpha' }],
      hooks: [{ key: 'beta', trustStatus: 'untrusted' }]
    },
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });

  assert.deepEqual(receipt, {
    schemaVersion: '0.1.0',
    status: 'PASS',
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    capabilities: [
      { kind: 'app', key: 'omega', source: 'plugin/read', status: 'DECLARED_ONLY' },
      { kind: 'hook', key: 'beta', source: 'plugin/read + hooks/list', status: 'DISCOVERED_UNTRUSTED' },
      { kind: 'mcp', key: 'gamma', source: 'plugin/read', status: 'DECLARED_ONLY' },
      { kind: 'skill', key: 'alpha', source: 'plugin/read + skills/list', status: 'DISCOVERED_EFFECTIVE' },
      { kind: 'skill', key: 'zeta', source: 'plugin/read + skills/list', status: 'DISCOVERED_EFFECTIVE' }
    ],
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });
});

test('fails when observed skill and hook registries are empty', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'missing-skill' }],
      hooks: [{ key: 'missing-hook' }]
    },
    effective: { skills: [], hooks: [] }
  });

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities, [
    { kind: 'hook', key: 'missing-hook', source: 'plugin/read + hooks/list', status: 'MISSING' },
    { kind: 'skill', key: 'missing-skill', source: 'plugin/read + skills/list', status: 'MISSING' }
  ]);
});

test('is inconclusive when skill and hook registries are omitted or null', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'unobserved-skill' }],
      hooks: [{ key: 'unobserved-hook' }]
    },
    effective: { hooks: null }
  });

  assert.equal(receipt.status, 'INCONCLUSIVE');
  assert.deepEqual(receipt.capabilities, [
    { kind: 'hook', key: 'unobserved-hook', source: 'plugin/read', status: 'UNOBSERVABLE' },
    { kind: 'skill', key: 'unobserved-skill', source: 'plugin/read', status: 'UNOBSERVABLE' }
  ]);
});

test('gives observed missing capabilities precedence over unobservable registries', () => {
  const receipt = buildReceipt({
    declarations: {
      skills: [{ name: 'missing-skill' }],
      hooks: [{ key: 'unobserved-hook' }]
    },
    effective: { skills: [] }
  });

  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(receipt.capabilities.map(({ kind, status }) => ({ kind, status })), [
    { kind: 'hook', status: 'UNOBSERVABLE' },
    { kind: 'skill', status: 'MISSING' }
  ]);
});
