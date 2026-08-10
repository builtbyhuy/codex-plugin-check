# Public plugin fixture matrix evidence

## Decision

`HOLD`. The immutable ten-repository input audit is complete, but the strict
Linux matrix has not run yet. This document records inputs and observed output;
it does not turn a static compatibility expectation into a runtime result.

## Fixed inputs

Each repository is fetched at one full commit SHA without credentials. The
target matrix is Codex `0.147.0` and `0.146.1`, for 20 independent strict cells.

| Repository | Commit | Marketplace root | Plugin | Preparation | Expected kinds | License | Strict result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [`bitrouter/bitrouter`](https://github.com/bitrouter/bitrouter) | [`678384888b73fc290ce4ce503a8a7f2a5cbf6da8`](https://github.com/bitrouter/bitrouter/commit/678384888b73fc290ce4ce503a8a7f2a5cbf6da8) | `.` | `bitrouter` | `DIRECT` | skill, MCP | Apache-2.0 | `UNRUN` |
| [`Cassette-Editor/oh-my-cassette`](https://github.com/Cassette-Editor/oh-my-cassette) | [`cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32`](https://github.com/Cassette-Editor/oh-my-cassette/commit/cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32) | `.` | `oh-my-cassette` | `STATIC_ADAPTER:local-source-v1` | skill, MCP | MIT | `UNRUN` |
| [`mostlyharmless-ai/watercooler`](https://github.com/mostlyharmless-ai/watercooler) | [`a5efa89df02e7796e20881fef4847f129d84d367`](https://github.com/mostlyharmless-ai/watercooler/commit/a5efa89df02e7796e20881fef4847f129d84d367) | `.` | `watercooler` | `DIRECT` | skill, MCP | Apache-2.0 | `UNRUN` |
| [`commercetools/commercetools-ai-plugins`](https://github.com/commercetools/commercetools-ai-plugins) | [`440d6bd56eb2969b6a0dd41e3fcff286def0787c`](https://github.com/commercetools/commercetools-ai-plugins/commit/440d6bd56eb2969b6a0dd41e3fcff286def0787c) | `.` | `commercetools` | `DIRECT` | skill, MCP | CC-BY-4.0 | `UNRUN` |
| [`agentis-tools/ctx`](https://github.com/agentis-tools/ctx) | [`1782436e0ebf8d95ef4c086d94351698c464c4ee`](https://github.com/agentis-tools/ctx/commit/1782436e0ebf8d95ef4c086d94351698c464c4ee) | `plugins/codex/ctx` | `ctx` | `DIRECT` | skill, hook | Apache-2.0 OR MIT | `UNRUN` |
| [`agentmail-to/agentmail-plugins`](https://github.com/agentmail-to/agentmail-plugins) | [`134887caf9375229415e09c760ae31baa4cc1ec3`](https://github.com/agentmail-to/agentmail-plugins/commit/134887caf9375229415e09c760ae31baa4cc1ec3) | `.` | `agentmail` | `DIRECT` | skill, MCP | MIT | `UNRUN` |
| [`ujjwalredd/sarathi`](https://github.com/ujjwalredd/sarathi) | [`08a51154a2f30af3eb4f6acb11115b9db912c5f8`](https://github.com/ujjwalredd/sarathi/commit/08a51154a2f30af3eb4f6acb11115b9db912c5f8) | `.` | `sarathi` | `DIRECT` | skill | MIT | `UNRUN` |
| [`sofus-nl/cc-plugin-codex`](https://github.com/sofus-nl/cc-plugin-codex) | [`cc5123f7fa18db9c38f838a9b70119e5a0a6847c`](https://github.com/sofus-nl/cc-plugin-codex/commit/cc5123f7fa18db9c38f838a9b70119e5a0a6847c) | `.` | `cc-plugin-codex` | `DIRECT` | skill, hook | Apache-2.0 + NOTICE | `UNRUN` |
| [`RMI/speedy-skills`](https://github.com/RMI/speedy-skills) | [`e983f800056a12b63fd60d5148538f98aaafe643`](https://github.com/RMI/speedy-skills/commit/e983f800056a12b63fd60d5148538f98aaafe643) | `.` | `example-minimal` | `DIRECT` | skill | MIT | `UNRUN` |
| [`roadrunner-tuff/roadrunner-admin-plugin`](https://github.com/roadrunner-tuff/roadrunner-admin-plugin) | [`8e130c07656c8f9db8bf5431332c9aed60a4b133`](https://github.com/roadrunner-tuff/roadrunner-admin-plugin/commit/8e130c07656c8f9db8bf5431332c9aed60a4b133) | `.` | `roadrunner-admin` | `DIRECT` | skill, MCP | Apache-2.0 | `UNRUN` |

`local-source-v1` may change only `/plugins/0/source` in
`.agents/plugins/marketplace.json` to `{"source":"local","path":"./"}`.
The evidence ledger must retain the original and adapted SHA-256 values. No
other fixture receives a rewrite.

## Safety and evidence boundary

- The runner must extract immutable commit archives into owned temporary state
  with traversal and symlink escape checks.
- It must never execute fixture code, scripts, builds, package managers, hooks,
  MCP servers, apps, authentication flows, or models.
- Every Codex probe must use the existing read-only, network-denied,
  host-state-denied strict boundary.
- The retained artifact may contain source/tree/adapter hashes, relative
  receipt names, sanitized receipts, and a summary. It must contain no upstream
  source.
- A truthful plugin receipt may be `FAIL`. A fetch, isolation, tool, identity,
  privacy, or ledger error must fail the matrix and cannot be relabeled as a
  compatibility result.

## Non-certifying diagnostics

Before the fixed runner existed, direct environment probes observed both target
Codex versions successfully load `bitrouter/bitrouter`. The same probes exposed
a checker defect on the unmodified `.claude-plugin` marketplace in
`RMI/speedy-skills`; Codex itself installed it, while the checker incorrectly
required an `.agents` manifest. The checker now follows Codex's manifest
precedence, and the unmodified fixture passes on both versions.

These environment observations helped falsify the implementation. They do not
satisfy the strict 10-repository gate.

## Publication gate

Change this decision from `HOLD` only after all 20 strict cells are retained,
validated against their exact repository/plugin/version identities, scanned
for private paths and execution sentinels, and independently reconciled with
the immutable inputs above. Stars, a green workflow, or a partial matrix do not
substitute for those receipts.
