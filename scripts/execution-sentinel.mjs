#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXECUTION_SENTINELS = Object.freeze({
  hook: 'codex-plugin-check-hook-executed',
  mcp: 'codex-plugin-check-mcp-executed'
});

export async function writeExecutionSentinel(kind, outputRoot = '/output') {
  const filename = EXECUTION_SENTINELS[kind];
  if (!filename) throw new Error(`Unknown execution sentinel kind: ${kind}`);
  await writeFile(path.join(outputRoot, filename), `${kind} executed\n`, {
    flag: 'wx',
    mode: 0o600
  });
}

function isEntrypoint() {
  return process.argv[1] !== undefined &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    await writeExecutionSentinel(process.argv[2] ?? 'hook');
  } catch (cause) {
    process.stderr.write(`Execution sentinel error: ${
      cause instanceof Error ? cause.message : String(cause)
    }\n`);
    process.exitCode = 2;
  }
}
