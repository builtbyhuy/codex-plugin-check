import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function makeFixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'action-fixture-')));
  const githubOutput = path.join(root, 'github-output.txt');
  const receiptPath = path.join(root, 'receipt.json');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { githubOutput, receiptPath, root };
}

function actionEnv(fixture) {
  return {
    'INPUT_MARKETPLACE-ROOT': '/fixture/marketplace',
    'INPUT_PLUGIN': 'sample',
    'INPUT_CODEX': '/fixture/codex',
    'INPUT_CODEX-VERSION': '0.147.0',
    'INPUT_CWD': '/fixture/workspace',
    'INPUT_OUTPUT': fixture.receiptPath,
    'INPUT_ISOLATION': 'strict',
    GITHUB_OUTPUT: fixture.githubOutput
  };
}

function parseGithubOutput(text) {
  const values = {};
  const lines = text.split('\n');
  for (let index = 0; index < lines.length;) {
    if (lines[index] === '') {
      index += 1;
      continue;
    }
    const header = lines[index].match(/^([^<]+)<<(.+)$/);
    assert.ok(header, `invalid output header: ${lines[index]}`);
    const [, name, delimiter] = header;
    const end = lines.indexOf(delimiter, index + 1);
    assert.notEqual(end, -1, `missing delimiter for ${name}`);
    values[name] = {
      delimiter,
      value: lines.slice(index + 1, end).join('\n')
    };
    index = end + 1;
  }
  return values;
}

test('action metadata uses Node 24 and declares the complete input/output surface', async () => {
  const source = await readFile(new URL('../action.yml', import.meta.url), 'utf8');

  assert.match(source, /^name:/m);
  for (const input of [
    'marketplace-root', 'plugin', 'codex', 'codex-version', 'cwd', 'output', 'isolation'
  ]) {
    assert.match(source, new RegExp(`^  ${input}:$`, 'm'));
  }
  for (const output of ['status', 'receipt', 'codex-version']) {
    assert.match(source, new RegExp(`^  ${output}:$`, 'm'));
  }
  assert.match(source, /^  using: node24$/m);
  assert.match(source, /^  main: src\/action\.mjs$/m);
});

test('action delegates all inputs and publishes multiline-safe receipt outputs', async (t) => {
  const { runAction } = await import('../src/action.mjs');
  const fixture = await makeFixture(t);
  const receipt = {
    schemaVersion: '0.1.0',
    status: 'FAIL',
    codexVersion: '0.147.0',
    platform: 'linux-x64',
    plugin: { name: 'sample', marketplace: 'local', sourceRoot: '/workspace' },
    capabilities: [],
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  };
  let receivedArgv;
  const uuids = ['status-id', 'receipt-id', 'version-id'];

  const code = await runAction(actionEnv(fixture), { stdout: process.stdout, stderr: process.stderr }, {
    cliMain: async (argv) => {
      receivedArgv = argv;
      await writeFile(fixture.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      return 1;
    },
    randomUUID: () => uuids.shift()
  });

  assert.equal(code, 1, 'the Action must preserve a nonzero conformance result');
  assert.deepEqual(receivedArgv, [
    '--marketplace-root', '/fixture/marketplace',
    '--plugin', 'sample',
    '--codex', '/fixture/codex',
    '--codex-version', '0.147.0',
    '--cwd', '/fixture/workspace',
    '--output', fixture.receiptPath,
    '--isolation', 'strict'
  ]);
  const outputs = parseGithubOutput(await readFile(fixture.githubOutput, 'utf8'));
  assert.equal(outputs.status.value, 'FAIL');
  assert.equal(outputs.receipt.value, JSON.stringify(receipt, null, 2));
  assert.equal(outputs['codex-version'].value, '0.147.0');
  assert.equal(outputs.status.delimiter, 'codex_plugin_check_status-id');
  assert.equal(outputs.receipt.delimiter, 'codex_plugin_check_receipt-id');
  assert.equal(outputs['codex-version'].delimiter, 'codex_plugin_check_version-id');
  for (const { delimiter, value } of Object.values(outputs)) {
    assert.equal(value.split('\n').includes(delimiter), false);
  }
});

test('action emits no outputs when the CLI produces no receipt', async (t) => {
  const { runAction } = await import('../src/action.mjs');
  const fixture = await makeFixture(t);

  const code = await runAction(actionEnv(fixture), { stdout: process.stdout, stderr: process.stderr }, {
    cliMain: async () => 2,
    randomUUID: () => 'unused'
  });

  assert.equal(code, 2);
  await assert.rejects(access(fixture.receiptPath), { code: 'ENOENT' });
  await assert.rejects(access(fixture.githubOutput), { code: 'ENOENT' });
});

test('GitHub output delimiters are retried if a candidate appears as a value line', async (t) => {
  const { runAction } = await import('../src/action.mjs');
  const fixture = await makeFixture(t);
  const collision = 'codex_plugin_check_collision';
  const receipt = {
    schemaVersion: '0.1.0',
    status: collision,
    codexVersion: '0.147.0'
  };
  const uuids = ['collision', 'safe-status', 'safe-receipt', 'safe-version'];

  await runAction(actionEnv(fixture), process, {
    cliMain: async () => {
      await writeFile(fixture.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      return 2;
    },
    randomUUID: () => uuids.shift()
  });

  const outputs = parseGithubOutput(await readFile(fixture.githubOutput, 'utf8'));
  assert.equal(outputs.status.value, collision);
  assert.equal(outputs.status.delimiter, 'codex_plugin_check_safe-status');
});
