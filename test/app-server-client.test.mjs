import assert from 'node:assert/strict';
import test from 'node:test';

test('initializes the app-server protocol before serving requests', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'ok'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  const initializeResult = await client.initialize();
  assert.deepEqual(initializeResult, {
    codexHome: '/tmp/fake-codex-home',
    platformFamily: 'unix',
    platformOs: 'fake-os',
    userAgent: 'fake-app-server/1.0'
  });

  const pluginResult = await client.request('plugin/read', {
    pluginName: 'sample'
  });
  assert.equal(pluginResult.plugin.summary.name, 'sample');
  assert.deepEqual(await client.request('skills/list', {}), {
    data: [{ name: 'skill-a' }]
  });
  assert.deepEqual(await client.request('hooks/list', {}), {
    data: [{ name: 'hook-a' }]
  });
});

test('rejects JSON-RPC error responses', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'rpc-error'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', { pluginName: 'sample' }),
    /fixture RPC failure.*-32001|-32001.*fixture RPC failure/
  );
});

test('rejects pending requests when stdout contains malformed JSONL', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'malformed'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', { pluginName: 'sample' }),
    /malformed JSONL/i
  );
});

test('rejects a request after its configured timeout', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'no-response'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  let guardTimer;
  const guard = new Promise((_, reject) => {
    guardTimer = setTimeout(
      () => reject(new Error('test guard: client did not time out')),
      750
    );
  });

  try {
    await assert.rejects(
      Promise.race([client.request('plugin/read', {}), guard]),
      /timed out.*250 ms/i
    );
  } finally {
    clearTimeout(guardTimer);
  }
});

test('rejects pending requests when the app-server exits prematurely', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'exit'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /prematurely.*23/i
  );
});

test('rejects duplicate response IDs as a protocol failure', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'duplicate'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  const result = await client.request('plugin/read', { pluginName: 'sample' });
  assert.equal(result.plugin.summary.name, 'sample');
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(
    client.request('skills/list', {}),
    /duplicate response ID 2/i
  );
});

test('rejects stderr larger than 64 KiB', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'stderr-overflow'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /stderr exceeded 64 KiB/i
  );
});

test('returns one idempotent shutdown promise from close', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'ok'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  await client.initialize();
  const firstClose = client.close();
  const secondClose = client.close();
  assert.strictEqual(secondClose, firstClose);
  await firstClose;
});

test('force-stops an app-server that ignores graceful shutdown', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'stubborn'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.child.kill('SIGKILL'));

  await client.initialize();
  let guardTimer;
  const guard = new Promise((_, reject) => {
    guardTimer = setTimeout(
      () => reject(new Error('test guard: close left the child running')),
      500
    );
  });

  try {
    await Promise.race([client.close(), guard]);
  } finally {
    clearTimeout(guardTimer);
  }
  assert.notEqual(client.child.signalCode, null);
});
