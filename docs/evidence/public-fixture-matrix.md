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

After the fixed runner was implemented, a complete local environment matrix
ran all 20 repository/version cells against the prepared `0.147.0` and
`0.146.1` binaries. All 20 returned exit `0` and `PASS` with exact
repository/plugin/marketplace/version identities. Every declared skill was
`DISCOVERED_EFFECTIVE`; the `ctx` and `cc-plugin-codex` hooks were
`DISCOVERED_UNTRUSTED`; every MCP declaration was `DECLARED_ONLY`. No app or
unexpected capability kind appeared. The temporary checkouts and receipts were
removed after reconciliation.

That result is a full loader diagnostic, but its `env` isolation does not deny
network or personal host state. It is not counted in the strict result column.

On 2026-08-10, the production preparation path fetched, parsed, extracted,
license-checked, hashed and cleaned all ten immutable archives without running
Docker or any upstream code. A second root-agent run reproduced all ten archive
hashes:

| Fixture | Archive SHA-256 | Extracted checkout SHA-256 | Probed marketplace SHA-256 |
| --- | --- | --- | --- |
| `bitrouter` | `cd173128072bc769995a46baf1c9b19b0215214e8719a2f3779d4e3d52a69351` | `32e3cf5e9211dc28c55bd4bc2e7b794a73d9c961805aa1cc8436851ae17bff73` | `32e3cf5e9211dc28c55bd4bc2e7b794a73d9c961805aa1cc8436851ae17bff73` |
| `oh-my-cassette` | `3d64d09b7fae024d53616d4b04173e1a584f7982d3971fb94d0ea54cfed37287` | `86f6123019a98f6e59e0a0b3c0a41759aa52982f3af3242961b7be5cfbcae4d3` | `6218b332623998fb9cb9b116614d2465e485b376bdc930976bee556ab417e8e4` |
| `watercooler` | `aed68325b301e45b422f491865e7c3325c53d966dc89d3294deba45fa280ba3c` | `7f40c2886ade5da2325c94852db6062fa4a95c0b76ae868cf9aa035e28da5420` | `7f40c2886ade5da2325c94852db6062fa4a95c0b76ae868cf9aa035e28da5420` |
| `commercetools` | `7e4ac439b75a064a08a6e2a107d1ea8bb0221b974807670cea56c63a6cfd9094` | `8620f6238f94edeebca2eafa8fe193d0f7694841740d0c30b226fbfe6783eacf` | `8620f6238f94edeebca2eafa8fe193d0f7694841740d0c30b226fbfe6783eacf` |
| `ctx` | `5ef97584aacb6874cede5780ee47d137597a6ebd1fd3ecf04f0e97c79dfd8dfd` | `78bedfa1c634771af25f27db4205079b973fa05ee58a4f17442595a08d406f48` | `552f221e0c7c8ba59956829b14e5ee5b1a242c81d72d533e1f6d9b1a5f805c93` |
| `agentmail` | `ec595bfaf2e7201ade5e8c5902b424caa05948d1c6558e3f53be3468f02eca14` | `eac1dc131996059547801663bc7cd36c38221b0b28d9012c062c4af441e66800` | `eac1dc131996059547801663bc7cd36c38221b0b28d9012c062c4af441e66800` |
| `sarathi` | `f4577e9777d44111b1074460eba28987c80db2296f1983a018b391d99d42e7d8` | `7b45528f5816ed23191abf7aaae2670bd342989f6774007eb07937665bbcdc02` | `7b45528f5816ed23191abf7aaae2670bd342989f6774007eb07937665bbcdc02` |
| `cc-plugin-codex` | `57cff2045571f47a75231700f496f4aaaa4d780e1904721e5679a5d68f420cc9` | `562c1c772a33588dd7364ce11316bac0225c135bb84da91a4fdb619c32e3ba74` | `562c1c772a33588dd7364ce11316bac0225c135bb84da91a4fdb619c32e3ba74` |
| `speedy-skills` | `6734bb6adb707b623cbb22a9a8c12c571d7fbe51b768cc066055aa86da6e6da0` | `60459f76469df1ae420fab647a91b4413b79310d6166921a633877bd1e84fc9c` | `60459f76469df1ae420fab647a91b4413b79310d6166921a633877bd1e84fc9c` |
| `roadrunner-admin` | `a54ddc226d7f2af17d867b82dd83ff0dfa330abb9dc5e6f80b3cf0d639ad4650` | `1b057c8ac8031ea74a02a5ee46cd716f3f020df3779d37c32f3f47ede6bb0b5b` | `1b057c8ac8031ea74a02a5ee46cd716f3f020df3779d37c32f3f47ede6bb0b5b` |

For `oh-my-cassette`, the observed adapter input is
`d5c629f3a3b8dd2cdf560963c26b1c5e9dc062045fef13cafca178e7b1bd3d3f`
and its adapted output is
`bbecf8a43d3e993b8506f497a416a0cd83e535a18f3f647e79d6d2458fd6c7b1`.
The differing marketplace hash is therefore expected and bounded. These are
preparation receipts, not Codex compatibility receipts.

## Publication gate

Change this decision from `HOLD` only after all 20 strict cells are retained,
validated against their exact repository/plugin/version identities, scanned
for private paths and execution sentinels, and independently reconciled with
the immutable inputs above. Stars, a green workflow, or a partial matrix do not
substitute for those receipts.
