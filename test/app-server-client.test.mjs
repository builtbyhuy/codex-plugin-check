import assert from 'node:assert/strict';
import { once } from 'node:events';
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

test('assigns monotonic IDs including initialize ordering', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'ids'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.close());

  const initializeResult = await client.initialize();
  assert.equal(initializeResult.receivedId, 1);
  assert.equal((await client.request('first/read', {})).receivedId, 2);
  assert.equal((await client.request('second/read', {})).receivedId, 3);
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

test('fatal protocol shutdown force-stops a stubborn child without close', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'stubborn-malformed'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 1_000
  });
  t.after(() => client.child.kill('SIGKILL'));

  await client.initialize();
  const childClosed = once(client.child, 'close');
  await assert.rejects(
    client.request('plugin/read', {}),
    /malformed JSONL/i
  );

  let guardTimer;
  const guard = new Promise((_, reject) => {
    guardTimer = setTimeout(
      () => reject(new Error('test guard: fatal path leaked stubborn child')),
      500
    );
  });
  try {
    await Promise.race([childClosed, guard]);
  } finally {
    clearTimeout(guardTimer);
  }
  assert.equal(client.child.signalCode, 'SIGKILL');
});

test('rejects a JSON null message without throwing uncaught', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'json-null'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /invalid JSONL message/i
  );
});

test('rejects a JSON array message without timing out', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'json-array'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /invalid JSONL message/i
  );
});

test('rejects a null JSON-RPC error without throwing uncaught', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'null-error'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /invalid JSON-RPC error/i
  );
});

test('rejects malformed JSON-RPC error fields through the fatal path', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'invalid-error'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /invalid JSON-RPC error/i
  );
});

test('rejects an unknown integer response ID immediately', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'unknown-id'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /unknown response ID 102/i
  );
});

test('rejects a non-integer response ID through the fatal path', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'invalid-id'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await assert.rejects(
    client.request('plugin/read', {}),
    /invalid response ID/i
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

test('rejects a write race after the real child closes stdin', async (t) => {
  const { AppServerClient } = await import('../src/app-server-client.mjs');
  const client = await AppServerClient.start({
    command: process.execPath,
    args: ['test/fixtures/fake-app-server.mjs', 'stdin-race'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 250
  });
  t.after(() => client.close());

  await client.initialize();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(
    client.request('plugin/read', {}),
    /stdin write failed|exited prematurely/i
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
