const EXIT_CODES = Object.freeze({
  PASS: 0,
  FAIL: 1,
  TOOL_ERROR: 2,
  INCONCLUSIVE: 3,
  ISOLATION_VIOLATION: 4
});

const CAPABILITY_SOURCES = Object.freeze([
  ['skill', 'skills'],
  ['hook', 'hooks'],
  ['mcp', 'mcpServers'],
  ['app', 'apps']
]);

const EVIDENCE_SOURCES = Object.freeze({
  skill: 'plugin/read + skills/list',
  hook: 'plugin/read + hooks/list',
  mcp: 'plugin/read',
  app: 'plugin/read'
});

function keyFor(kind, item) {
  if (kind === 'mcp') return item;
  if (kind === 'app') return item.id;
  if (kind === 'hook') return item.key;
  return item.name;
}

function compareCapabilities(left, right) {
  if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
  if (left.key === right.key) return 0;
  return left.key < right.key ? -1 : 1;
}

export function evaluateCapability({ kind, key, declaration, effectiveMatch }) {
  if (kind === 'mcp' || kind === 'app') {
    return { kind, key, source: EVIDENCE_SOURCES[kind], status: 'DECLARED_ONLY' };
  }

  if (effectiveMatch === null) {
    return { kind, key, source: EVIDENCE_SOURCES[kind], status: 'UNOBSERVABLE' };
  }

  if (effectiveMatch === undefined) {
    return { kind, key, source: EVIDENCE_SOURCES[kind], status: 'MISSING' };
  }

  return {
    kind,
    key,
    source: EVIDENCE_SOURCES[kind],
    status: kind === 'hook' && effectiveMatch.trustStatus === 'untrusted'
      ? 'DISCOVERED_UNTRUSTED'
      : 'DISCOVERED_EFFECTIVE'
  };
}

export function buildReceipt({ codexVersion, platform, plugin, declarations = {}, effective = {}, isolation }) {
  const capabilities = CAPABILITY_SOURCES.flatMap(([kind, source]) => {
    const effectiveCollection = effective?.[source];
    const registryObserved = effectiveCollection !== undefined && effectiveCollection !== null;
    const effectiveByKey = new Map(
      (effectiveCollection ?? []).map((item) => [keyFor(kind, item), item])
    );

    return (declarations[source] ?? []).map((declaration) => {
      const key = keyFor(kind, declaration);
      return evaluateCapability({
        kind,
        key,
        declaration,
        effectiveMatch: registryObserved ? effectiveByKey.get(key) : null
      });
    });
  }).sort(compareCapabilities);

  const hasMissingRuntimeCapability = capabilities.some(({ kind, status }) => (
    (kind === 'skill' || kind === 'hook') && status === 'MISSING'
  ));
  const hasUnobservableRuntimeCapability = capabilities.some(({ kind, status }) => (
    (kind === 'skill' || kind === 'hook') && status === 'UNOBSERVABLE'
  ));

  return {
    schemaVersion: '0.1.0',
    codexVersion,
    platform,
    plugin,
    isolation,
    capabilities,
    status: hasMissingRuntimeCapability
      ? 'FAIL'
      : hasUnobservableRuntimeCapability
        ? 'INCONCLUSIVE'
        : 'PASS'
  };
}

export function exitCodeForStatus(status) {
  return EXIT_CODES[status];
}
