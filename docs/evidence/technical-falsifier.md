# Released Codex technical falsifier evidence

## Decision and gate ledger

`HOLD` for the project/publication decision. The bounded synthetic falsifier's
orchestration, environment lanes, and private strict Linux run are verified,
but the required ten-public-fixture specification matrix is still `UNRUN`
(`0/10`). A successful bounded command must therefore report
`status: "HOLD"` with `boundedFalsifier: "PASS"`; it must not report the project
as `PASS`.

| Gate | Observed status | Evidence boundary |
| --- | --- | --- |
| Exact released versions | `PASS` | `0.147.0` and `0.146.1` only |
| Real released-binary environment lanes | `PASS` | Positive and negative discovery on both versions |
| Synthetic orchestration and failure gates | `PASS` | Unit/integration tests, without claiming Docker observation |
| Strict Linux boundary | `PASS` | Private GitHub Actions run on `ubuntu-24.04` |
| Strict positive and negative lanes | `PASS` | Four exact receipts across both released versions |
| Public fixture specification matrix | `UNRUN` | `0/10`; outside this bounded falsifier |
| Publication | `HOLD` | Repository remains private until the public-fixture gate passes |

## Version and variant contract

The falsifier accepts only this matrix:

| Lane | Exact version | Local environment result | Private strict result |
| --- | --- | --- | --- |
| Current | `0.147.0` | Positive `PASS`; negative `FAIL` as expected | Positive `PASS`; negative `FAIL` as expected |
| Prior | `0.146.1` | Positive `PASS`; negative `FAIL` as expected | Positive `PASS`; negative `FAIL` as expected |

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
35 passing tests, zero failures, and one real strict test skipped with the
explicit reason
`strict released integration requires CODEX_RELEASED_FALSIFIER_OPT_IN=1`.

The complete `npm test` suite observed 158 passing tests, zero failures, and
the same one strict Linux test skipped.

With both exact version variables set, `npm run falsify` exited `1` with:

```text
Falsifier error: Strict released-Codex falsification requires Linux, observed darwin
```

This is fail-closed local evidence only; the private Linux observation below is
the evidence that satisfies the strict gate.

## Private Linux observations on 2026-08-10

Both workflows ran on the exact main-branch commit
`dcfcae6e658b2603ced460f6e42421e3d1d91765`. Both used
`actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0; the strict workflow
additionally used `actions/upload-artifact` v7.0.1. Each action was pinned by
commit SHA, and all three release manifests use the Node 24 action runtime.
The resulting runs were:

- [Node 24 CI run 31379758032](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31379758032)
  completed successfully; its test job ran from `10:35:01Z` to `10:35:21Z`;
- [strict released-Codex run 31379758041](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31379758041)
  completed successfully; its strict job ran from `10:35:01Z` to `10:35:44Z`.

The strict run uploaded artifact `released-codex-evidence-31379758041-1`
(artifact id `9059389524`). Its summary reports:

- `status: HOLD`, `boundedFalsifier: PASS`, and publication `HOLD`;
- strict boundary, execution-sentinel, released-binary matrix, and negative
  discovery gates all `PASS`;
- public fixture matrix `UNRUN`, with `0` observed and `10` required;
- checkout hash
  `cf3d432b206305ae51252ac8c901125190c6347ee7baaf6d508e6d2866d92203`;
- positive durations of `550.5101969999996 ms` (`0.147.0`) and
  `550.7007349999985 ms` (`0.146.1`), and negative durations of
  `542.2092279999997 ms` and `551.4242290000002 ms`, respectively.

The four receipts were re-read with the production receipt validators. All
identify `linux-x64`, `sample`, `local-marketplace`, `/workspace`, and exact
`strict`/`denied`/`denied` isolation. Both positive receipts are `PASS` with an
effective skill, untrusted discovered hook, and declaration-only MCP. Both
negative receipts are `FAIL` with the disabled skill missing and the other two
states unchanged. A scan found no local home, user, temporary-directory, GitHub
URL, or absolute evidence path in the artifact JSON.

Artifact SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `codex-0.147.0-positive.json` | `8ec1ace47652014c7d9843e4b005f37fa29a638211238a953f46f53f51fca638` |
| `codex-0.147.0-negative.json` | `1d1b05790a0e785636cd2b937349114765778c369d5fadd12e2bd87249d63d59` |
| `codex-0.146.1-positive.json` | `ad3231ca8ac0a81dbf6fd3a7d5ca1b8bc6da546043c2009dd6bcf1beb487abbd` |
| `codex-0.146.1-negative.json` | `9ac7c8e980bc7157d3125f64204e97e836b1bad316f9c61a18cb32b36c2ba5ea` |
| `falsifier-summary.json` | `dacbcfa08a7888f7fbad27f9ba1855fe759aca87d8c1bebd64f150c947ad3e8d` |

This closes the bounded synthetic strict-Linux uncertainty. It does not close
the product/publication decision: the project remains `HOLD` until the ten
public fixtures are run and honestly reconciled.
