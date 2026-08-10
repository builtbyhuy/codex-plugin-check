# Released Codex technical falsifier evidence

## Decision and gate ledger

`HOLD` for the project/publication decision. The bounded synthetic falsifier's
orchestration and environment lanes are locally verified, but its strict Linux
observations remain `UNOBSERVED` on this host and the required
ten-public-fixture specification matrix is still
`UNRUN` (`0/10`). A successful bounded command must therefore report
`status: "HOLD"` with `boundedFalsifier: "PASS"`; it must not report the project
as `PASS`.

| Gate | Local status | Evidence boundary |
| --- | --- | --- |
| Exact released versions | `PASS` | `0.147.0` and `0.146.1` only |
| Real released-binary environment lanes | `PASS` | Positive and negative discovery on both versions |
| Synthetic orchestration and failure gates | `PASS` | Unit/integration tests, without claiming Docker observation |
| Strict Linux boundary | `UNOBSERVED` | Local host is `darwin-arm64` without Docker |
| Strict positive and negative lanes | `UNOBSERVED` | Requires Linux plus a Docker server |
| Public fixture specification matrix | `UNRUN` | `0/10`; outside this bounded falsifier |
| Publication | `HOLD` | No publish or remote operation is authorized by this evidence |

## Version and variant contract

The falsifier accepts only this matrix:

| Lane | Exact version | Local environment result | Local strict result |
| --- | --- | --- | --- |
| Current | `0.147.0` | Positive `PASS`; negative `FAIL` as expected | `UNOBSERVED` |
| Prior | `0.146.1` | Positive `PASS`; negative `FAIL` as expected | `UNOBSERVED` |

It uses one synthetic marketplace fixture with two bounded configurations:

1. the default positive configuration;
2. a negative configuration that disables `sample:sample-skill` through the
   released app-server `skills/config/write` method before reloading skills.

No malformed or mocked discovery result substitutes for the released-binary
negative lane. Run the strict falsifier on a Linux host with Docker using:

```sh
CODEX_CURRENT_VERSION=0.147.0 \
CODEX_PRIOR_VERSION=0.146.1 \
npm run falsify
```

Missing or different version values are input failures. A non-Linux host, a
missing Docker CLI, or an unavailable Docker daemon is a hard failure for
`npm run falsify`; the command never downgrades to environment-only evidence.

## What each strict run must observe

Before the bounded falsifier may pass, actual
`createIsolation(...).wrap(...)` Docker invocations must establish all of the
following:

- credential-bearing environment variables are absent;
- owned state and receipt mounts are writable;
- the marketplace checkout is read-only and has the same SHA-256 tree hash
  before and after the run;
- a randomized file outside every container mount is invisible from the
  container and byte-identical afterward;
- a real host loopback listener is reachable from the host, remains alive for
  the wrapped run, but cannot be reached at its exact ephemeral port from the
  container; an external IP likewise cannot establish a connection;
- every final receipt identifies the requested released version, `sample`,
  `local-marketplace`, `/workspace`, the actual Linux architecture, and
  `strict` isolation with network and host state denied;
- the positive lane has exactly three capabilities:
  `sample:sample-skill` is `DISCOVERED_EFFECTIVE`, the hook is
  `DISCOVERED_UNTRUSTED` or `DISCOVERED_EFFECTIVE`, and `sample-mcp` is
  `DECLARED_ONLY`;
- the negative lane has exactly three capabilities:
  `sample:sample-skill` is `MISSING`, the hook is
  `DISCOVERED_UNTRUSTED`, and `sample-mcp` is `DECLARED_ONLY`; the missing skill
  drives the receipt's semantically reconciled `FAIL` status and exit code `1`;
- neither receipt contains a host home or user marker;
- neither the hook nor MCP execution sentinel exists before isolation cleanup;
- each complete post-preparation probe finishes in less than 90 seconds.

Image preparation is deliberately excluded from timing because it is the only
phase allowed to install the exact Codex package with network access. Timing
begins immediately after `createIsolation` returns. It includes the
network-denied Docker run, staged receipt and exit reconciliation, checkout
verification, sentinel inspection, isolation cleanup, strict certification
write/read, and final exact receipt validation. The clock stops only after that
final validation.

Each positive or negative Codex checker stays inside one network-denied
container. The boundary audit is a separate canary observation. The fixture's
hook and MCP commands would write dedicated files under `/output` if executed;
cleanup is wrapped so those files are checked before the output mount is
deleted. The checker only uses Codex declaration and discovery APIs. It sends
no model request and intentionally never executes plugin hooks, MCP servers,
apps, or authentication flows.

The default owned evidence directory is removed if the falsifier fails. If
cleanup itself fails, the error reports the retained path deterministically.

## Local observations on 2026-08-10

Direct environment probes against the actual installed released binaries
observed this exact matrix on both `0.147.0` and `0.146.1`:

| Configuration | Exit/status | Skill | Hook | MCP |
| --- | --- | --- | --- | --- |
| Positive | `0` / `PASS` | `DISCOVERED_EFFECTIVE` | `DISCOVERED_UNTRUSTED` | `DECLARED_ONLY` |
| Negative | `1` / `FAIL` | `MISSING` | `DISCOVERED_UNTRUSTED` | `DECLARED_ONLY` |

These are real released-API discovery observations, but environment isolation
does not enforce network or host-state denial and therefore cannot satisfy the
strict gate.

`node --test test/check-plugin.test.mjs test/released-codex.test.mjs` observed
33 passing tests, zero failures, and one real strict test skipped with the
explicit reason `strict Linux Docker unavailable on darwin-arm64`.

The complete `npm test` suite observed 119 passing tests, zero failures, and
the same one strict Linux test skipped.

With both exact version variables set, `npm run falsify` exited `1` with:

```text
Falsifier error: Strict released-Codex falsification requires Linux, observed darwin
```

This is fail-closed evidence only. A private Linux run must produce the four
strict positive/negative receipts plus a passing boundary report. Even then,
the command's summary remains `HOLD` until the separate ten-public-fixture gate
is run and reconciled.
