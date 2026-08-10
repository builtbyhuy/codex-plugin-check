import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function makeFixture(t) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'isolation-fixture-'));
  const targetRoot = path.join(fixtureRoot, 'checkout');
  const toolRoot = path.join(fixtureRoot, 'tool');
  const receiptPath = path.join(fixtureRoot, 'receipts', 'conformance.json');
  await mkdir(targetRoot);
  await mkdir(toolRoot);
  await mkdir(path.dirname(receiptPath));
  await writeFile(path.join(targetRoot, 'plugin.json'), '{}\n');
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  return { targetRoot, toolRoot, receiptPath };
}

test('Dockerfile pins the build-only exact Codex installation contract', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const logicalDockerfile = dockerfile.replace(/\\\r?\n\s*/g, ' ');
  const fromLines = dockerfile
    .split(/\r?\n/)
    .filter((line) => /^FROM\s+/i.test(line));
  assert.deepEqual(fromLines, [
    'FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03'
  ]);
  assert.match(dockerfile, /^ARG CODEX_VERSION$/m);

  const guardMatch = dockerfile.match(
    /if \(!\/(.+)\/\.test\(process\.argv\[1\] \?\? ""\)\)/
  );
  assert.ok(guardMatch, 'Dockerfile must validate CODEX_VERSION before install');
  const stableVersion = new RegExp(guardMatch[1]);
  assert.equal(stableVersion.test('0.147.0'), true);
  for (const rejected of ['latest', '^0.147.0', '0.148.0-beta.1', '0.147.0;id']) {
    assert.equal(stableVersion.test(rejected), false, rejected);
  }

  const installCommands = logicalDockerfile.match(/npm install\b[^\n]*/g) ?? [];
  assert.equal(installCommands.length, 1);
  assert.match(
    installCommands[0],
    /"@openai\/codex@\$\{CODEX_VERSION\}"/
  );
  assert.doesNotMatch(dockerfile, /^\s*(?:ENTRYPOINT|CMD)\b/im);
});

test('env mode keeps harmless platform essentials and replaces personal state', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const isolation = await createIsolation(
    { ...fixture, mode: 'env', platform: 'darwin' },
    {
      parentEnv: {
        PATH: '/fixture/bin',
        OPENAI_API_KEY: 'openai-secret',
        GH_TOKEN: 'github-secret',
        NPM_TOKEN: 'npm-secret',
        SSH_AUTH_SOCK: '/private/ssh-agent',
        HTTPS_PROXY: 'https://proxy.invalid'
      }
    }
  );
  t.after(() => isolation.cleanup());

  assert.equal(isolation.env.PATH, '/fixture/bin');
  for (const name of [
    'OPENAI_API_KEY',
    'GH_TOKEN',
    'NPM_TOKEN',
    'SSH_AUTH_SOCK',
    'HTTPS_PROXY'
  ]) {
    assert.equal(isolation.env[name], undefined, `${name} must not be inherited`);
  }

  const isolatedNames = [
    'HOME',
    'CODEX_HOME',
    'TMPDIR',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME'
  ];
  assert.deepEqual(Object.keys(isolation.env).sort(), ['PATH', ...isolatedNames].sort());
  for (const name of isolatedNames) {
    const relative = path.relative(isolation.root, isolation.env[name]);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }
});

test('strict mode rejects non-Linux platforms instead of downgrading', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);

  await assert.rejects(
    createIsolation({
      ...fixture,
      mode: 'strict',
      platform: 'darwin',
      codexVersion: '0.147.0'
    }),
    /strict isolation requires Linux/i
  );
});

test('unknown isolation modes fail closed', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);

  await assert.rejects(
    createIsolation({ ...fixture, mode: 'automatic', platform: 'linux' }),
    /isolation mode must be strict or env/i
  );
});

test('unsafe receipt basenames are rejected before owned state is created', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);

  for (const receiptPath of ['', '.', '..', '/', 'unsafe\\receipt.json']) {
    await assert.rejects(
      createIsolation({
        ...fixture,
        receiptPath,
        mode: 'env',
        platform: 'darwin'
      }),
      /receipt path must have a safe filename/i,
      receiptPath
    );
  }
});

test('strict mode fails closed when Docker is unavailable', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  let availabilityEnv;

  await assert.rejects(
    createIsolation(
      {
        ...fixture,
        mode: 'strict',
        platform: 'linux',
        codexVersion: '0.147.0'
      },
      {
        parentEnv: { PATH: '/fixture/bin', OPENAI_API_KEY: 'secret' },
        dockerAvailable: async (env) => {
          availabilityEnv = env;
          return false;
        }
      }
    ),
    /strict isolation requires Docker/i
  );
  assert.deepEqual(availabilityEnv, { PATH: '/fixture/bin' });
});

test('strict mode rejects missing or invalid invoking Linux IDs before Docker', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const invalidIdentities = [
    { getuid: () => -1, getgid: () => 1002 },
    { getuid: () => 1001.5, getgid: () => 1002 },
    { getuid: () => 1001, getgid: () => -1 },
    { getuid: () => 1001, getgid: () => Number.NaN },
    { getuid: () => undefined, getgid: () => 1002 },
    { getuid: () => 1001, getgid: () => undefined },
    { getuid: 1001, getgid: () => 1002 }
  ];

  for (const identity of invalidIdentities) {
    let dockerChecked = false;
    await assert.rejects(
      createIsolation(
        {
          ...fixture,
          mode: 'strict',
          platform: 'linux',
          codexVersion: '0.147.0'
        },
        {
          ...identity,
          dockerAvailable: async () => {
            dockerChecked = true;
            return true;
          },
          runCommand: async () => {
            throw new Error('unexpected Docker build');
          }
        }
      ),
      /UID and GID/i
    );
    assert.equal(dockerChecked, false);
  }
});

test('strict mode rejects non-exact or non-stable Codex versions', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);

  for (const codexVersion of [
    'latest',
    '^0.147.0',
    '>=0.146.1',
    '0.147.0; touch /tmp/unsafe',
    '0.148.0-beta.1'
  ]) {
    await assert.rejects(
      createIsolation(
        {
          ...fixture,
          mode: 'strict',
          platform: 'linux',
          codexVersion
        },
        { dockerAvailable: async () => true }
      ),
      /exact stable numeric Codex version/i,
      codexVersion
    );
  }
});

test('strict mode builds a pinned image and wraps commands in the denied container boundary', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const builds = [];
  const toolRoot = fixture.toolRoot;
  const isolation = await createIsolation(
    {
      ...fixture,
      mode: 'strict',
      platform: 'linux',
      codexVersion: '0.147.0'
    },
    {
      parentEnv: { PATH: '/fixture/bin' },
      dockerAvailable: async () => true,
      runCommand: async (invocation) => builds.push(invocation),
      getuid: () => 1001,
      getgid: () => 1002,
      toolRoot
    }
  );
  t.after(() => isolation.cleanup());

  assert.deepEqual(builds, [
    {
      command: 'docker',
      args: [
        'build',
        '--file',
        path.join(await realpath(toolRoot), 'Dockerfile'),
        '--build-arg',
        'CODEX_VERSION=0.147.0',
        '--tag',
        'codex-plugin-check:codex-0.147.0',
        await realpath(toolRoot)
      ],
      env: isolation.env
    }
  ]);

  const wrapped = isolation.wrap('codex', ['plugin', 'list', '--json']);
  assert.equal(wrapped.command, 'docker');
  for (const required of [
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges'
  ]) {
    assert.ok(wrapped.args.includes(required), `missing ${required}`);
  }

  const mounts = wrapped.args.filter((value, index) => wrapped.args[index - 1] === '--mount');
  assert.equal(mounts.length, 3);
  assert.ok(
    mounts.includes(`type=bind,src=${await realpath(fixture.targetRoot)},dst=/workspace,readonly`)
  );
  assert.ok(
    mounts.includes(`type=bind,src=${await realpath(toolRoot)},dst=/tool,readonly`)
  );
  assert.ok(
    mounts.includes(`type=bind,src=${isolation.outputDirectory},dst=/output`)
  );

  const writableHostMounts = mounts.filter((mount) => !mount.endsWith(',readonly'));
  assert.deepEqual(writableHostMounts, [
    `type=bind,src=${isolation.outputDirectory},dst=/output`
  ]);
  assert.equal(isolation.outputDirectory, path.join(await realpath(isolation.root), 'output'));
  assert.equal(
    isolation.outputPath,
    path.join(isolation.outputDirectory, 'conformance.json')
  );
  assert.equal(isolation.containerReceiptPath, '/output/conformance.json');
  await access(isolation.outputDirectory);
  assert.equal(wrapped.args[wrapped.args.indexOf('--user') + 1], '1001:1002');
  const tmpfs = wrapped.args[wrapped.args.indexOf('--tmpfs') + 1];
  assert.match(tmpfs, /^\/state:.*(?:^|,)size=64m(?:,|$)/);
  assert.match(tmpfs, /(?:^|,)uid=1001(?:,|$)/);
  assert.match(tmpfs, /(?:^|,)gid=1002(?:,|$)/);
  assert.equal(wrapped.args[wrapped.args.indexOf('--entrypoint') + 1], '/bin/sh');
  assert.match(
    wrapped.args[wrapped.args.indexOf('codex-plugin-check:codex-0.147.0') + 2],
    /mkdir -p \/state\/home .*exec "\$@"/
  );
  assert.deepEqual(wrapped.args.slice(-5), [
    'codex-plugin-check',
    'codex',
    'plugin',
    'list',
    '--json'
  ]);
});

test('strict writable output never aliases caller receipt, checkout, tool, or filesystem root', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const fixtureRoot = path.dirname(fixture.targetRoot);
  const targetAlias = path.join(fixtureRoot, 'checkout-link');
  const toolAlias = path.join(fixtureRoot, 'tool-link');
  await symlink(fixture.targetRoot, targetAlias, 'dir');
  await symlink(fixture.toolRoot, toolAlias, 'dir');
  const canonicalTarget = await realpath(fixture.targetRoot);
  const canonicalTool = await realpath(fixture.toolRoot);
  const receiptPaths = [
    path.join(fixture.targetRoot, 'conformance.json'),
    path.join(fixture.toolRoot, 'conformance.json'),
    '/conformance.json'
  ];

  for (const receiptPath of receiptPaths) {
    const builds = [];
    const isolation = await createIsolation(
      {
        targetRoot: targetAlias,
        receiptPath,
        mode: 'strict',
        platform: 'linux',
        codexVersion: '0.147.0'
      },
      {
        dockerAvailable: async () => true,
        runCommand: async (invocation) => builds.push(invocation),
        getuid: () => 1001,
        getgid: () => 1002,
        toolRoot: toolAlias
      }
    );
    t.after(() => isolation.cleanup());

    const wrapped = isolation.wrap('codex', ['--version']);
    const mounts = wrapped.args.filter(
      (value, index) => wrapped.args[index - 1] === '--mount'
    );
    const writableMounts = mounts.filter((mount) => !mount.endsWith(',readonly'));
    assert.deepEqual(writableMounts, [
      `type=bind,src=${isolation.outputDirectory},dst=/output`
    ]);
    assert.equal(path.dirname(isolation.outputDirectory), await realpath(isolation.root));
    assert.equal(path.basename(isolation.outputDirectory), 'output');
    assert.notEqual(isolation.outputDirectory, path.resolve(path.dirname(receiptPath)));
    assert.ok(
      mounts.includes(`type=bind,src=${canonicalTarget},dst=/workspace,readonly`)
    );
    assert.ok(mounts.includes(`type=bind,src=${canonicalTool},dst=/tool,readonly`));
    assert.equal(builds[0].args.at(-1), canonicalTool);
    assert.equal(isolation.outputPath, path.join(isolation.outputDirectory, 'conformance.json'));
    assert.equal(isolation.containerReceiptPath, '/output/conformance.json');
  }
});

test('strict image-build failure removes the owned temporary root', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  let ownedRoot;

  await assert.rejects(
    createIsolation(
      {
        ...fixture,
        mode: 'strict',
        platform: 'linux',
        codexVersion: '0.147.0'
      },
      {
        dockerAvailable: async () => true,
        runCommand: async ({ env }) => {
          ownedRoot = path.dirname(env.HOME);
          throw new Error('synthetic build failure');
        }
      }
    ),
    /synthetic build failure/
  );
  await assert.rejects(access(ownedRoot), { code: 'ENOENT' });
});

test('checkout integrity rejects changed regular-file bytes', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const isolation = await createIsolation({
    ...fixture,
    mode: 'env',
    platform: 'darwin'
  });
  t.after(() => isolation.cleanup());

  await writeFile(path.join(fixture.targetRoot, 'plugin.json'), '{"changed":true}\n');

  await assert.rejects(
    isolation.assertCheckoutUnchanged(),
    /checkout changed during probe/i
  );
});

test('checkout integrity rejects a changed symlink target', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  await writeFile(path.join(fixture.targetRoot, 'other.json'), '{}\n');
  const linkPath = path.join(fixture.targetRoot, 'current.json');
  await symlink('plugin.json', linkPath);
  const isolation = await createIsolation({
    ...fixture,
    mode: 'env',
    platform: 'darwin'
  });
  t.after(() => isolation.cleanup());

  await rm(linkPath);
  await symlink('other.json', linkPath);

  await assert.rejects(
    isolation.assertCheckoutUnchanged(),
    /checkout changed during probe/i
  );
});

test('checkout integrity excludes only root Git metadata', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const gitDirectory = path.join(fixture.targetRoot, '.git');
  await mkdir(gitDirectory);
  const isolation = await createIsolation({
    ...fixture,
    mode: 'env',
    platform: 'darwin'
  });
  t.after(() => isolation.cleanup());

  await writeFile(path.join(gitDirectory, 'index'), 'mutable metadata\n');

  await assert.doesNotReject(isolation.assertCheckoutUnchanged());
});

test('cleanup refuses a canonical path outside the owned temporary prefix', async (t) => {
  const { createIsolation } = await import('../src/isolation.mjs');
  const fixture = await makeFixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'cleanup-canary-'));
  const canary = path.join(outside, 'keep.txt');
  await writeFile(canary, 'keep\n');
  t.after(async () => {
    await rm(outside, { recursive: true, force: true });
  });
  const isolation = await createIsolation({
    ...fixture,
    mode: 'env',
    platform: 'darwin'
  });

  await rm(isolation.root, { recursive: true, force: true });
  await symlink(outside, isolation.root, 'dir');
  t.after(() => rm(isolation.root, { force: true }));

  await assert.rejects(isolation.cleanup(), /refusing to clean unowned path/i);
  await access(canary);
});
