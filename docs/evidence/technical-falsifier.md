# Released Codex technical falsifier evidence

## Decision

`UNOBSERVED` for the strict Linux hard gates. The repository must not advance
to public release from this local result.

The orchestration and fail-closed paths are verified locally, but the current
host is `darwin-arm64` and has no Docker CLI or daemon. Therefore no statement
in this document claims that either released Codex version passed the strict
container probe.

## Version contract

The falsifier accepts only this matrix:

| Lane | Exact version | Local strict result |
| --- | --- | --- |
| Current | `0.147.0` | `UNOBSERVED` |
| Prior | `0.146.1` | `UNOBSERVED` |

Run it on a Linux host with Docker using:

```sh
CODEX_CURRENT_VERSION=0.147.0 \
CODEX_PRIOR_VERSION=0.146.1 \
npm run falsify
```

Missing or different version values are input failures. A non-Linux host, a
missing Docker CLI, or an unavailable Docker daemon is a hard failure for
`npm run falsify`; the command never downgrades to environment-only evidence.

## What the strict run must observe

Before either version may pass, the falsifier requires all of the following
from actual `createIsolation(...).wrap(...)` Docker invocations:

- credential-bearing environment variables are absent;
- owned state and receipt mounts are writable;
- the marketplace checkout is read-only and has the same SHA-256 tree hash
  before and after the run;
- a randomized file outside every container mount is invisible from the
  container and byte-identical afterward;
- a real host loopback listener is reachable from the host, remains alive for
  the wrapped run, but cannot be reached at its exact ephemeral port from the
  container; an external IP likewise cannot establish a connection;
- the final receipt identifies the requested released version, `sample`,
  `local-marketplace`, `/workspace`, the exact Linux architecture, and
  `strict` isolation with network and host state denied;
- `sample:sample-skill` is `DISCOVERED_EFFECTIVE`;
- the synthetic plugin hook is either `DISCOVERED_UNTRUSTED` or
  `DISCOVERED_EFFECTIVE`;
- `sample-mcp` remains `DECLARED_ONLY`, and no app is declared;
- receipt string values contain no host home or user marker;
- the complete inner checker finishes in less than 90 seconds.

The runtime measurement starts immediately before the network-denied `docker
run` and stops when that one container exits. Image preparation is deliberately
excluded: it is the only phase allowed to install the exact Codex package with
network access. Marketplace installation, CLI inspection, app-server
declaration/discovery requests, receipt creation, and cleanup all remain inside
one network-denied checker container.

The fixture's hook and MCP commands intentionally name nonexistent programs.
The checker uses only Codex declaration and discovery APIs; it sends no model
request and does not execute hooks, MCP servers, apps, or authentication flows.

## Local observations on 2026-08-10

`node --test test/released-codex.test.mjs` observed:

- 7 orchestration and hard-gate tests passed;
- 0 failed;
- 1 real released-binary test skipped with the explicit reason
  `strict Linux Docker unavailable on darwin-arm64`.

With both exact version variables set, `npm run falsify` exited `1` with:

```text
Falsifier error: Strict released-Codex falsification requires Linux, observed darwin
```

This is fail-closed evidence only. A private Linux CI run must produce two
validated receipts and a passing boundary report before this document can be
updated to `PASS` or publication work can begin.
