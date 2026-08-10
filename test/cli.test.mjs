import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value) => { stdout += String(value); } },
      stderr: { write: (value) => { stderr += String(value); } }
    },
    stdout: () => stdout,
    stderr: () => stderr
  };
}

async function makeFixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cli-fixture-')));
  const marketplaceRoot = path.join(root, 'marketplace');
  const cwd = path.join(marketplaceRoot, 'workspace');
  const output = path.join(root, 'receipts', 'conformance.json');
  await mkdir(cwd, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { cwd, marketplaceRoot, output, root };
}

function requiredArgs(fixture, overrides = {}) {
  const values = {
    '--marketplace-root': fixture.marketplaceRoot,
    '--plugin': 'sample',
    '--codex': '/fixture/codex',
    '--codex-version': '0.147.0',
    '--cwd': fixture.cwd,
    '--output': fixture.output,
    '--isolation': 'env',
    ...overrides
  };
  return Object.entries(values).flatMap(([flag, value]) => [flag, value]);
}

function receiptFor(fixture, status = 'PASS', isolation = {
  mode: 'env',
  network: 'not_enforced',
  hostState: 'not_enforced'
}) {
  return {
    schemaVersion: '0.1.0',
    status,
    codexVersion: '0.147.0',
    platform: 'linux-x64',
    plugin: {
      name: 'sample',
      marketplace: 'local-marketplace',
      sourceRoot: fixture.marketplaceRoot
    },
    capabilities: [],
    isolation
  };
}

function stagedReceipt(status = 'PASS', overrides = {}) {
  return {
    schemaVersion: '0.1.0',
    status,
    codexVersion: '0.147.0',
    platform: 'linux-x64',
    plugin: {
      name: 'sample',
      marketplace: 'local-marketplace',
      sourceRoot: '/workspace'
    },
    capabilities: [],
    isolation: {
      mode: 'env',
      network: 'not_enforced',
      hostState: 'not_enforced'
    },
    ...overrides
  };
}

async function strictHarness(fixture, options = {}) {
  const stagedPath = path.join(fixture.root, 'owned', 'output', 'stage.json');
  await mkdir(path.dirname(stagedPath), { recursive: true });
  const events = [];
  let wrapped;
  let createOptions;
  const isolation = {
    outputPath: stagedPath,
    containerReceiptPath: '/output/stage.json',
    env: { PATH: '/fixture/bin' },
    wrap(command, args) {
      events.push('wrap');
      wrapped = { command, args };
      return { command: 'docker', args: ['run', '--fixture-boundary'] };
    },
    async assertCheckoutUnchanged() {
      events.push('integrity');
      if (options.integrityError) throw options.integrityError;
    },
    async cleanup() {
      events.push('cleanup');
      if (options.cleanupInspect) await options.cleanupInspect();
      if (options.cleanupError) throw options.cleanupError;
    }
  };
  return {
    dependencies: {
      platform: 'linux',
      createIsolation: async (received) => {
        events.push('create');
        createOptions = received;
        return isolation;
      },
      checkPlugin: async () => {
        throw new Error('strict outer mode must not call checkPlugin');
      },
      runProcess: async (command, args, runOptions) => {
        events.push('child');
        if (options.childError) throw options.childError;
        await writeFile(stagedPath, `${JSON.stringify(options.receipt ?? stagedReceipt())}\n`);
        assert.equal(command, 'docker');
        assert.deepEqual(args, ['run', '--fixture-boundary']);
        assert.equal(runOptions.shell, false);
        assert.equal(runOptions.timeoutMs, 90_000);
        return { code: options.childCode ?? 0, stdout: '', stderr: '' };
      }
    },
    events,
    isolation,
    stagedPath,
    wrapped: () => wrapped,
    createOptions: () => createOptions
  };
}

test('help is available without probe inputs', async () => {
  const { main } = await import('../src/cli.mjs');
  const capture = captureIo();

  const code = await main(['--help'], capture.io, {});

  assert.equal(code, 0);
  assert.match(capture.stdout(), /Usage: codex-plugin-check/);
  assert.equal(capture.stderr(), '');
});

test('unknown, missing, and duplicate flags are rejected as input errors', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const cases = [
    ['--unknown'],
    ['--plugin'],
    [...requiredArgs(fixture), '--plugin', 'again'],
    [...requiredArgs(fixture), '--quiet', '--quiet']
  ];

  for (const argv of cases) {
    const capture = captureIo();
    assert.equal(await main(argv, capture.io, {}), 2, argv.join(' '));
    assert.match(capture.stderr(), /^Error: /);
    assert.doesNotMatch(capture.stdout(), /PASS|success/i);
  }
});

test('required values and exact numeric Codex versions fail before dependencies run', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  let processRuns = 0;
  const dependencies = {
    runProcess: async () => {
      processRuns += 1;
      return { code: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' };
    }
  };
  const cases = [
    ['--plugin', 'sample', '--codex-version', '0.147.0'],
    ['--marketplace-root', fixture.marketplaceRoot, '--codex-version', '0.147.0'],
    requiredArgs(fixture, { '--codex-version': 'latest' }),
    requiredArgs(fixture, { '--codex-version': '0.148.0-beta.1' })
  ];

  for (const argv of cases) {
    const capture = captureIo();
    assert.equal(await main(argv, capture.io, dependencies), 2);
    assert.match(capture.stderr(), /^Error: /);
  }
  assert.equal(processRuns, 0);
});

test('env mode verifies Codex first, probes the canonical checkout, and writes deterministic JSON', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const alias = path.join(fixture.root, 'marketplace-link');
  await symlink(fixture.marketplaceRoot, alias, 'dir');
  const canonicalRoot = await realpath(fixture.marketplaceRoot);
  const expected = receiptFor({ ...fixture, marketplaceRoot: canonicalRoot });
  const events = [];
  let checkOptions;
  const capture = captureIo();

  const code = await main(requiredArgs(fixture, {
    '--marketplace-root': alias
  }), capture.io, {
    runProcess: async (command, args, options) => {
      events.push('version');
      assert.equal(command, '/fixture/codex');
      assert.deepEqual(args, ['--version']);
      assert.equal(options.shell, false);
      return { code: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' };
    },
    checkPlugin: async (options) => {
      events.push('check');
      checkOptions = options;
      return expected;
    }
  });

  assert.equal(code, 0);
  assert.deepEqual(events, ['version', 'check']);
  assert.equal(checkOptions.marketplaceRoot, canonicalRoot);
  assert.equal(checkOptions.isolation, 'env');
  assert.equal(checkOptions.codexVersion, '0.147.0');
  assert.equal(checkOptions.codex, '/fixture/codex');
  assert.equal(checkOptions.cwd, await realpath(fixture.cwd));
  assert.equal(checkOptions.output, path.resolve(fixture.output));
  assert.equal(await readFile(fixture.output, 'utf8'), `${JSON.stringify(expected, null, 2)}\n`);
  assert.equal(capture.stdout(), 'codex-plugin-check: PASS (sample, Codex 0.147.0)\n');
  assert.equal(capture.stderr(), '');
});

test('env mode returns stable conformance codes and quiet suppresses only the summary', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const cases = [
    ['PASS', 0],
    ['FAIL', 1],
    ['INCONCLUSIVE', 3],
    ['ISOLATION_VIOLATION', 4]
  ];

  for (const [status, expectedCode] of cases) {
    const output = path.join(fixture.root, `${status}.json`);
    const capture = captureIo();
    const code = await main([
      ...requiredArgs(fixture, { '--output': output }),
      '--quiet'
    ], capture.io, {
      runProcess: async () => ({ code: 0, stdout: '0.147.0\n', stderr: '' }),
      checkPlugin: async () => receiptFor(fixture, status)
    });
    assert.equal(code, expectedCode, status);
    assert.equal(capture.stdout(), '');
    assert.equal(capture.stderr(), '');
    assert.equal(JSON.parse(await readFile(output, 'utf8')).status, status);
  }
});

test('Codex version mismatch is a tool error before env probing or receipt writing', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  let checked = false;
  const capture = captureIo();

  const code = await main(requiredArgs(fixture), capture.io, {
    runProcess: async () => ({ code: 0, stdout: 'codex-cli 0.146.1\n', stderr: '' }),
    checkPlugin: async () => {
      checked = true;
      return receiptFor(fixture);
    }
  });

  assert.equal(code, 2);
  assert.equal(checked, false);
  assert.match(capture.stderr(), /expected 0\.147\.0.*0\.146\.1/i);
  assert.doesNotMatch(capture.stdout(), /PASS|success/i);
  await assert.rejects(access(fixture.output), { code: 'ENOENT' });
});

test('direct env mode rejects a receipt that claims strict certification', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const capture = captureIo();

  const code = await main(requiredArgs(fixture), capture.io, {
    runProcess: async () => ({ code: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' }),
    checkPlugin: async () => receiptFor(fixture, 'PASS', {
      mode: 'strict',
      network: 'denied',
      hostState: 'denied'
    })
  });

  assert.equal(code, 2);
  assert.match(capture.stderr(), /env receipt.*not_enforced/i);
  assert.doesNotMatch(capture.stdout(), /PASS|success/i);
  await assert.rejects(access(fixture.output), { code: 'ENOENT' });
});

test('thrown probe errors return 2 without writing or claiming success', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const capture = captureIo();

  const code = await main(requiredArgs(fixture), capture.io, {
    runProcess: async () => ({ code: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' }),
    checkPlugin: async () => { throw new Error('synthetic probe failure'); }
  });

  assert.equal(code, 2);
  assert.match(capture.stderr(), /synthetic probe failure/);
  assert.doesNotMatch(capture.stdout(), /PASS|success/i);
  await assert.rejects(access(fixture.output), { code: 'ENOENT' });
});

test('strict mode invokes one env-mode child with container paths and certifies only after finalizers', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const staged = stagedReceipt('FAIL');
  const harness = await strictHarness(fixture, {
    receipt: staged,
    childCode: 1,
    cleanupInspect: async () => {
      await assert.rejects(access(fixture.output), { code: 'ENOENT' });
    }
  });
  const capture = captureIo();

  const code = await main(requiredArgs(fixture, { '--isolation': 'strict' }), capture.io, harness.dependencies);

  assert.equal(code, 1);
  assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
  assert.deepEqual(harness.createOptions(), {
    targetRoot: await realpath(fixture.marketplaceRoot),
    receiptPath: path.resolve(fixture.output),
    mode: 'strict',
    platform: 'linux',
    codexVersion: '0.147.0'
  });
  assert.deepEqual(harness.wrapped(), {
    command: '/usr/local/bin/node',
    args: [
      '/tool/src/cli.mjs',
      '--marketplace-root', '/workspace',
      '--plugin', 'sample',
      '--codex', '/usr/local/bin/codex',
      '--codex-version', '0.147.0',
      '--cwd', '/workspace/workspace',
      '--output', '/output/stage.json',
      '--isolation', 'env',
      '--quiet'
    ]
  });
  const certified = JSON.parse(await readFile(fixture.output, 'utf8'));
  assert.deepEqual(
    { ...certified, isolation: staged.isolation },
    staged,
    'strict certification may rewrite only isolation'
  );
  assert.deepEqual(certified.isolation, {
    mode: 'strict',
    network: 'denied',
    hostState: 'denied'
  });
  assert.equal(capture.stdout(), 'codex-plugin-check: FAIL (sample, Codex 0.147.0)\n');
  assert.equal(capture.stderr(), '');
});

test('strict mode rejects child status and exit-code disagreement after running every finalizer', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const harness = await strictHarness(fixture, {
    receipt: stagedReceipt('PASS'),
    childCode: 1
  });
  const capture = captureIo();

  const code = await main(requiredArgs(fixture, { '--isolation': 'strict' }), capture.io, harness.dependencies);

  assert.equal(code, 2);
  assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
  assert.match(capture.stderr(), /status.*exit code.*disagree/i);
  assert.doesNotMatch(capture.stdout(), /PASS|success/i);
  await assert.rejects(access(fixture.output), { code: 'ENOENT' });
});

test('strict mode preserves an agreed INCONCLUSIVE exit code', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const harness = await strictHarness(fixture, {
    receipt: stagedReceipt('INCONCLUSIVE'),
    childCode: 3
  });
  const capture = captureIo();

  const code = await main([
    ...requiredArgs(fixture, { '--isolation': 'strict' }),
    '--quiet'
  ], capture.io, harness.dependencies);

  assert.equal(code, 3);
  assert.equal(JSON.parse(await readFile(fixture.output, 'utf8')).status, 'INCONCLUSIVE');
  assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
  assert.equal(capture.stdout(), '');
  assert.equal(capture.stderr(), '');
});

test('strict mode fails closed on malformed staged evidence', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const cases = [
    stagedReceipt('PASS', { schemaVersion: '9.9.9' }),
    stagedReceipt('TOOL_ERROR'),
    stagedReceipt('PASS', { platform: '' }),
    stagedReceipt('PASS', { codexVersion: '0.146.1' }),
    stagedReceipt('PASS', {
      plugin: { name: 'other', marketplace: 'local-marketplace', sourceRoot: '/workspace' }
    }),
    stagedReceipt('PASS', {
      plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/host/path' }
    }),
    stagedReceipt('PASS', {
      isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
    })
  ];

  for (const receipt of cases) {
    const fixture = await makeFixture(t);
    const harness = await strictHarness(fixture, { receipt });
    const capture = captureIo();
    const code = await main(requiredArgs(fixture, { '--isolation': 'strict' }), capture.io, harness.dependencies);
    assert.equal(code, 2);
    assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
    assert.match(capture.stderr(), /^Error: /);
    await assert.rejects(access(fixture.output), { code: 'ENOENT' });
  }
});

test('strict mode attempts both finalizers and preserves the primary child failure', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const harness = await strictHarness(fixture, {
    childError: new Error('primary child failure'),
    integrityError: new Error('secondary integrity failure'),
    cleanupError: new Error('tertiary cleanup failure')
  });
  const capture = captureIo();

  const code = await main(requiredArgs(fixture, { '--isolation': 'strict' }), capture.io, harness.dependencies);

  assert.equal(code, 2);
  assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
  assert.match(capture.stderr(), /primary child failure/);
  assert.doesNotMatch(capture.stderr(), /secondary|tertiary/);
  await assert.rejects(access(fixture.output), { code: 'ENOENT' });
});

test('strict mode never certifies when integrity or cleanup fails', async (t) => {
  const { main } = await import('../src/cli.mjs');
  for (const failure of ['integrity', 'cleanup']) {
    const fixture = await makeFixture(t);
    const harness = await strictHarness(fixture, {
      [`${failure}Error`]: new Error(`${failure} failed`)
    });
    const capture = captureIo();

    const code = await main(requiredArgs(fixture, { '--isolation': 'strict' }), capture.io, harness.dependencies);

    assert.equal(code, 2);
    assert.deepEqual(harness.events, ['create', 'wrap', 'child', 'integrity', 'cleanup']);
    assert.match(capture.stderr(), new RegExp(`${failure} failed`));
    await assert.rejects(access(fixture.output), { code: 'ENOENT' });
  }
});

test('strict cwd outside the mounted marketplace is rejected before Docker setup', async (t) => {
  const { main } = await import('../src/cli.mjs');
  const fixture = await makeFixture(t);
  const outside = path.join(fixture.root, 'outside-workspace');
  await mkdir(outside);
  let created = false;
  const capture = captureIo();

  const code = await main(requiredArgs(fixture, {
    '--cwd': outside,
    '--isolation': 'strict'
  }), capture.io, {
    platform: 'linux',
    createIsolation: async () => {
      created = true;
      throw new Error('must not create Docker isolation');
    }
  });

  assert.equal(code, 2);
  assert.equal(created, false);
  assert.match(capture.stderr(), /strict --cwd.*inside/i);
});
