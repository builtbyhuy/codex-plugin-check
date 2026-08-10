#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkPlugin as checkRealPlugin } from './check-plugin.mjs';
import { createIsolation as createRealIsolation } from './isolation.mjs';
import { exitCodeForStatus } from './receipt.mjs';

const VALUE_FLAGS = new Set([
  '--marketplace-root',
  '--plugin',
  '--codex',
  '--codex-version',
  '--cwd',
  '--output',
  '--isolation'
]);
const BOOLEAN_FLAGS = new Set(['--help', '--quiet']);
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const RECEIPT_STATUSES = new Set([
  'PASS',
  'FAIL',
  'INCONCLUSIVE',
  'ISOLATION_VIOLATION'
]);
const CAPABILITY_KINDS = new Set(['skill', 'hook', 'mcp', 'app']);
const CAPABILITY_STATUSES = new Set([
  'DISCOVERED_EFFECTIVE',
  'DISCOVERED_UNTRUSTED',
  'DECLARED_ONLY',
  'UNOBSERVABLE',
  'MISSING'
]);
const CAPTURE_LIMIT = 1024 * 1024;
const VERSION_TIMEOUT_MS = 10_000;
const STRICT_TIMEOUT_MS = 90_000;

const HELP = `Usage: codex-plugin-check --marketplace-root <path> --plugin <name> --codex-version <version> [options]

Options:
  --codex <path>          Codex binary for env diagnostics (default: codex)
  --cwd <path>            Probe workspace (default: marketplace root)
  --output <path>         Receipt path (default: conformance.json)
  --isolation <mode>      strict or env (default: strict)
  --quiet                 Suppress the human summary
  --help                  Show this help
`;

function parseArguments(argv) {
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    if (BOOLEAN_FLAGS.has(flag)) {
      parsed[flag.slice(2)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  if (parsed.help) return parsed;
  if (!parsed['marketplace-root']) throw new Error('Missing required --marketplace-root');
  if (!parsed.plugin) throw new Error('Missing required --plugin');
  if (!parsed['codex-version']) throw new Error('Missing required --codex-version');
  if (!EXACT_VERSION.test(parsed['codex-version'])) {
    throw new Error('--codex-version must be an exact stable numeric version');
  }
  parsed.codex ??= 'codex';
  parsed.output ??= 'conformance.json';
  parsed.isolation ??= 'strict';
  if (parsed.isolation !== 'strict' && parsed.isolation !== 'env') {
    throw new Error('--isolation must be strict or env');
  }
  return parsed;
}

function writeIo(stream, value) {
  if (stream && typeof stream.write === 'function') stream.write(value);
}

function appendBounded(chunks, chunk, state) {
  const buffer = Buffer.from(chunk);
  state.bytes += buffer.length;
  if (state.bytes > CAPTURE_LIMIT) {
    throw new Error(`Child output exceeded ${CAPTURE_LIMIT} bytes`);
  }
  chunks.push(buffer);
}

function runRealProcess(command, args, options = {}) {
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
    let timer;
    let settled = false;

    const terminate = (cause) => {
      forcedError ??= cause;
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 100);
      killTimer.unref?.();
    };
    child.stdout.on('data', (chunk) => {
      try {
        appendBounded(stdout, chunk, stdoutState);
      } catch (cause) {
        terminate(cause);
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        appendBounded(stderr, chunk, stderrState);
      } catch (cause) {
        terminate(cause);
      }
    });
    child.once('error', (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(cause);
    });
    child.once('exit', (code, signal) => {
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
    const timeoutMs = options.timeoutMs ?? VERSION_TIMEOUT_MS;
    timer = setTimeout(
      () => terminate(new Error(`${command} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    timer.unref?.();
  });
}

function resolveBinary(value, baseDirectory) {
  return value.includes('/') || value.includes('\\')
    ? path.resolve(baseDirectory, value)
    : value;
}

function parseCodexVersion(stdout) {
  const match = stdout.trim().match(/^(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+)$/);
  if (!match) throw new Error('Codex --version returned an unrecognized value');
  return match[1];
}

async function verifyCodexVersion(options, runProcess, environment) {
  const result = await runProcess(options.codex, ['--version'], {
    cwd: options.cwd,
    env: environment,
    shell: false,
    timeoutMs: VERSION_TIMEOUT_MS
  });
  if (result.code !== 0) {
    const detail = result.stderr?.trim();
    throw new Error(`Codex --version exited with code ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  const actual = parseCodexVersion(result.stdout ?? '');
  if (actual !== options.codexVersion) {
    throw new Error(`Expected ${options.codexVersion} but Codex reported ${actual}`);
  }
}

function hasExactIsolation(receipt, expected) {
  return receipt?.isolation !== null && typeof receipt?.isolation === 'object' &&
    !Array.isArray(receipt.isolation) &&
    Object.keys(receipt.isolation).sort().join(',') === 'hostState,mode,network' &&
    receipt.isolation.mode === expected.mode &&
    receipt.isolation.network === expected.network &&
    receipt.isolation.hostState === expected.hostState;
}

function validateCommonReceipt(receipt, expected) {
  const validStatus = exitCodeForStatus(receipt?.status);
  if (receipt?.schemaVersion !== '0.1.0' ||
    !RECEIPT_STATUSES.has(receipt.status) || !Number.isInteger(validStatus)) {
    throw new Error('Probe returned an invalid receipt schema or status');
  }
  if (receipt.codexVersion !== expected.codexVersion) {
    throw new Error('Probe receipt Codex version does not match the request');
  }
  if (receipt.plugin?.name !== expected.plugin ||
    receipt.plugin?.sourceRoot !== expected.sourceRoot ||
    typeof receipt.plugin?.marketplace !== 'string' || receipt.plugin.marketplace === '') {
    throw new Error('Probe receipt plugin identity or source root does not match the request');
  }
  if (typeof receipt.platform !== 'string' || receipt.platform === '' ||
    !Array.isArray(receipt.capabilities) || receipt.capabilities.some((capability) =>
      !CAPABILITY_KINDS.has(capability?.kind) ||
      typeof capability?.key !== 'string' || capability.key === '' ||
      typeof capability?.source !== 'string' || capability.source === '' ||
      !CAPABILITY_STATUSES.has(capability?.status))) {
    throw new Error('Probe receipt platform or capabilities do not match the schema');
  }
  return validStatus;
}

async function writeReceipt(output, receipt, dependencies) {
  const makeDirectory = dependencies.mkdir ?? mkdir;
  const write = dependencies.writeFile ?? writeFile;
  await makeDirectory(path.dirname(output), { recursive: true });
  await write(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function printSummary(io, receipt, quiet) {
  if (!quiet) {
    writeIo(
      io.stdout,
      `codex-plugin-check: ${receipt.status} (${receipt.plugin.name}, Codex ${receipt.codexVersion})\n`
    );
  }
}

async function runEnv(options, io, dependencies) {
  const runProcess = dependencies.runProcess ?? runRealProcess;
  const checkPlugin = dependencies.checkPlugin ?? checkRealPlugin;
  await verifyCodexVersion(options, runProcess, dependencies.processEnv ?? process.env);
  const receipt = await checkPlugin({
    marketplaceRoot: options.marketplaceRoot,
    plugin: options.plugin,
    codex: options.codex,
    codexVersion: options.codexVersion,
    cwd: options.cwd,
    output: options.output,
    isolation: 'env'
  });
  const code = validateCommonReceipt(receipt, {
    codexVersion: options.codexVersion,
    plugin: options.plugin,
    sourceRoot: options.marketplaceRoot
  });
  if (!hasExactIsolation(receipt, {
    mode: 'env',
    network: 'not_enforced',
    hostState: 'not_enforced'
  })) {
    throw new Error('Env receipt must use env isolation with not_enforced boundaries');
  }
  await writeReceipt(options.output, receipt, dependencies);
  printSummary(io, receipt, options.quiet);
  return code;
}

function containerWorkspacePath(marketplaceRoot, cwd) {
  const relative = path.relative(marketplaceRoot, cwd);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Strict --cwd must be inside the marketplace root');
  }
  return relative === ''
    ? '/workspace'
    : path.posix.join('/workspace', ...relative.split(path.sep));
}

async function runStrict(options, io, dependencies) {
  const createIsolation = dependencies.createIsolation ?? createRealIsolation;
  const runProcess = dependencies.runProcess ?? runRealProcess;
  const read = dependencies.readFile ?? readFile;
  const containerCwd = containerWorkspacePath(options.marketplaceRoot, options.cwd);
  const isolation = await createIsolation({
    targetRoot: options.marketplaceRoot,
    receiptPath: options.output,
    mode: 'strict',
    platform: dependencies.platform ?? process.platform,
    codexVersion: options.codexVersion
  });
  let primaryError;
  let stagedReceipt;
  let childCode;
  try {
    const innerArgs = [
      '/tool/src/cli.mjs',
      '--marketplace-root', '/workspace',
      '--plugin', options.plugin,
      '--codex', '/usr/local/bin/codex',
      '--codex-version', options.codexVersion,
      '--cwd', containerCwd,
      '--output', isolation.containerReceiptPath,
      '--isolation', 'env',
      '--quiet'
    ];
    const invocation = isolation.wrap('/usr/local/bin/node', innerArgs);
    const child = await runProcess(invocation.command, invocation.args, {
      cwd: options.marketplaceRoot,
      env: isolation.env,
      shell: false,
      timeoutMs: STRICT_TIMEOUT_MS
    });
    childCode = child.code;
    stagedReceipt = JSON.parse(await read(isolation.outputPath, 'utf8'));
    const expectedCode = validateCommonReceipt(stagedReceipt, {
      codexVersion: options.codexVersion,
      plugin: options.plugin,
      sourceRoot: '/workspace'
    });
    if (!hasExactIsolation(stagedReceipt, {
      mode: 'env',
      network: 'not_enforced',
      hostState: 'not_enforced'
    })) {
      throw new Error('Staged receipt must use exact env/not_enforced isolation');
    }
    if (childCode !== expectedCode) {
      throw new Error(
        `Staged receipt status and child exit code disagree (${stagedReceipt.status} vs ${childCode})`
      );
    }
  } catch (cause) {
    primaryError = cause;
  }
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
  if (primaryError) throw primaryError;
  const certifiedReceipt = {
    ...stagedReceipt,
    isolation: {
      mode: 'strict',
      network: 'denied',
      hostState: 'denied'
    }
  };
  await writeReceipt(options.output, certifiedReceipt, dependencies);
  printSummary(io, certifiedReceipt, options.quiet);
  return childCode;
}

export async function main(argv, io = process, dependencies = {}) {
  try {
    const parsed = parseArguments(argv);
    if (parsed.help) {
      writeIo(io.stdout, HELP);
      return 0;
    }
    const baseDirectory = path.resolve(dependencies.cwd ?? process.cwd());
    const resolveRealPath = dependencies.realpath ?? realpath;
    const marketplaceRoot = await resolveRealPath(
      path.resolve(baseDirectory, parsed['marketplace-root'])
    );
    const cwd = await resolveRealPath(
      path.resolve(baseDirectory, parsed.cwd ?? marketplaceRoot)
    );
    const options = {
      marketplaceRoot,
      plugin: parsed.plugin,
      codex: resolveBinary(parsed.codex, baseDirectory),
      codexVersion: parsed['codex-version'],
      cwd,
      output: path.resolve(baseDirectory, parsed.output),
      isolation: parsed.isolation,
      quiet: parsed.quiet === true
    };
    if (options.isolation === 'env') return await runEnv(options, io, dependencies);
    return await runStrict(options, io, dependencies);
  } catch (cause) {
    writeIo(io.stderr, `Error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 2;
  }
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  process.exitCode = await main(process.argv.slice(2), process);
}
