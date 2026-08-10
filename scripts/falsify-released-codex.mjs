#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { main as cliMainReal, validateReceipt } from '../src/cli.mjs';
import { createIsolation as createIsolationReal } from '../src/isolation.mjs';

export const CURRENT_CODEX_VERSION = '0.147.0';
export const PRIOR_CODEX_VERSION = '0.146.1';
const PROBE_LIMIT_MS = 90_000;
const CHILD_OUTPUT_LIMIT = 1024 * 1024;
const FIXTURE_ROOT = fileURLToPath(new URL('../test/fixtures/marketplace', import.meta.url));

function requiredVersions(env) {
  if (
    env.CODEX_CURRENT_VERSION !== CURRENT_CODEX_VERSION ||
    env.CODEX_PRIOR_VERSION !== PRIOR_CODEX_VERSION
  ) {
    throw new Error(
      `Falsifier requires CODEX_CURRENT_VERSION=${CURRENT_CODEX_VERSION} and ` +
      `CODEX_PRIOR_VERSION=${PRIOR_CODEX_VERSION}`
    );
  }
  return [CURRENT_CODEX_VERSION, PRIOR_CODEX_VERSION];
}

function appendOutput(chunks, chunk, state) {
  const value = Buffer.from(chunk);
  state.bytes += value.length;
  if (state.bytes > CHILD_OUTPUT_LIMIT) {
    throw new Error(`Child output exceeded ${CHILD_OUTPUT_LIMIT} bytes`);
  }
  chunks.push(value);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    let forcedError;
    let killTimer;
    let settled = false;
    const timeoutMs = options.timeoutMs ?? PROBE_LIMIT_MS;
    const timer = setTimeout(() => {
      forcedError = new Error(`${command} timed out after ${timeoutMs}ms`);
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      killTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();

    const terminateForOutput = (cause) => {
      forcedError ??= cause;
      child.kill('SIGTERM');
    };
    child.stdout.on('data', (chunk) => {
      try {
        appendOutput(stdout, chunk, stdoutState);
      } catch (cause) {
        terminateForOutput(cause);
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        appendOutput(stderr, chunk, stderrState);
      } catch (cause) {
        terminateForOutput(cause);
      }
    });
    child.once('error', (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(cause);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (forcedError) {
        reject(forcedError);
        return;
      }
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

async function assertStrictDockerReal({ platform }) {
  if (platform !== 'linux') {
    throw new Error(`Strict released-Codex falsification requires Linux, observed ${platform}`);
  }
  let result;
  try {
    result = await runProcess('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeoutMs: 10_000
    });
  } catch (cause) {
    throw new Error(`Strict released-Codex falsification requires Docker: ${cause.message}`);
  }
  if (result.code !== 0 || result.stdout.trim() === '') {
    throw new Error(
      `Strict released-Codex falsification requires Docker${
        result.stderr.trim() ? `: ${result.stderr.trim()}` : ''
      }`
    );
  }
}

async function hashCheckoutReal(root) {
  const hash = createHash('sha256');
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (relativeDirectory === '' && entry.name === '.git') continue;
      const relative = path.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relative}\0`);
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        hash.update(`file\0${relative}\0`);
        hash.update(await readFile(absolute));
        hash.update('\0');
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relative}\0${await readlink(absolute)}\0`);
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

function stringValues(value, values = []) {
  if (typeof value === 'string') {
    values.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) stringValues(item, values);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) stringValues(item, values);
  }
  return values;
}

function realPersonalMarkers() {
  const home = os.homedir();
  return [...new Set([
    home,
    path.basename(home),
    process.env.USER,
    process.env.LOGNAME
  ].filter((value) => typeof value === 'string' && value.length >= 3))];
}

export function validateBoundaryReport(report) {
  if (report?.schemaVersion !== '0.1.0') {
    throw new Error('Boundary report schemaVersion was not 0.1.0');
  }
  for (const field of [
    'credentialEnvironmentAbsent',
    'stateWritable',
    'outputWritable',
    'workspaceReadOnly',
    'unrelatedHostCanaryInvisible',
    'hostLoopbackUnreachable',
    'externalNetworkUnreachable'
  ]) {
    if (report[field] !== true) throw new Error(`Boundary hard gate failed: ${field}`);
  }
  return report;
}

export function validateReleasedReceipt(receipt, options) {
  const expectedPlatform = `linux-${options.architecture}`;
  const receiptCode = validateReceipt(receipt, {
    codexVersion: options.version,
    plugin: 'sample',
    sourceRoot: '/workspace',
    platform: expectedPlatform,
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });
  if (receiptCode !== 0 || receipt.status !== 'PASS') {
    throw new Error(`Released Codex ${options.version} did not produce PASS`);
  }
  if (receipt.plugin.marketplace !== 'local-marketplace') {
    throw new Error(`Released Codex ${options.version} returned the wrong marketplace identity`);
  }
  const capabilities = new Map(receipt.capabilities.map((capability) => [
    `${capability.kind}\0${capability.key}`,
    capability
  ]));
  if (receipt.capabilities.length !== 3 || capabilities.size !== 3) {
    throw new Error(`Released Codex ${options.version} returned an unexpected capability set`);
  }
  const skill = capabilities.get('skill\0sample:sample-skill');
  if (
    skill?.source !== 'plugin/read + skills/list' ||
    skill.status !== 'DISCOVERED_EFFECTIVE'
  ) {
    throw new Error(`Released Codex ${options.version} did not expose the effective sample skill`);
  }
  const hook = capabilities.get(
    'hook\0sample@local-marketplace:hooks/hooks.json:session_start:0:0'
  );
  if (
    hook?.source !== 'plugin/read + hooks/list' ||
    !['DISCOVERED_UNTRUSTED', 'DISCOVERED_EFFECTIVE'].includes(hook.status)
  ) {
    throw new Error(`Released Codex ${options.version} did not expose the sample hook trust state`);
  }
  const mcp = capabilities.get('mcp\0sample-mcp');
  if (mcp?.source !== 'plugin/read' || mcp.status !== 'DECLARED_ONLY') {
    throw new Error(`Released Codex ${options.version} made an invalid MCP runtime claim`);
  }
  if (!Number.isFinite(options.durationMs) || options.durationMs < 0 || options.durationMs >= PROBE_LIMIT_MS) {
    throw new Error(`Released Codex ${options.version} probe reached the ${PROBE_LIMIT_MS}ms limit`);
  }
  const values = stringValues(receipt).map((value) => value.toLocaleLowerCase('en'));
  for (const marker of options.personalMarkers ?? []) {
    const normalized = marker.toLocaleLowerCase('en');
    if (normalized !== '' && values.some((value) => value.includes(normalized))) {
      throw new Error(`Released Codex ${options.version} receipt leaked a personal host marker`);
    }
  }
  return receipt;
}

function startHostLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    const fail = (cause) => reject(cause);
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', fail);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not resolve host loopback canary port'));
        return;
      }
      resolve({
        port: address.port,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((cause) => cause ? closeReject(cause) : closeResolve());
        })
      });
    });
  });
}

function canReachHostLoopback(port, timeoutMs = 1_000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => finish(true));
  });
}

export async function auditStrictBoundary({ fixtureRoot, version }, dependencies = {}) {
  const createIsolation = dependencies.createIsolation ?? createIsolationReal;
  const execute = dependencies.runProcess ?? runProcess;
  const temporaryRoot = await realpath(os.tmpdir());
  const hostCanaryRoot = await mkdtemp(path.join(temporaryRoot, 'codex-plugin-host-canary-'));
  const hostCanary = path.join(hostCanaryRoot, `unrelated-${randomUUID()}.txt`);
  const hostCanaryContent = `unrelated host canary ${randomUUID()}\n`;
  await writeFile(hostCanary, hostCanaryContent, { mode: 0o600 });
  let hostLoopback;
  let isolation;
  let report;
  let primaryError;
  try {
    hostLoopback = await startHostLoopbackServer();
    if (!(await canReachHostLoopback(hostLoopback.port))) {
      throw new Error('Host loopback canary was not reachable from the host');
    }
    isolation = await createIsolation({
      targetRoot: fixtureRoot,
      receiptPath: 'boundary-canary.json',
      mode: 'strict',
      platform: process.platform,
      codexVersion: version
    });
    const invocation = isolation.wrap('/usr/local/bin/node', [
      '/tool/scripts/boundary-canary.mjs',
      '--host-canary', hostCanary,
      '--host-loopback-port', String(hostLoopback.port),
      '--report', isolation.containerReceiptPath,
      '--workspace-marker', `.boundary-write-${randomUUID()}`
    ]);
    const child = await execute(invocation.command, invocation.args, {
      cwd: fixtureRoot,
      env: isolation.env,
      timeoutMs: 15_000
    });
    report = JSON.parse(await readFile(isolation.outputPath, 'utf8'));
    validateBoundaryReport(report);
    if (child.code !== 0) {
      throw new Error(`Boundary canary exited with code ${child.code}: ${child.stderr.trim()}`);
    }
  } catch (cause) {
    primaryError = cause;
  }
  if (isolation) {
    for (const finalize of [
      () => isolation.assertCheckoutUnchanged(),
      () => isolation.cleanup()
    ]) {
      try {
        await finalize();
      } catch (cause) {
        primaryError ??= cause;
      }
    }
  }
  if (hostLoopback) {
    try {
      await hostLoopback.close();
    } catch (cause) {
      primaryError ??= cause;
    }
  }
  try {
    if ((await readFile(hostCanary, 'utf8')) !== hostCanaryContent) {
      throw new Error('Unrelated host canary changed during boundary audit');
    }
  } catch (cause) {
    primaryError ??= cause;
  }
  try {
    await rm(hostCanaryRoot, { recursive: true, force: true });
  } catch (cause) {
    primaryError ??= cause;
  }
  if (primaryError) throw primaryError;
  return report;
}

async function probeVersionReal({ architecture, fixtureRoot, outputPath, version }, dependencies = {}) {
  const cliMain = dependencies.cliMain ?? cliMainReal;
  const execute = dependencies.runProcess ?? runProcess;
  let durationMs;
  let stderr = '';
  const timedContainerProcess = async (command, args, options) => {
    const started = performance.now();
    const result = await execute(command, args, options);
    durationMs = performance.now() - started;
    return result;
  };
  const code = await cliMain([
    '--marketplace-root', fixtureRoot,
    '--plugin', 'sample',
    '--codex-version', version,
    '--cwd', fixtureRoot,
    '--output', outputPath,
    '--isolation', 'strict',
    '--quiet'
  ], {
    stdout: { write: () => {} },
    stderr: { write: (value) => { stderr += String(value); } }
  }, {
    runProcess: timedContainerProcess
  });
  if (code !== 0) {
    throw new Error(`Released Codex ${version} strict probe failed with code ${code}: ${stderr.trim()}`);
  }
  if (durationMs === undefined) {
    throw new Error(`Released Codex ${version} did not enter the strict container probe`);
  }
  const receipt = JSON.parse(await readFile(outputPath, 'utf8'));
  validateReleasedReceipt(receipt, {
    architecture,
    durationMs,
    personalMarkers: realPersonalMarkers(),
    version
  });
  return { durationMs, receipt };
}

export async function runFalsifier(options = {}, dependencies = {}) {
  const env = options.env ?? process.env;
  const versions = requiredVersions(env);
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  const assertStrictDocker = dependencies.assertStrictDocker ?? assertStrictDockerReal;
  await assertStrictDocker({ platform });

  const fixtureRoot = await realpath(path.resolve(options.fixtureRoot ?? FIXTURE_ROOT));
  const outputRoot = options.outputRoot
    ? await realpath(path.resolve(options.outputRoot))
    : await realpath(await mkdtemp(path.join(await realpath(os.tmpdir()), 'codex-plugin-falsifier-')));
  await mkdir(outputRoot, { recursive: true });
  const hashCheckout = dependencies.hashCheckout ?? hashCheckoutReal;
  const auditBoundary = dependencies.auditBoundary ?? auditStrictBoundary;
  const probeVersion = dependencies.probeVersion ?? probeVersionReal;
  const beforeHash = await hashCheckout(fixtureRoot);
  const boundary = validateBoundaryReport(await auditBoundary({
    fixtureRoot,
    outputRoot,
    version: versions[0]
  }));
  const runs = [];
  for (const version of versions) {
    const outputPath = path.join(outputRoot, `codex-${version}.json`);
    const run = await probeVersion({ architecture, fixtureRoot, outputPath, version });
    validateReleasedReceipt(run.receipt, {
      architecture,
      durationMs: run.durationMs,
      personalMarkers: options.personalMarkers ?? realPersonalMarkers(),
      version
    });
    runs.push({
      version,
      durationMs: run.durationMs,
      receiptPath: outputPath,
      receipt: run.receipt
    });
  }
  const afterHash = await hashCheckout(fixtureRoot);
  if (afterHash !== beforeHash) {
    throw new Error(`Fixture checkout changed during released-Codex falsification (${beforeHash} -> ${afterHash})`);
  }
  const summary = {
    schemaVersion: '0.1.0',
    status: 'PASS',
    outputRoot,
    checkoutHash: beforeHash,
    boundary,
    versions: runs.map(({ version, durationMs, receiptPath }) => ({
      version,
      durationMs,
      receiptPath
    }))
  };
  await writeFile(
    path.join(outputRoot, 'falsifier-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 }
  );
  return { ...summary, versions: runs };
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    const result = await runFalsifier();
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      outputRoot: result.outputRoot,
      checkoutHash: result.checkoutHash,
      versions: result.versions.map(({ version, durationMs, receiptPath }) => ({
        version,
        durationMs,
        receiptPath
      }))
    }, null, 2)}\n`);
  } catch (cause) {
    process.stderr.write(`Falsifier error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
