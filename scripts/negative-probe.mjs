#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkPlugin } from '../src/check-plugin.mjs';
import { exitCodeForStatus } from '../src/receipt.mjs';

const VALUE_FLAGS = new Set([
  '--marketplace-root',
  '--plugin',
  '--codex',
  '--codex-version',
  '--cwd',
  '--output',
  '--disable-skill'
]);

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!VALUE_FLAGS.has(flag) || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid negative-probe argument: ${flag ?? '<missing>'}`);
    }
    if (values[flag] !== undefined) throw new Error(`Duplicate negative-probe argument: ${flag}`);
    values[flag] = value;
  }
  for (const flag of VALUE_FLAGS) {
    if (!values[flag]) throw new Error(`Missing negative-probe argument: ${flag}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(values['--codex-version'])) {
    throw new Error('Negative probe requires an exact stable Codex version');
  }
  return values;
}

function runVersion(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--version'], {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Codex --version failed: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString('utf8').trim());
    });
  });
}

export async function runNegativeProbe(argv) {
  const options = parseArguments(argv);
  const marketplaceRoot = await realpath(path.resolve(options['--marketplace-root']));
  const cwd = await realpath(path.resolve(options['--cwd']));
  const versionOutput = await runVersion(options['--codex'], cwd);
  const versionMatch = versionOutput.match(/^(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+)$/);
  if (versionMatch?.[1] !== options['--codex-version']) {
    throw new Error(
      `Expected Codex ${options['--codex-version']} but observed ${versionOutput || '<empty>'}`
    );
  }
  const receipt = await checkPlugin({
    marketplaceRoot,
    plugin: options['--plugin'],
    codex: options['--codex'],
    codexVersion: options['--codex-version'],
    cwd,
    output: path.resolve(options['--output']),
    isolation: 'env',
    disabledSkills: [options['--disable-skill']]
  });
  await writeFile(
    path.resolve(options['--output']),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 }
  );
  return { code: exitCodeForStatus(receipt.status), receipt };
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    const result = await runNegativeProbe(process.argv.slice(2));
    process.exitCode = result.code;
  } catch (cause) {
    process.stderr.write(`Negative probe error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 2;
  }
}
