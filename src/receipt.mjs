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
    return { kind, key, declaration, status: 'DECLARED_ONLY' };
  }

  if (effectiveMatch === undefined) {
    return { kind, key, declaration, status: 'MISSING' };
  }

  return {
    kind,
    key,
    declaration,
    effective: effectiveMatch,
    status: kind === 'hook' && effectiveMatch.trustStatus === 'untrusted'
      ? 'DISCOVERED_UNTRUSTED'
      : 'DISCOVERED_EFFECTIVE'
  };
}

export function buildReceipt({ codexVersion, platform, plugin, declarations = {}, effective = {}, isolation }) {
  const capabilities = CAPABILITY_SOURCES.flatMap(([kind, source]) => {
    const effectiveByKey = new Map(
      (effective[source] ?? []).map((item) => [keyFor(kind, item), item])
    );

    return (declarations[source] ?? []).map((declaration) => {
      const key = keyFor(kind, declaration);
      return evaluateCapability({
        kind,
        key,
        declaration,
        effectiveMatch: effectiveByKey.get(key)
      });
    });
  }).sort(compareCapabilities);

  const hasMissingRuntimeCapability = capabilities.some(({ kind, status }) => (
    (kind === 'skill' || kind === 'hook') && status === 'MISSING'
  ));

  return {
    codexVersion,
    platform,
    plugin,
    isolation,
    capabilities,
    status: hasMissingRuntimeCapability ? 'FAIL' : 'PASS'
  };
}

export function exitCodeForStatus(status) {
  return EXIT_CODES[status];
}
