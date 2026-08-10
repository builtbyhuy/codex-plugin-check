export function buildReceipt({ codexVersion, platform, plugin, declarations = {}, effective = {}, isolation }) {
  const definitions = [
    ['skill', 'skills', (item) => item.name],
    ['hook', 'hooks', (item) => item.key],
    ['mcp', 'mcpServers', (item) => item],
    ['app', 'apps', (item) => item.id]
  ];
  const capabilities = definitions.flatMap(([kind, collection, selectKey]) => {
    const effectiveCollection = effective?.[collection];
    const registryObserved = effectiveCollection !== undefined && effectiveCollection !== null;
    const effectiveByKey = new Map(
      (effectiveCollection ?? []).map((item) => [selectKey(item), item])
    );
    return (declarations[collection] ?? []).map((declaration) => {
      const key = selectKey(declaration);
      return evaluateCapability({
        kind,
        key,
        declaration,
        effectiveMatch: registryObserved ? effectiveByKey.get(key) : null
      });
    });
  }).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    if (left.key === right.key) return 0;
    return left.key < right.key ? -1 : 1;
  });
  const hasMissing = capabilities.some(({ status }) => status === 'MISSING');
  const hasUnobservable = capabilities.some(({ status }) => status === 'UNOBSERVABLE');

  return {
    schemaVersion: '0.1.0',
    status: hasMissing ? 'FAIL' : hasUnobservable ? 'INCONCLUSIVE' : 'PASS',
    codexVersion,
    platform,
    plugin,
    capabilities,
    isolation
  };
}

export function evaluateCapability({ kind, key, effectiveMatch }) {
  if (kind === 'mcp' || kind === 'app') {
    return { kind, key, source: 'plugin/read', status: 'DECLARED_ONLY' };
  }

  if (kind === 'skill' && effectiveMatch != null) {
    return {
      kind,
      key,
      source: 'plugin/read + skills/list',
      status: 'DISCOVERED_EFFECTIVE'
    };
  }

  if (kind === 'hook' && effectiveMatch?.trustStatus === 'untrusted') {
    return {
      kind,
      key,
      source: 'plugin/read + hooks/list',
      status: 'DISCOVERED_UNTRUSTED'
    };
  }

  if (kind === 'hook' && effectiveMatch != null) {
    return {
      kind,
      key,
      source: 'plugin/read + hooks/list',
      status: 'DISCOVERED_EFFECTIVE'
    };
  }

  if ((kind === 'skill' || kind === 'hook') && effectiveMatch === null) {
    return { kind, key, source: 'plugin/read', status: 'UNOBSERVABLE' };
  }

  if ((kind === 'skill' || kind === 'hook') && effectiveMatch === undefined) {
    return {
      kind,
      key,
      source: kind === 'skill'
        ? 'plugin/read + skills/list'
        : 'plugin/read + hooks/list',
      status: 'MISSING'
    };
  }
}

export function exitCodeForStatus(status) {
  return {
    PASS: 0,
    FAIL: 1,
    TOOL_ERROR: 2,
    INCONCLUSIVE: 3,
    ISOLATION_VIOLATION: 4
  }[status];
}
