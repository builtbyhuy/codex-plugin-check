#!/usr/bin/env node

import net from 'node:net';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CREDENTIAL_NAMES = new Set([
  'ALL_PROXY',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_PROFILE',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AZURE_CLIENT_SECRET',
  'AZURE_CONFIG_DIR',
  'CHATGPT_API_KEY',
  'CLOUDSDK_CONFIG',
  'DOCKER_CONFIG',
  'GIT_ASKPASS',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'KUBECONFIG',
  'NETRC',
  'NODE_AUTH_TOKEN',
  'NO_PROXY',
  'NPM_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_ORG_ID',
  'SSH_AGENT_PID',
  'SSH_AUTH_SOCK'
]);
const CREDENTIAL_SUFFIX = /(?:^|_)(?:API_KEY|AUTH_TOKEN|BEARER|COOKIE|CREDENTIAL|CREDENTIALS|CREDENTIALS_FILE|PASSWORD|PRIVATE_KEY|SECRET|SESSION_TOKEN|TOKEN)$/;
const WRITE_DENIAL_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (![
      '--host-canary',
      '--host-loopback-port',
      '--report',
      '--workspace-marker'
    ].includes(flag) || value === undefined) {
      throw new Error(
        'Boundary canary requires --host-canary, --host-loopback-port, --report, and --workspace-marker'
      );
    }
    values[flag.slice(2)] = value;
  }
  if (
    !values['host-canary'] ||
    !values['host-loopback-port'] ||
    !values.report ||
    !values['workspace-marker']
  ) {
    throw new Error(
      'Boundary canary requires --host-canary, --host-loopback-port, --report, and --workspace-marker'
    );
  }
  if (path.basename(values['workspace-marker']) !== values['workspace-marker']) {
    throw new Error('Workspace marker must be a filename');
  }
  const hostLoopbackPort = Number(values['host-loopback-port']);
  if (!Number.isInteger(hostLoopbackPort) || hostLoopbackPort < 1 || hostLoopbackPort > 65_535) {
    throw new Error('Host loopback port must be an integer from 1 through 65535');
  }
  values.hostLoopbackPort = hostLoopbackPort;
  return values;
}

async function writeRoundTrip(filename, value) {
  await writeFile(filename, value, { mode: 0o600 });
  const observed = await readFile(filename, 'utf8');
  await rm(filename, { force: true });
  return observed === value;
}

async function cannotConnect(host, port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (blocked) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(blocked);
    };
    socket.setTimeout(timeoutMs, () => finish(true));
    socket.once('error', () => finish(true));
    socket.once('connect', () => finish(false));
  });
}

export function credentialEnvironmentIsClean(environment) {
  return !Object.keys(environment).some((name) =>
    CREDENTIAL_NAMES.has(name) || CREDENTIAL_SUFFIX.test(name)
  );
}

export async function runBoundaryCanary(argv, environment = process.env) {
  const options = parseArguments(argv);
  const stateProbe = path.join(environment.CODEX_HOME ?? '', 'boundary-state.txt');
  const outputProbe = path.join(path.dirname(options.report), '.boundary-output-probe');
  const workspaceProbe = path.join('/workspace', options['workspace-marker']);

  let stateWritable = false;
  let outputWritable = false;
  let workspaceReadOnly = false;
  let unrelatedHostCanaryInvisible = false;
  try {
    stateWritable = await writeRoundTrip(stateProbe, 'owned-state\n');
  } catch {
    stateWritable = false;
  }
  try {
    outputWritable = await writeRoundTrip(outputProbe, 'owned-output\n');
  } catch {
    outputWritable = false;
  }
  try {
    await writeFile(workspaceProbe, 'workspace must stay read-only\n', { flag: 'wx' });
    await rm(workspaceProbe, { force: true });
  } catch (cause) {
    workspaceReadOnly = WRITE_DENIAL_CODES.has(cause?.code);
  }
  try {
    await access(options['host-canary']);
  } catch {
    unrelatedHostCanaryInvisible = true;
  }

  const report = {
    schemaVersion: '0.1.0',
    credentialEnvironmentAbsent: credentialEnvironmentIsClean(environment),
    stateWritable,
    outputWritable,
    workspaceReadOnly,
    unrelatedHostCanaryInvisible,
    hostLoopbackUnreachable: await cannotConnect('127.0.0.1', options.hostLoopbackPort),
    externalNetworkUnreachable: await cannotConnect('1.1.1.1', 443)
  };
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600
  });
  return report;
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    const report = await runBoundaryCanary(process.argv.slice(2));
    process.exitCode = Object.entries(report)
      .filter(([name]) => name !== 'schemaVersion')
      .every(([, value]) => value === true) ? 0 : 1;
  } catch (cause) {
    process.stderr.write(`Boundary canary error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 2;
  }
}
