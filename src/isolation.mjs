import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_ENV = [
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TZ',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT'
];

const OWNED_PATHS = {
  HOME: 'home',
  CODEX_HOME: 'codex-home',
  TMPDIR: 'tmp',
  XDG_CONFIG_HOME: 'xdg-config',
  XDG_CACHE_HOME: 'xdg-cache',
  XDG_DATA_HOME: 'xdg-data',
  XDG_STATE_HOME: 'xdg-state'
};

function platformEnvironment(parentEnv) {
  const env = {};
  for (const name of PLATFORM_ENV) {
    if (parentEnv[name] !== undefined) env[name] = parentEnv[name];
  }
  return env;
}

function hasDocker(env) {
  return new Promise((resolve) => {
    const child = spawn('docker', ['version', '--format', '{{.Server.Version}}'], {
      env,
      stdio: 'ignore'
    });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

function runInvocation(invocation) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env: invocation.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const status = code === null ? `signal ${signal}` : `code ${code}`;
      reject(new Error(`${invocation.command} exited with ${status}`));
    });
  });
}

function linuxIdentity(dependencies) {
  const getuid = dependencies.getuid ?? process.getuid;
  const getgid = dependencies.getgid ?? process.getgid;
  if (typeof getuid !== 'function' || typeof getgid !== 'function') {
    throw new Error('Strict isolation requires the invoking Linux UID and GID');
  }
  const uid = getuid();
  const gid = getgid();
  if (
    !Number.isSafeInteger(uid) ||
    uid < 0 ||
    !Number.isSafeInteger(gid) ||
    gid < 0
  ) {
    throw new Error('Strict isolation requires non-negative integer UID and GID');
  }
  return { gid, uid };
}

async function hashCheckout(targetRoot) {
  const hash = createHash('sha256');

  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (relativeDirectory === '' && entry.name === '.git') continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        hash.update('file\0');
        hash.update(relativePath);
        hash.update('\0');
        hash.update(await readFile(absolutePath));
        hash.update('\0');
      } else if (entry.isSymbolicLink()) {
        hash.update('symlink\0');
        hash.update(relativePath);
        hash.update('\0');
        hash.update(await readlink(absolutePath));
        hash.update('\0');
      }
    }
  }

  await visit(targetRoot);
  return hash.digest('hex');
}

export async function createIsolation(options, dependencies = {}) {
  if (options.mode !== 'strict' && options.mode !== 'env') {
    throw new Error('Isolation mode must be strict or env');
  }
  if (options.mode === 'strict' && options.platform !== 'linux') {
    throw new Error('Strict isolation requires Linux');
  }
  const receiptBasename = path.basename(options.receiptPath ?? '');
  if (
    receiptBasename === '' ||
    receiptBasename === '.' ||
    receiptBasename === '..' ||
    /[\\/\0]/.test(receiptBasename)
  ) {
    throw new Error('Receipt path must have a safe filename');
  }
  const parentEnv = dependencies.parentEnv ?? process.env;
  const platformEnv = platformEnvironment(parentEnv);
  let identity;
  let toolRoot;
  if (options.mode === 'strict') {
    if (!/^\d+\.\d+\.\d+$/.test(options.codexVersion ?? '')) {
      throw new Error('Strict isolation requires an exact stable numeric Codex version');
    }
    identity = linuxIdentity(dependencies);
    const dockerAvailable = dependencies.dockerAvailable ?? hasDocker;
    if (!(await dockerAvailable(platformEnv))) {
      throw new Error('Strict isolation requires Docker');
    }
    toolRoot = await realpath(
      path.resolve(
        dependencies.toolRoot ?? fileURLToPath(new URL('..', import.meta.url))
      )
    );
  }
  const targetRoot = await realpath(path.resolve(options.targetRoot));
  const checkoutHash = await hashCheckout(targetRoot);

  const canonicalTemporaryDirectory = await realpath(os.tmpdir());
  const ownedPrefix = path.join(canonicalTemporaryDirectory, 'codex-plugin-check-');
  const root = await mkdtemp(ownedPrefix);
  const canonicalRoot = await realpath(root);
  const outputDirectory = path.join(canonicalRoot, 'output');
  const outputPath = path.join(outputDirectory, receiptBasename);
  const containerReceiptPath = `/output/${receiptBasename}`;
  await mkdir(outputDirectory);
  const env = { ...platformEnv };
  for (const [name, directory] of Object.entries(OWNED_PATHS)) {
    env[name] = path.join(root, directory);
    await mkdir(env[name], { recursive: true });
  }
  let strictConfig;
  if (options.mode === 'strict') {
    const image = `codex-plugin-check:codex-${options.codexVersion}`;
    const runCommand = dependencies.runCommand ?? runInvocation;
    try {
      await runCommand({
        command: 'docker',
        args: [
          'build',
          '--file',
          path.join(toolRoot, 'Dockerfile'),
          '--build-arg',
          `CODEX_VERSION=${options.codexVersion}`,
          '--tag',
          image,
          toolRoot
        ],
        env
      });
    } catch (cause) {
      await rm(canonicalRoot, { recursive: true, force: true });
      throw cause;
    }
    strictConfig = { identity, image, outputDirectory, targetRoot, toolRoot };
  }

  return {
    root,
    env,
    outputDirectory,
    outputPath,
    containerReceiptPath,
    wrap(command, args = []) {
      if (strictConfig) {
        const containerPaths = {
          HOME: '/state/home',
          CODEX_HOME: '/state/codex-home',
          TMPDIR: '/state/tmp',
          XDG_CONFIG_HOME: '/state/xdg-config',
          XDG_CACHE_HOME: '/state/xdg-cache',
          XDG_DATA_HOME: '/state/xdg-data',
          XDG_STATE_HOME: '/state/xdg-state'
        };
        const containerEnv = Object.entries(containerPaths).flatMap(([name, value]) => [
          '--env',
          `${name}=${value}`
        ]);
        return {
          command: 'docker',
          args: [
            'run',
            '--rm',
            '--network',
            'none',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges',
            '--user',
            `${strictConfig.identity.uid}:${strictConfig.identity.gid}`,
            '--workdir',
            '/workspace',
            '--tmpfs',
            `/state:rw,noexec,nosuid,nodev,size=64m,uid=${strictConfig.identity.uid},gid=${strictConfig.identity.gid},mode=0700`,
            '--mount',
            `type=bind,src=${strictConfig.targetRoot},dst=/workspace,readonly`,
            '--mount',
            `type=bind,src=${strictConfig.toolRoot},dst=/tool,readonly`,
            '--mount',
            `type=bind,src=${strictConfig.outputDirectory},dst=/output`,
            ...containerEnv,
            '--entrypoint',
            '/bin/sh',
            strictConfig.image,
            '-c',
            `umask 077; mkdir -p ${Object.values(containerPaths).join(' ')}; exec "$@"`,
            'codex-plugin-check',
            command,
            ...args
          ]
        };
      }
      return { command, args: [...args] };
    },
    async assertCheckoutUnchanged() {
      if ((await hashCheckout(targetRoot)) !== checkoutHash) {
        throw new Error('Checkout changed during probe');
      }
    },
    async cleanup() {
      let cleanupRoot;
      try {
        cleanupRoot = await realpath(root);
      } catch (cause) {
        if (cause?.code === 'ENOENT') return;
        throw cause;
      }
      if (!cleanupRoot.startsWith(ownedPrefix) || cleanupRoot !== canonicalRoot) {
        throw new Error(`Refusing to clean unowned path: ${cleanupRoot}`);
      }
      await rm(cleanupRoot, { recursive: true, force: true });
    }
  };
}
