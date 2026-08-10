import { spawn } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
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

function marketplaceFrom(value, marketplaceRoot) {
  const matches = value !== null && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.marketplaceName === 'string' && value.marketplaceName !== '' &&
    typeof value.installedRoot === 'string' && value.installedRoot !== '' &&
    path.resolve(value.installedRoot) === path.resolve(marketplaceRoot);
  if (!matches) {
    throw new Error('Codex marketplace add returned invalid marketplace JSON');
  }
  return value;
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
    pathIsWithin(installed.source.path, marketplaceRoot) &&
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

export async function resolveMarketplaceManifestPath(
  marketplaceRoot,
  marketplaceName,
  dependencies = {}
) {
  const read = dependencies.readFile ?? readFile;
  const canonicalize = dependencies.realpath ?? realpath;
  const inspect = dependencies.stat ?? stat;
  const canonicalRoot = await canonicalize(marketplaceRoot);
  // Keep this order aligned with core-plugins/src/marketplace.rs in Codex.
  for (const relativePath of [
    path.join('.agents', 'plugins', 'marketplace.json'),
    path.join('.agents', 'plugins', 'api_marketplace.json'),
    path.join('.claude-plugin', 'marketplace.json'),
    path.join('.cursor-plugin', 'marketplace.json')
  ]) {
    const candidate = path.join(canonicalRoot, relativePath);
    let canonicalPath;
    try {
      canonicalPath = await canonicalize(candidate);
    } catch (cause) {
      if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') continue;
      throw cause;
    }
    if (!pathIsWithin(canonicalPath, canonicalRoot)) {
      throw new Error('Marketplace manifest escaped the marketplace root');
    }
    if (!(await inspect(canonicalPath)).isFile()) continue;
    let manifest;
    try {
      manifest = JSON.parse(await read(canonicalPath, 'utf8'));
    } catch (cause) {
      if (cause instanceof SyntaxError) {
        throw new Error('Selected marketplace manifest was not valid JSON');
      }
      throw cause;
    }
    if (manifest?.name !== marketplaceName) {
      throw new Error('Selected marketplace manifest identity did not match Codex marketplace output');
    }
    return canonicalPath;
  }
  throw new Error(`No marketplace manifest matched ${marketplaceName}`);
}

function validatePluginReadIdentity(plugin, install, installed, marketplacePath) {
  const matches = plugin?.summary?.id === install.pluginId &&
    plugin.summary.name === install.name &&
    plugin.marketplaceName === install.marketplaceName &&
    plugin.summary.localVersion === install.version &&
    path.resolve(plugin.marketplacePath ?? '') === marketplacePath &&
    plugin.summary.source?.type === 'local' &&
    path.resolve(plugin.summary.source.path ?? '') === path.resolve(installed.source.path) &&
    plugin.summary.installed === true && plugin.summary.enabled === true;
  if (!matches) {
    throw new Error('Codex plugin/read evidence does not match the installed plugin');
  }
}

export async function checkPlugin(options, dependencies = {}) {
  if ((options.isolation ?? 'env') !== 'env') {
    throw new Error('checkPlugin only supports env isolation');
  }
  const runCommand = dependencies.runCommand ?? runRealCommand;
  const startAppServer = dependencies.startAppServer ?? AppServerClient.start;
  const makeIsolation = dependencies.createIsolation ?? createRealIsolation;
  const marketplaceRoot = await realpath(path.resolve(options.marketplaceRoot));
  const isolation = await makeIsolation({
    targetRoot: marketplaceRoot,
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
      cwd: options.cwd ?? marketplaceRoot,
      env: isolation.env
    });
    const marketplace = marketplaceFrom(
      JSON.parse((await runCommand(invocation([
        'plugin', 'marketplace', 'add', marketplaceRoot, '--json'
      ]))).stdout),
      marketplaceRoot
    );
    const findMarketplaceManifest = dependencies.resolveMarketplaceManifestPath ??
      resolveMarketplaceManifestPath;
    const marketplacePath = await findMarketplaceManifest(
      marketplaceRoot,
      marketplace.marketplaceName
    );
    const install = JSON.parse((await runCommand(invocation([
      'plugin', 'add', options.plugin, '--marketplace', marketplace.marketplaceName, '--json'
    ]))).stdout);
    if (!validInstall(install, options.plugin) ||
      install.marketplaceName !== marketplace.marketplaceName) {
      throw new Error('Codex plugin add returned invalid install JSON');
    }
    const list = JSON.parse((await runCommand(invocation(['plugin', 'list', '--json']))).stdout);
    const installed = installedPluginFrom(list, install, marketplaceRoot);
    client = await startAppServer({
      command: options.codex ?? 'codex',
      args: ['app-server', '--stdio', '--disable', 'remote_plugin'],
      cwd: options.cwd ?? marketplaceRoot,
      env: isolation.env,
      timeoutMs: options.timeoutMs ?? 30_000
    });
    await client.initialize();
    const pluginResult = await client.request('plugin/read', {
      pluginName: options.plugin,
      marketplacePath
    });
    validatePluginReadIdentity(pluginResult?.plugin, install, installed, marketplacePath);
    const declaredSkills = Array.isArray(pluginResult?.plugin?.skills) ? pluginResult.plugin.skills : [];
    const disabledSkills = options.disabledSkills ?? [];
    if (!Array.isArray(disabledSkills) || disabledSkills.some((name) =>
      typeof name !== 'string' || !declaredSkills.some((skill) => skill?.name === name))) {
      throw new Error('Disabled skill must name a declared plugin skill');
    }
    for (const name of new Set(disabledSkills)) {
      await client.request('skills/config/write', { path: null, name, enabled: false });
    }
    const skillsResult = await client.request('skills/list', {
      cwds: [marketplaceRoot],
      forceReload: true
    });
    const hooksResult = await client.request('hooks/list', { cwds: [marketplaceRoot] });
    const effectiveSkills = Array.isArray(skillsResult?.data)
      ? skillsResult.data
        .flatMap((entry) => Array.isArray(entry?.skills) ? entry.skills : [])
        .filter((skill) => skill?.enabled === true &&
          pathIsWithin(skill.path, install.installedPath))
      : [];
    const declaredHooks = Array.isArray(pluginResult?.plugin?.hooks) ? pluginResult.plugin.hooks : [];
    const declaredApps = Array.isArray(pluginResult?.plugin?.apps) ? pluginResult.plugin.apps : [];
    const declaredMcpServers = Array.isArray(pluginResult?.plugin?.mcpServers) ? pluginResult.plugin.mcpServers : [];
    const effectiveHooks = Array.isArray(hooksResult?.data)
      ? hooksResult.data
        .flatMap((entry) => Array.isArray(entry?.hooks) ? entry.hooks : [])
        .filter((hook) => hook?.enabled === true && hook.source === 'plugin' &&
          hook.pluginId === install.pluginId &&
          pathIsWithin(hook.sourcePath, install.installedPath))
      : [];
    result = buildReceipt({
      codexVersion: options.codexVersion,
      platform: `${options.platform ?? process.platform}-${options.architecture ?? process.arch}`,
      plugin: { name: options.plugin, marketplace: install.marketplaceName, sourceRoot: marketplaceRoot },
      declarations: {
        skills: declaredSkills,
        hooks: declaredHooks,
        apps: declaredApps,
        mcpServers: declaredMcpServers
      },
      effective: { skills: effectiveSkills, hooks: effectiveHooks },
      isolation: {
        mode: 'env',
        network: 'not_enforced',
        hostState: 'not_enforced'
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
