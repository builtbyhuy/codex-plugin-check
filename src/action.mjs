import { randomUUID as randomRealUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as cliMainReal } from './cli.mjs';

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

export async function runAction(env = process.env, io = process, dependencies = {}) {
  const cliMain = dependencies.cliMain ?? cliMainReal;
  const argv = [];
  for (const [input, flag] of INPUTS) {
    const value = env[`INPUT_${input}`];
    if (value !== undefined && value !== '') argv.push(flag, value);
  }
  const code = await cliMain(argv, io, dependencies.cliDependencies ?? {});
  const baseDirectory = path.resolve(dependencies.cwd ?? process.cwd());
  const receiptPath = path.resolve(baseDirectory, env.INPUT_OUTPUT || 'conformance.json');
  const read = dependencies.readFile ?? readFile;
  let receiptText;
  try {
    receiptText = await read(receiptPath, 'utf8');
  } catch (cause) {
    if (cause?.code === 'ENOENT') return code;
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
  if (typeof receipt.status !== 'string' || typeof receipt.codexVersion !== 'string') {
    writeIo(io.stderr, 'Error: Action receipt is missing status or codexVersion\n');
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
