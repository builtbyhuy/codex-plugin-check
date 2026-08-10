import { randomUUID as randomRealUUID } from 'node:crypto';
import { appendFile, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as cliMainReal, validateReceipt } from './cli.mjs';

const INPUTS = [
  ['MARKETPLACE-ROOT', '--marketplace-root'],
  ['PLUGIN', '--plugin'],
  ['CODEX', '--codex'],
  ['CODEX-VERSION', '--codex-version'],
  ['CWD', '--cwd'],
  ['OUTPUT', '--output'],
  ['ISOLATION', '--isolation']
];
function writeIo(stream, value) {
  if (stream && typeof stream.write === 'function') stream.write(value);
}

function delimiterFor(value, randomUUID) {
  const valueLines = new Set(value.split(/\r?\n/));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const identifier = String(randomUUID()).replace(/[^A-Za-z0-9_-]/g, '');
    const delimiter = `codex_plugin_check_${identifier}`;
    if (identifier !== '' && !valueLines.has(delimiter)) return delimiter;
  }
  throw new Error('Unable to construct a collision-free GitHub output delimiter');
}

function githubOutputBlock(name, value, randomUUID) {
  const delimiter = delimiterFor(value, randomUUID);
  return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
}

async function receiptIdentity(receiptPath, inspect) {
  try {
    const metadata = await inspect(receiptPath, { bigint: true });
    return {
      device: metadata.dev.toString(),
      inode: metadata.ino.toString(),
      regularFile: metadata.isFile()
    };
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    throw cause;
  }
}

function sameIdentity(left, right) {
  return left !== null && right !== null &&
    left.device === right.device && left.inode === right.inode;
}

async function receiptExpectation(env, baseDirectory, dependencies) {
  const common = {
    codexVersion: env['INPUT_CODEX-VERSION'],
    plugin: env.INPUT_PLUGIN
  };
  const isolation = env.INPUT_ISOLATION || 'strict';
  if (isolation === 'strict') {
    return {
      ...common,
      sourceRoot: '/workspace',
      platformOs: 'linux',
      isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
    };
  }
  if (isolation === 'env') {
    if (!env['INPUT_MARKETPLACE-ROOT']) {
      throw new Error('Environment mode requires a marketplace root');
    }
    const resolveRealPath = dependencies.realpath ?? realpath;
    return {
      ...common,
      sourceRoot: await resolveRealPath(
        path.resolve(baseDirectory, env['INPUT_MARKETPLACE-ROOT'])
      ),
      platform: `${process.platform}-${process.arch}`,
      isolation: { mode: 'env', network: 'not_enforced', hostState: 'not_enforced' }
    };
  }
  throw new Error('Action isolation must be strict or env');
}

export async function runAction(env = process.env, io = process, dependencies = {}) {
  const cliMain = dependencies.cliMain ?? cliMainReal;
  const baseDirectory = path.resolve(dependencies.cwd ?? process.cwd());
  const receiptPath = path.resolve(baseDirectory, env.INPUT_OUTPUT || 'conformance.json');
  const inspect = dependencies.lstat ?? lstat;
  let before;
  try {
    before = await receiptIdentity(receiptPath, inspect);
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not inspect Action receipt destination: ${cause.message}\n`);
    return 2;
  }
  const argv = [];
  for (const [input, flag] of INPUTS) {
    const value = env[`INPUT_${input}`];
    if (value !== undefined && value !== '') argv.push(flag, value);
  }
  const code = await cliMain(argv, io, dependencies.cliDependencies ?? {});
  if (code === 2) return 2;
  let after;
  try {
    after = await receiptIdentity(receiptPath, inspect);
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not inspect current Action receipt: ${cause.message}\n`);
    return 2;
  }
  if (after === null || !after.regularFile || sameIdentity(before, after)) {
    writeIo(io.stderr, 'Error: CLI did not produce a fresh receipt for this invocation\n');
    return 2;
  }
  const read = dependencies.readFile ?? readFile;
  let receiptText;
  try {
    receiptText = await read(receiptPath, 'utf8');
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not read Action receipt: ${cause.message}\n`);
    return 2;
  }
  let receipt;
  try {
    receipt = JSON.parse(receiptText);
  } catch (cause) {
    writeIo(io.stderr, `Error: Action receipt is not valid JSON: ${cause.message}\n`);
    return 2;
  }
  let expected;
  try {
    expected = await receiptExpectation(env, baseDirectory, dependencies);
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not establish expected Action receipt: ${cause.message}\n`);
    return 2;
  }
  let receiptCode;
  try {
    receiptCode = validateReceipt(receipt, expected);
  } catch (cause) {
    writeIo(io.stderr, `Error: Invalid Action receipt: ${cause.message}\n`);
    return 2;
  }
  if (receiptCode !== code) {
    writeIo(io.stderr, 'Error: Action receipt status and CLI exit code disagree\n');
    return 2;
  }
  let afterRead;
  try {
    afterRead = await receiptIdentity(receiptPath, inspect);
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not recheck current Action receipt: ${cause.message}\n`);
    return 2;
  }
  if (!sameIdentity(after, afterRead)) {
    writeIo(io.stderr, 'Error: Action receipt changed while it was being read\n');
    return 2;
  }
  if (!env.GITHUB_OUTPUT) {
    writeIo(io.stderr, 'Error: GITHUB_OUTPUT is required when a receipt exists\n');
    return 2;
  }
  const randomUUID = dependencies.randomUUID ?? randomRealUUID;
  const normalizedReceipt = `${JSON.stringify(receipt, null, 2)}`;
  const payload = [
    githubOutputBlock('status', receipt.status, randomUUID),
    githubOutputBlock('receipt', normalizedReceipt, randomUUID),
    githubOutputBlock('codex-version', receipt.codexVersion, randomUUID)
  ].join('');
  const append = dependencies.appendFile ?? appendFile;
  try {
    await append(env.GITHUB_OUTPUT, payload, 'utf8');
  } catch (cause) {
    writeIo(io.stderr, `Error: Could not publish Action outputs: ${cause.message}\n`);
    return 2;
  }
  return code;
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    process.exitCode = await runAction(process.env, process);
  } catch (cause) {
    writeIo(process.stderr, `Error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 2;
  }
}
