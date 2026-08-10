import { spawn } from 'node:child_process';
import path from 'node:path';
import { AppServerClient } from './app-server-client.mjs';
import { createIsolation as createRealIsolation } from './isolation.mjs';
import { buildReceipt } from './receipt.mjs';

function runRealCommand({ command, args, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code !== 0) {
        const status = code === null ? `signal ${signal}` : `code ${code}`;
        reject(new Error(`${command} exited with ${status}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
  });
}

function validInstall(value, pluginName) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    value.name === pluginName &&
    ['pluginId', 'marketplaceName', 'version', 'installedPath', 'authPolicy']
      .every((key) => typeof value[key] === 'string' && value[key] !== '');
}

function installedPluginFrom(list, install, marketplaceRoot) {
  const installed = Array.isArray(list?.installed)
    ? list.installed.find((item) => item?.pluginId === install.pluginId)
    : undefined;
  const matches = installed?.name === install.name &&
    installed.marketplaceName === install.marketplaceName &&
    installed.version === install.version &&
    installed.installed === true && installed.enabled === true &&
    installed.source?.source === 'local' &&
    path.resolve(installed.source.path ?? '') === path.resolve(install.installedPath) &&
    installed.marketplaceSource?.sourceType === 'local' &&
    path.resolve(installed.marketplaceSource.source ?? '') === path.resolve(marketplaceRoot);
  if (!matches) {
    throw new Error('Codex installed plugin source does not match the requested marketplace');
  }
  return installed;
}

function pathIsWithin(candidate, root) {
  if (typeof candidate !== 'string' || typeof root !== 'string') return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function checkPlugin(options, dependencies = {}) {
  const runCommand = dependencies.runCommand ?? runRealCommand;
  const startAppServer = dependencies.startAppServer ?? AppServerClient.start;
  const makeIsolation = dependencies.createIsolation ?? createRealIsolation;
  const isolation = await makeIsolation({
    targetRoot: options.marketplaceRoot,
    receiptPath: options.output ?? 'conformance.json',
    mode: options.isolation ?? 'env',
    platform: options.platform ?? process.platform,
    codexVersion: options.codexVersion
  });
  let client;
  let result;
  let primaryError;
  try {
    const invocation = (args) => ({
      command: options.codex ?? 'codex',
      args,
      cwd: options.cwd ?? options.marketplaceRoot,
      env: isolation.env
    });
    await runCommand(invocation(['plugin', 'marketplace', 'add', options.marketplaceRoot]));
    const install = JSON.parse((await runCommand(invocation(['plugin', 'add', options.plugin, '--json']))).stdout);
    if (!validInstall(install, options.plugin)) {
      throw new Error('Codex plugin add returned invalid install JSON');
    }
    const list = JSON.parse((await runCommand(invocation(['plugin', 'list', '--json']))).stdout);
    installedPluginFrom(list, install, options.marketplaceRoot);
    client = await startAppServer({
      command: options.codex ?? 'codex',
      args: ['app-server', '--stdio', '--disable', 'remote_plugin'],
      cwd: options.cwd ?? options.marketplaceRoot,
      env: isolation.env,
      timeoutMs: options.timeoutMs ?? 30_000
    });
    await client.initialize();
    const pluginResult = await client.request('plugin/read', { pluginName: options.plugin, marketplacePath: options.marketplaceRoot });
    const skillsResult = await client.request('skills/list', { cwds: [options.cwd ?? options.marketplaceRoot], forceReload: true });
    const hooksResult = await client.request('hooks/list', { cwds: [options.cwd ?? options.marketplaceRoot] });
    const declaredSkills = Array.isArray(pluginResult?.plugin?.skills) ? pluginResult.plugin.skills : [];
    const effectiveSkills = Array.isArray(skillsResult?.data)
      ? skillsResult.data.flatMap((entry) => Array.isArray(entry?.skills) ? entry.skills : [])
      : [];
    const declaredHooks = Array.isArray(pluginResult?.plugin?.hooks) ? pluginResult.plugin.hooks : [];
    const declaredApps = Array.isArray(pluginResult?.plugin?.apps) ? pluginResult.plugin.apps : [];
    const declaredMcpServers = Array.isArray(pluginResult?.plugin?.mcpServers) ? pluginResult.plugin.mcpServers : [];
    const effectiveHooks = Array.isArray(hooksResult?.data)
      ? hooksResult.data
        .flatMap((entry) => Array.isArray(entry?.hooks) ? entry.hooks : [])
        .filter((hook) => hook?.source === 'plugin' &&
          (hook.pluginId === install.pluginId || pathIsWithin(hook.sourcePath, install.installedPath)))
      : [];
    result = buildReceipt({
      codexVersion: options.codexVersion,
      platform: `${options.platform ?? process.platform}-${options.architecture ?? process.arch}`,
      plugin: { name: options.plugin, marketplace: install.marketplaceName, sourceRoot: options.marketplaceRoot },
      declarations: {
        skills: declaredSkills,
        hooks: declaredHooks,
        apps: declaredApps,
        mcpServers: declaredMcpServers
      },
      effective: { skills: effectiveSkills, hooks: effectiveHooks },
      isolation: {
        mode: options.isolation ?? 'env',
        network: options.isolation === 'strict' ? 'denied' : 'not_enforced',
        hostState: 'denied'
      }
    });
  } catch (cause) {
    primaryError = cause;
  }
  for (const finalize of [
    () => client?.close(),
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
  return result;
}
