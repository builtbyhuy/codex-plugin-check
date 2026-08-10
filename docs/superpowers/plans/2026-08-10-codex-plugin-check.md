# Codex Plugin Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and falsify a dependency-light GitHub Action and CLI that prove an exact local Codex plugin checkout is declared and effectively discovered by a released Codex binary without personal state, credentials, model calls, network access, or plugin execution.

**Architecture:** A pure comparison layer turns Codex-owned declaration and registry responses into a deterministic receipt. A JSONL app-server client and command runner supply those responses. An OS isolation adapter wraps every real Codex process; the CLI and Node 24 GitHub Action are thin input/output adapters over the same orchestration function.

**Tech Stack:** Node.js 24 ESM, Node built-in test runner, zero runtime dependencies, GitHub JavaScript Action metadata, released `@openai/codex` binaries, and a network-disabled read-only Linux Docker container for strict CI isolation.

## Global Constraints

- Implement the approved specification at `docs/specs/2026-08-10-codex-plugin-check.md` verbatim where it defines names, statuses, exit codes, versions, and safety boundaries.
- Apply strict TDD: every production behavior is preceded by a focused test observed failing for the intended reason.
- Runtime dependencies remain zero; development dependencies are also avoided unless a release artifact cannot be produced with Node built-ins.
- Strict images use `node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` exactly.
- Never execute plugin hooks, MCP servers, plugin scripts, app authentication, or model requests.
- Never read or edit credential files; child processes receive an allowlisted environment with credential variables removed.
- Do not publish a public release until hard technical gates 1, 2, 4, 5, and 6 pass.
- Do not contact maintainers until the technical receipt is reproducible; do not submit an application until the market and maintenance gates pass.

---

### Task 1: Receipt model and capability comparison

**Files:**
- Create: `package.json`
- Create: `src/receipt.mjs`
- Create: `test/receipt.test.mjs`

**Interfaces:**
- Produces: `buildReceipt({ codexVersion, platform, plugin, declarations, effective, isolation }) -> Receipt`
- Produces: `evaluateCapability({ kind, key, declaration, effectiveMatch }) -> CapabilityResult`
- Produces: `exitCodeForStatus(status) -> 0|1|2|3|4`
- Consumes: plain JSON objects only; no filesystem or process access.

- [x] **Step 1: Create the package test command and write the failing receipt tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt, exitCodeForStatus } from '../src/receipt.mjs';

test('sorts capabilities and distinguishes untrusted discovery', () => {
  const receipt = buildReceipt({
    codexVersion: '0.147.0',
    platform: 'darwin-arm64',
    plugin: { name: 'sample', marketplace: 'local-marketplace', sourceRoot: '/workspace' },
    declarations: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', eventName: 'stop' }],
      mcpServers: ['server-a'],
      apps: []
    },
    effective: {
      skills: [{ name: 'zeta' }],
      hooks: [{ key: 'alpha', trustStatus: 'untrusted' }]
    },
    isolation: { mode: 'strict', network: 'denied', hostState: 'denied' }
  });

  assert.deepEqual(receipt.capabilities.map(({ kind, key, status }) => ({ kind, key, status })), [
    { kind: 'hook', key: 'alpha', status: 'DISCOVERED_UNTRUSTED' },
    { kind: 'mcp', key: 'server-a', status: 'DECLARED_ONLY' },
    { kind: 'skill', key: 'zeta', status: 'DISCOVERED_EFFECTIVE' }
  ]);
  assert.equal(receipt.status, 'PASS');
});

test('maps stable run statuses to exit codes', () => {
  assert.deepEqual(['PASS', 'FAIL', 'TOOL_ERROR', 'INCONCLUSIVE', 'ISOLATION_VIOLATION'].map(exitCodeForStatus), [0, 1, 2, 3, 4]);
});
```

- [x] **Step 2: Run the focused test and record the expected module-not-found failure**

Run: `node --test test/receipt.test.mjs`  
Expected: FAIL because `src/receipt.mjs` does not exist.

- [x] **Step 3: Implement only the deterministic comparison and exit-code behavior**

Implement normalization for `skills`, `hooks`, `mcpServers`, and `apps`; match
skills by `name`, hooks by `key`, apps by `id`, and MCP servers by string key.
Sort results by `kind` then `key`. Missing skill/hook discovery makes the run
`FAIL`; an untrusted but discovered hook remains a passing discovery with its
own capability status; declaration-only MCP/app records do not claim runtime
behavior.

- [x] **Step 4: Run the focused test, then the whole suite**

Run: `node --test test/receipt.test.mjs && npm test`  
Expected: all tests pass with zero warnings.

- [x] **Step 5: Commit**

```bash
git add package.json src/receipt.mjs test/receipt.test.mjs
git commit -m "feat: add deterministic conformance receipts"
```

### Task 2: JSONL app-server client

**Files:**
- Create: `src/app-server-client.mjs`
- Create: `test/fixtures/fake-app-server.mjs`
- Create: `test/app-server-client.test.mjs`

**Interfaces:**
- Produces: `AppServerClient.start({ command, args, cwd, env, timeoutMs })`
- Produces methods: `initialize()`, `request(method, params)`, and `close()`.
- `initialize()` sends client name `codex-plugin-check`, version from
  `package.json`, `experimentalApi: true`, then an `initialized` notification.
- Rejects duplicate response IDs, malformed JSONL, JSON-RPC errors, timeouts,
  premature exit, and stderr larger than 64 KiB.

- [x] **Step 1: Write a fake real subprocess and failing protocol tests**

The fake server reads JSON lines from stdin, returns an initialize result with
`codexHome`, `platformFamily`, `platformOs`, and `userAgent`, returns fixture
payloads for `plugin/read`, `skills/list`, and `hooks/list`, and can be switched
by an argument to emit malformed JSON, a JSON-RPC error, or no response.

Test observable behavior, including this happy-path assertion:

```js
const client = await AppServerClient.start({
  command: process.execPath,
  args: ['test/fixtures/fake-app-server.mjs', 'ok'],
  cwd: process.cwd(),
  env: process.env,
  timeoutMs: 1_000
});
await client.initialize();
const result = await client.request('plugin/read', { pluginName: 'sample' });
assert.equal(result.plugin.summary.name, 'sample');
await client.close();
```

- [x] **Step 2: Verify RED**

Run: `node --test test/app-server-client.test.mjs`  
Expected: FAIL because `AppServerClient` is not implemented.

- [x] **Step 3: Implement the minimal line-buffered client**

Use `node:child_process.spawn` and `node:readline`. Maintain a monotonic integer
ID, a map of pending requests, one timeout per request, a bounded stderr buffer,
and one idempotent shutdown path. Never interpret notifications as responses.

- [x] **Step 4: Verify GREEN and error branches**

Run: `node --test test/app-server-client.test.mjs && npm test`  
Expected: happy path, malformed line, RPC error, timeout, and premature-exit
tests all pass without leaked child processes.

- [x] **Step 5: Commit**

```bash
git add src/app-server-client.mjs test/fixtures/fake-app-server.mjs test/app-server-client.test.mjs
git commit -m "feat: add bounded app server client"
```

### Task 3: Owned state and strict Linux container isolation

**Files:**
- Create: `Dockerfile`
- Create: `src/isolation.mjs`
- Create: `test/isolation.test.mjs`

**Interfaces:**
- Produces: `createIsolation({ targetRoot, receiptPath, mode, platform, codexVersion }) -> IsolationContext`
- `IsolationContext` exposes `root`, `env`, `wrap(command,args)`,
  `assertCheckoutUnchanged()`, and `cleanup()`.
- Strict wrapping produces a Docker build/run invocation with no network, a
  read-only root, no host home/config mount, the target checkout mounted
  read-only at `/workspace`, the tool mounted read-only at `/tool`, and owned
  writable state/output mounts only. `Dockerfile` installs exactly
  `@openai/codex@${CODEX_VERSION}` during image preparation; no package install
  occurs in the network-denied run.
- `wrap(command,args)` is called once around the complete internal checker,
  never once per Codex subcommand; the single container lifetime preserves
  marketplace/install state through app-server discovery.
- `env` contains only the platform essentials plus explicit isolated path
  variables; all variable names matching credential deny patterns are absent.

- [x] **Step 1: Write failing environment and container-command tests**

Use a synthetic parent environment containing `OPENAI_API_KEY`, `GH_TOKEN`,
`NPM_TOKEN`, `SSH_AUTH_SOCK`, `HTTPS_PROXY`, and a harmless `PATH`. Assert the
first five never enter the child environment, while `PATH` does. Assert
`HOME`, `CODEX_HOME`, `TMPDIR`, and all XDG variables resolve beneath the owned
root in `env` mode. Assert the strict Docker command includes `--network none`,
`--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, a read-only
`/workspace` bind, a read-only `/tool` bind, a bounded `/state` tmpfs, and only
the explicit receipt directory as a writable host mount. Assert image build
arguments use an exact numeric Codex version and reject `latest`, ranges, shell
metacharacters, and prerelease strings. Strict mode on non-Linux platforms or
without Docker must fail closed.

- [x] **Step 2: Verify RED**

Run: `node --test test/isolation.test.mjs`  
Expected: FAIL because `src/isolation.mjs` does not exist.

- [x] **Step 3: Implement the smallest strict-isolation context**

Hash every regular file and symlink target under the checkout before the run
with SHA-256; ignore `.git` metadata only. Generate paths with
`fs.mkdtemp(path.join(os.tmpdir(), 'codex-plugin-check-'))`. Cleanup must first
resolve the owned root and refuse any path not beginning with that exact
canonical prefix.

- [x] **Step 4: Verify GREEN; defer the real denial characterization to Task 6 CI**

Run: `node --test test/isolation.test.mjs`  
Then, on Linux CI, run a test container that can read its owned canary but
cannot see a host-home canary, cannot write the checkout, and cannot reach a
loopback listener. Expected: both automated and characterization tests pass;
denial is observable.

- [x] **Step 5: Commit**

```bash
git add Dockerfile src/isolation.mjs test/isolation.test.mjs
git commit -m "feat: isolate codex probe state"
```

### Task 4: Codex install and discovery orchestration

**Files:**
- Create: `src/check-plugin.mjs`
- Create: `test/fixtures/marketplace/.agents/plugins/marketplace.json`
- Create: `test/fixtures/marketplace/plugins/sample/.codex-plugin/plugin.json`
- Create: `test/fixtures/marketplace/plugins/sample/skills/sample-skill/SKILL.md`
- Create: `test/fixtures/marketplace/plugins/sample/hooks/hooks.json`
- Create: `test/check-plugin.test.mjs`

**Interfaces:**
- Produces: `checkPlugin(options, dependencies) -> Promise<Receipt>`.
- Dependency boundary accepts `runCommand`, `startAppServer`, and
  `createIsolation`; production defaults use the real implementations.
- CLI sequence is exactly marketplace add `--json`, plugin add with the
  returned `--marketplace` name and `--json`, plugin list `--json`, then
  app-server requests.

- [x] **Step 1: Write failing orchestration tests with behavior-level fakes**

Assert the exact command sequence and that the three app-server requests use:

```js
[
  ['plugin/read', {
    pluginName: 'sample',
    marketplacePath: path.join(fixtureRoot, '.agents/plugins/marketplace.json')
  }],
  ['skills/list', { cwds: [fixtureRoot], forceReload: true }],
  ['hooks/list', { cwds: [fixtureRoot] }]
]
```

Add tests for failed marketplace/install JSON; mismatched CLI and
`plugin/read` identity, enablement, source, and marketplace path; an unrelated
same-named skill; a missing declared skill; an untrusted hook; and app/MCP
declarations that remain `DECLARED_ONLY`. Capture commands and requests in one
ordered event log so the CLI-to-app-server boundary order is asserted.

- [x] **Step 2: Verify RED**

Run: `node --test test/check-plugin.test.mjs`  
Expected: FAIL because `checkPlugin` is absent.

- [x] **Step 3: Implement minimal orchestration**

Do not parse the plugin manifest as product truth. Validate only Codex CLI JSON
and Codex app-server responses. The fixed local marketplace manifest path is
used only as the address required by `plugin/read`. Normalize effective skills
from every `SkillsListResponse.data[].skills` item and hooks from every
`HooksListResponse.data[].hooks` item, but admit only entries whose paths are
inside the installed plugin cache; hooks must additionally identify the plugin
through Codex's plugin source metadata. Fixture hook event names use Codex's
case-sensitive schema, for example `SessionStart`.

`checkPlugin` is the internal single-process pipeline. It uses direct child
commands plus environment isolation and does not create a strict container per
subcommand. The CLI/Action adapter in Task 5 invokes this complete pipeline once
inside `IsolationContext.wrap(...)` when strict mode is selected.

- [x] **Step 4: Verify GREEN and checkout integrity**

Run: `node --test test/check-plugin.test.mjs && npm test`  
Expected: all branches pass and the fixture checkout hash is unchanged.

- [x] **Step 5: Commit**

```bash
git add src/check-plugin.mjs test/fixtures/marketplace test/check-plugin.test.mjs
git commit -m "feat: check codex plugin discovery"
```

### Task 5: CLI and GitHub Action adapters

**Files:**
- Create: `src/cli.mjs`
- Create: `src/action.mjs`
- Create: `action.yml`
- Create: `test/cli.test.mjs`
- Create: `test/action.test.mjs`

**Interfaces:**
- CLI exports `main(argv, io, dependencies) -> Promise<number>` for tests and
  invokes it only when run as the entry point.
- Action reads `INPUT_MARKETPLACE-ROOT`, `INPUT_PLUGIN`, `INPUT_CODEX`,
  `INPUT_CODEX-VERSION`, `INPUT_CWD`, `INPUT_OUTPUT`, and `INPUT_ISOLATION`; it writes GitHub command
  output directly without `@actions/core`.
- Action outputs: `status`, `receipt`, and `codex-version`.
- Strict outer mode creates one container context, invokes the CLI once with an
  inner environment-mode invocation and container paths (`/workspace`,
  `/output`, `/tool`, `/usr/local/bin/codex`), then verifies the child exit code
  agrees with the staged receipt. Only the outer process that constructed the
  strict Docker invocation may replace the staged receipt's `not_enforced`
  fields with `strict`/`denied`; a direct environment-mode invocation can never
  claim strict isolation. The outer process verifies checkout integrity,
  cleans owned state, and only then writes the certified receipt to the caller
  destination.

- [x] **Step 1: Write failing CLI and Action adapter tests**

CLI tests cover `--help`, missing required input, unknown flags, stable exit
codes, JSON receipt writing, a one-screen summary, and the strict outer/inner
boundary. The strict test must prove that the inner call receives `--isolation
env`, that a direct env call cannot emit strict claims, that receipt status and
child exit code must agree, and that every finalizer runs on failure. Action
tests use a real temporary `GITHUB_OUTPUT` file and assert multiline-safe output
formatting.

- [x] **Step 2: Verify RED**

Run: `node --test test/cli.test.mjs test/action.test.mjs`  
Expected: FAIL because both adapters are absent.

- [x] **Step 3: Implement thin adapters**

Keep parsing and GitHub output formatting local to the adapters; all checking
continues through `checkPlugin`. Strict certification is an adapter concern,
not a hidden option accepted by `checkPlugin`. `action.yml` uses `runs.using:
node24` and `runs.main: src/action.mjs`.

- [x] **Step 4: Verify GREEN**

Run: `node --test test/cli.test.mjs test/action.test.mjs && npm test`  
Expected: all tests pass with no writes outside their temporary directories.

- [x] **Step 5: Commit**

```bash
git add src/cli.mjs src/action.mjs action.yml test/cli.test.mjs test/action.test.mjs package.json
git commit -m "feat: expose cli and github action"
```

### Task 6: Released-binary technical falsifier

**Files:**
- Create: `scripts/falsify-released-codex.mjs`
- Create: `test/released-codex.test.mjs`
- Create: `docs/evidence/technical-falsifier.md`
- Modify: `package.json`

**Interfaces:**
- `npm run falsify` requires exact `CODEX_CURRENT_VERSION=0.147.0` and
  `CODEX_PRIOR_VERSION=0.146.1`; Docker image preparation installs those
  packages before the network-denied probe.
- The script runs the synthetic fixture under strict Linux container isolation, records duration,
  hashes the checkout before and after, and writes version-specific receipts
  under an owned temporary output directory.

- [x] **Step 1: Write the failing released-binary integration test**

The test skips only when Docker is absent and prints an explicit skip reason.
With Docker present, it asserts both receipts
contain the requested version, skill discovery, hook discovery/trust state, no
personal plugin names, and a duration below 90 seconds.

- [x] **Step 2: Verify RED with prepared binaries**

Prepare released binaries into the strict images without touching user state,
set `CODEX_CURRENT_VERSION=0.147.0` and `CODEX_PRIOR_VERSION=0.146.1`, then run:

`node --test test/released-codex.test.mjs`

Expected: FAIL on the first unimplemented or incorrect real-protocol behavior,
with no user-state modification.

- [x] **Step 3: Implement only the compatibility changes required by observed released behavior**

Do not loosen isolation or convert missing effective evidence into a pass. Record
version-specific API differences in the evidence document.

- [x] **Step 4: Verify GREEN and hard gates**

Run with both prepared binaries:

`npm test && npm run falsify`

Expected: zero unit/integration failures; both version receipts; source hash
unchanged; network and host-state denial observed; no plugin executable code
run. If a hard gate fails, update the decision to `NO-BUILD` and stop before
Task 7.

- [x] **Step 5: Commit**

```bash
git add scripts/falsify-released-codex.mjs test/released-codex.test.mjs docs/evidence/technical-falsifier.md package.json
git commit -m "test: falsify released codex discovery"
```

### Task 7: CI, documentation, and gated publication

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/released-codex.yml`
- Create: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/receipt.schema.json`

**Interfaces:**
- CI runs unit tests on Node 24.
- Released-Codex CI prepares `0.147.0` and `0.146.1`, enters a strict Linux
  network/filesystem boundary, and uploads sanitized receipts.
- README copy never claims runtime behavior for MCP/apps or adoption that has
  not been observed.

- [x] **Step 1: Write schema and documentation acceptance checks**

Add a test that validates a real receipt against the checked-in schema using a
small project-owned validator for the schema subset in use. Add a test that
runs the README copy-paste CLI example against the synthetic fixture with the
fake app server boundary; do not grep prose text.

- [x] **Step 2: Verify RED**

Run: `node --test test/receipt-schema.test.mjs test/readme-example.test.mjs`  
Expected: FAIL because schema and documented example are not yet present.

- [x] **Step 3: Add minimal release documentation and workflows**

Use MIT license. State Linux-only strict Action support, experimental Codex
plugin APIs, exact no-execution boundary, receipt statuses, version matrix,
and known `DECLARED_ONLY` MCP/app limitation. Workflows pin third-party actions
to full commit SHAs.

- [x] **Step 4: Verify locally, then in a private remote**

Run: `npm test && npm run falsify && git diff --check`  
Create `builtbyhuy/codex-plugin-check` privately, push the feature branch, and
observe both workflows. Fix only evidence-backed failures through new failing
tests. Do not make the repository public if strict Linux isolation fails.

- [ ] **Step 5: Publish only after both workflow gates pass**

Merge reviewed commits to `main`, change repository visibility to public, tag
`v0.1.0`, and create release notes that bind every claim to the technical
receipt. Record repository URL, tag SHA, workflow URLs, and artifact URLs in
`docs/evidence/technical-falsifier.md`.

- [x] **Step 6: Commit**

```bash
git add .github README.md LICENSE SECURITY.md CONTRIBUTING.md docs/receipt.schema.json test
git commit -m "docs: prepare evidence-bound v0 release"
```

### Task 7A: Exact public-fixture compatibility matrix

**Files:**
- Create: `scripts/falsify-public-fixtures.mjs`
- Create: `test/public-fixtures.test.mjs`
- Create: `.github/workflows/public-fixtures.yml`
- Create: `docs/evidence/public-fixture-matrix.md`
- Modify: `package.json`
- Modify: `test/workflow-contract.test.mjs`

**Interfaces:**
- The matrix is fixed to the ten immutable repository commits audited in
  `PUBLIC_FIXTURE_AUDIT.md` and exact Codex `0.147.0` plus `0.146.1`.
- Nine fixtures are byte-for-byte `DIRECT`. `oh-my-cassette` alone uses the
  bounded `local-source-v1` JSON adapter, replacing only
  `/plugins/0/source` with a local source and recording before/after hashes.
- Public source is fetched without credentials into owned temporary state.
  No repository script, build, dependency install, hook, MCP server, app, or
  model is executed. No upstream source file is published in the artifact.

- [ ] **Step 1: Write failing safety, identity, adapter, and ledger tests**

Bind exactly ten unique HTTPS GitHub repositories, full commit SHAs, expected
plugin IDs, marketplace roots, licenses, and adapter IDs. Reject mutable refs,
path escapes, duplicate rows, extra adapter fields, untrusted workflow events,
receipt identity drift, missing expected capability kinds, absolute evidence
paths, and arbitrary tool errors mislabeled as incompatibility.

- [ ] **Step 2: Verify RED**

Run: `node --test test/public-fixtures.test.mjs test/workflow-contract.test.mjs`

Expected: FAIL because the fixed runner and trusted workflow do not exist.

- [ ] **Step 3: Implement the bounded fixed runner**

Fetch and verify each exact commit with an isolated Git configuration, remove
only owned Git metadata before probing, preserve upstream license/notice files,
apply the single audited static adapter, and run the production strict CLI for
all 20 repository/version cells. Validate every receipt with the production
schema and exact source/plugin/platform/isolation expectations. A conformance
receipt may truthfully be `FAIL`; an unexpected tool error fails the matrix.

- [ ] **Step 4: Run non-certifying local environment probes**

Use the prepared released `0.147.0` and `0.146.1` binaries to reconcile each
observed capability set against the immutable source before strict CI. Record
these only as diagnostics; they cannot satisfy the strict gate.

- [ ] **Step 5: Run the strict matrix in the private remote**

The workflow is main-push/manual only, least privilege, Node 24, pinned Actions,
and always uploads a relative-path evidence ledger. Observe all 20 cells inside
the existing network/host-state-denied boundary. Retain source/tree/adapter
hashes, sanitized receipts, run SHA/URL, and artifact identity.

- [ ] **Step 6: Reconcile and review before publication**

Independently compare the artifact to immutable source expectations. Mark the
technical public-fixture gate `PASS` only when all ten fixtures have complete
observations or an evidence-backed version/API incompatibility classification.
Keep project/publication `HOLD` for any unexplained error or missing row.

### Task 8: Bounded maintainer validation and application hold

**Files:**
- Create: `docs/evidence/maintainer-validation.csv`
- Create: `docs/evidence/maintainer-validation.md`
- Create: `docs/evidence/application-readiness.md`

**Interfaces:**
- Validation ledger columns are `repository`, `maintainer`, `public_workflow`,
  `contact_route`, `sent_at`, `receipt_url`, `ran_at`, `unknown_defect`,
  `retained_required_ci`, `response_url`, and `status`.
- Application readiness records only public, linkable evidence and keeps
  `HOLD` until every market and maintenance gate in the specification passes.

- [ ] **Step 1: Create the evidence ledger and exact outreach payload**

Populate at most 20 repositories from the previously audited bespoke-workflow
pool. Each row must bind to a public workflow and a public maintainer route.
Draft one concise request asking the maintainer to run the pinned prerelease and
report its receipt; do not claim endorsement or acceptance.

- [ ] **Step 2: Send the bounded cohort and record receipts separately from outcomes**

Use only public project channels suitable for tooling feedback. Record an
external send only after observing the resulting URL or platform receipt.
Record a run only from a maintainer-provided receipt or public workflow run.

- [ ] **Step 3: Apply the market stop rule**

After 20 qualified exposures, continue only with at least three independent
runs, at least two repositories retaining required CI, and at least one
credible previously unknown defect. Otherwise mark the project `NO-BUILD` for
further product investment while leaving the useful OSS artifact public.

- [ ] **Step 4: Keep application readiness evidence-bound**

Do not submit the Codex for Open Source application until two feedback-driven
releases, one Codex upgrade regression, one accepted/reproduced upstream issue,
public triage/review, and ten public downstream workflows are all linked. When
the gate clears, prepare the exact form payload, verify every claim, submit it,
and store the submission receipt separately from any approval outcome.

- [ ] **Step 5: Commit the public evidence state**

```bash
git add docs/evidence/maintainer-validation.csv docs/evidence/maintainer-validation.md docs/evidence/application-readiness.md
git commit -m "docs: track maintainer validation evidence"
```
