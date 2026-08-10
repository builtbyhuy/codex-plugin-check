# Public plugin fixture matrix evidence

## Decision

`PASS — 10/10 fixtures, 20/20 strict cells`. The private main-branch Linux run
completed successfully and its retained artifact was independently reconciled
against every immutable input and production receipt validator. This clears the
technical public-fixture gate; it does not establish adoption, ecosystem
importance, or ongoing maintainer work.

## Fixed inputs

Each repository is fetched at one full commit SHA without credentials. The
target matrix is Codex `0.147.0` and `0.146.1`, for 20 independent strict cells.

| Repository | Commit | Marketplace root | Plugin | Version | Preparation | Expected kinds | License | Strict result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`bitrouter/bitrouter`](https://github.com/bitrouter/bitrouter) | [`678384888b73fc290ce4ce503a8a7f2a5cbf6da8`](https://github.com/bitrouter/bitrouter/commit/678384888b73fc290ce4ce503a8a7f2a5cbf6da8) | `.` | `bitrouter` | `0.1.0` | `DIRECT` | skill, MCP | Apache-2.0 | `PASS` |
| [`Cassette-Editor/oh-my-cassette`](https://github.com/Cassette-Editor/oh-my-cassette) | [`cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32`](https://github.com/Cassette-Editor/oh-my-cassette/commit/cdad1fd2f62544b65a01ad00f74b19fe3ce4ca32) | `.` | `oh-my-cassette` | `0.4.14` | `STATIC_ADAPTER:local-source-v1` | skill, MCP | MIT | `PASS` |
| [`mostlyharmless-ai/watercooler`](https://github.com/mostlyharmless-ai/watercooler) | [`a5efa89df02e7796e20881fef4847f129d84d367`](https://github.com/mostlyharmless-ai/watercooler/commit/a5efa89df02e7796e20881fef4847f129d84d367) | `.` | `watercooler` | `0.5.6` | `DIRECT` | skill, MCP | Apache-2.0 | `PASS` |
| [`commercetools/commercetools-ai-plugins`](https://github.com/commercetools/commercetools-ai-plugins) | [`440d6bd56eb2969b6a0dd41e3fcff286def0787c`](https://github.com/commercetools/commercetools-ai-plugins/commit/440d6bd56eb2969b6a0dd41e3fcff286def0787c) | `.` | `commercetools` | `0.14.0` | `DIRECT` | skill, MCP | CC-BY-4.0 | `PASS` |
| [`agentis-tools/ctx`](https://github.com/agentis-tools/ctx) | [`1782436e0ebf8d95ef4c086d94351698c464c4ee`](https://github.com/agentis-tools/ctx/commit/1782436e0ebf8d95ef4c086d94351698c464c4ee) | `plugins/codex/ctx` | `ctx` | `0.4.0` | `DIRECT` | skill, hook | Apache-2.0 OR MIT | `PASS` |
| [`agentmail-to/agentmail-plugins`](https://github.com/agentmail-to/agentmail-plugins) | [`134887caf9375229415e09c760ae31baa4cc1ec3`](https://github.com/agentmail-to/agentmail-plugins/commit/134887caf9375229415e09c760ae31baa4cc1ec3) | `.` | `agentmail` | `0.3.0` | `DIRECT` | skill, MCP | MIT | `PASS` |
| [`ujjwalredd/sarathi`](https://github.com/ujjwalredd/sarathi) | [`08a51154a2f30af3eb4f6acb11115b9db912c5f8`](https://github.com/ujjwalredd/sarathi/commit/08a51154a2f30af3eb4f6acb11115b9db912c5f8) | `.` | `sarathi` | `0.6.0` | `DIRECT` | skill | MIT | `PASS` |
| [`sofus-nl/cc-plugin-codex`](https://github.com/sofus-nl/cc-plugin-codex) | [`cc5123f7fa18db9c38f838a9b70119e5a0a6847c`](https://github.com/sofus-nl/cc-plugin-codex/commit/cc5123f7fa18db9c38f838a9b70119e5a0a6847c) | `.` | `cc-plugin-codex` | `0.1.1` | `DIRECT` | skill, hook | Apache-2.0 + NOTICE | `PASS` |
| [`RMI/speedy-skills`](https://github.com/RMI/speedy-skills) | [`e983f800056a12b63fd60d5148538f98aaafe643`](https://github.com/RMI/speedy-skills/commit/e983f800056a12b63fd60d5148538f98aaafe643) | `.` | `example-minimal` | `0.1.0` | `DIRECT` | skill | MIT | `PASS` |
| [`roadrunner-tuff/roadrunner-admin-plugin`](https://github.com/roadrunner-tuff/roadrunner-admin-plugin) | [`8e130c07656c8f9db8bf5431332c9aed60a4b133`](https://github.com/roadrunner-tuff/roadrunner-admin-plugin/commit/8e130c07656c8f9db8bf5431332c9aed60a4b133) | `.` | `roadrunner-admin` | `0.1.0` | `DIRECT` | skill, MCP | Apache-2.0 | `PASS` |

`local-source-v1` may change only `/plugins/0/source` in
`.agents/plugins/marketplace.json` to `{"source":"local","path":"./"}`.
The evidence ledger must retain the original and adapted SHA-256 values. No
other fixture receives a rewrite.

## Safety and evidence boundary

- The runner must extract immutable commit archives into owned temporary state
  with traversal and symlink escape checks.
- It must never execute fixture code, scripts, builds, package managers, hooks,
  MCP servers, apps, authentication flows, or models. The public-fixture cells
  make only install/list and declaration/discovery requests; they do not call a
  capability runtime endpoint.
- Every Codex probe must use the existing read-only, network-denied,
  host-state-denied strict boundary.
- The retained artifact may contain source/tree/adapter hashes, relative
  receipt names, sanitized receipts, and a summary. It must contain no upstream
  source.
- On trusted GitHub Actions runs, the summary binds the exact main-branch
  commit, event, run URL, run attempt, and intended artifact name. The assigned
  artifact ID is reconciled after upload because GitHub creates it only then.
- A truthful plugin receipt may be `FAIL`. A fetch, isolation, tool, identity,
  privacy, or ledger error must fail the matrix and cannot be relabeled as a
  compatibility result.
- Every prepared tree must match its audited checkout and marketplace hashes.
  The marketplace manifest must resolve the named plugin to the exact audited
  local subtree, whose plugin manifest must match the fixed name and version.
  Every receipt must contain the exact audited capability keys and evidence
  sources, not merely one capability of each expected kind.

The strict public cells do not add fixture-specific execution sentinels to
third-party repositories. Their non-execution claim is therefore bounded to
the checker request path above and the earlier exact-version synthetic run,
whose hook and MCP sentinels remained absent. It is not evidence that arbitrary
third-party commands could never attempt a side effect if Codex changed loader
behavior.

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
repository/plugin/marketplace/source-subtree/version identities. This was
rerun after the exact runtime root/version gates were added. Every declared
skill was `DISCOVERED_EFFECTIVE`; the `ctx` and `cc-plugin-codex` hooks were
`DISCOVERED_UNTRUSTED`; every MCP declaration was `DECLARED_ONLY`. No app or
unexpected capability kind appeared. The temporary checkouts and receipts were
removed after reconciliation.

That result is a full loader diagnostic, but its `env` isolation does not deny
network or personal host state. It is not counted in the strict result column.

On 2026-08-10, the production preparation path fetched, parsed, extracted,
license-checked, hashed and cleaned all ten immutable archives without running
Docker or any upstream code. A root-agent integration then fetched all ten
archives again, validated each exact marketplace source, plugin subtree,
manifest name and version, and reproduced the canonical tree hashes below.
Directory entries are ordered by their UTF-8 bytes, so the hash contract does
not depend on locale or ICU behavior:

| Fixture | Archive SHA-256 | Extracted checkout SHA-256 | Probed marketplace SHA-256 |
| --- | --- | --- | --- |
| `bitrouter` | `cd173128072bc769995a46baf1c9b19b0215214e8719a2f3779d4e3d52a69351` | `ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9` | `ba604cb6d8313594bebbdbc899f930195e92f6c12fa14371764f7dec2e25d4c9` |
| `oh-my-cassette` | `3d64d09b7fae024d53616d4b04173e1a584f7982d3971fb94d0ea54cfed37287` | `9dffb7f24db16606eeb44f7a23746073716069e63e4cf58a07631c02e1f57177` | `32c159545ca3626c13dfae8f1c833e456584df10c204060539475fd6c301b8e8` |
| `watercooler` | `aed68325b301e45b422f491865e7c3325c53d966dc89d3294deba45fa280ba3c` | `ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19` | `ad91f57b0605df94a1361aa67c3b35314f5357583aaef7f364b397da5a00ea19` |
| `commercetools` | `7e4ac439b75a064a08a6e2a107d1ea8bb0221b974807670cea56c63a6cfd9094` | `749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0` | `749bea75c483aecfcc71dc04919a13e170953996eeba9dfdff16c4f5f49073c0` |
| `ctx` | `5ef97584aacb6874cede5780ee47d137597a6ebd1fd3ecf04f0e97c79dfd8dfd` | `7f6934a57be05a126b968a5c5d346fb9d3150bdb6a57e199d2274204c94337eb` | `7b3212dbd512ee0bbf7f8c3c2b69c86bdba41ed55f9f71e5f69e63dc0cce49f7` |
| `agentmail` | `ec595bfaf2e7201ade5e8c5902b424caa05948d1c6558e3f53be3468f02eca14` | `97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669` | `97a82ec2aaa745663a6baa0dab16c476858d4ddc47230f2906b26eafbffa6669` |
| `sarathi` | `f4577e9777d44111b1074460eba28987c80db2296f1983a018b391d99d42e7d8` | `da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599` | `da617a7857381c86ef963f85185a1afef851369a52cb4630d9360c21df904599` |
| `cc-plugin-codex` | `57cff2045571f47a75231700f496f4aaaa4d780e1904721e5679a5d68f420cc9` | `1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed` | `1da66cadeb01bb4b57f63e522fdc763df98d5ba6e2034e04599b02c1e394daed` |
| `speedy-skills` | `6734bb6adb707b623cbb22a9a8c12c571d7fbe51b768cc066055aa86da6e6da0` | `d39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2` | `d39797da9765bf1d822887dc6735f186d4bfc199279558817cf6eef375aab1c2` |
| `roadrunner-admin` | `a54ddc226d7f2af17d867b82dd83ff0dfa330abb9dc5e6f80b3cf0d639ad4650` | `33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1` | `33eaa8e5aef5449d496771317d1f40205dabf06fa6d6041e1e142e61e651f5d1` |

For `oh-my-cassette`, the observed adapter input is
`d5c629f3a3b8dd2cdf560963c26b1c5e9dc062045fef13cafca178e7b1bd3d3f`
and its adapted output is
`bbecf8a43d3e993b8506f497a416a0cd83e535a18f3f647e79d6d2458fd6c7b1`.
The differing marketplace hash is therefore expected and bounded. These are
preparation receipts, not Codex compatibility receipts.

## Strict Linux observation

The [main-branch public fixture run 31387585244](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31387585244)
completed successfully on `ubuntu-24.04` and Node `24.19.0` at merge commit
`3285a65bab2ba805665c6be4e4349874fc7be417`. Its job ran from
`2026-08-10T12:20:54Z` to `2026-08-10T12:21:55Z`; the evidence-producing step
completed in 47 seconds. The same commit also passed [ordinary CI](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31387585232)
and the [released-Codex synthetic falsifier](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/31387585316).

The strict run produced artifact `public-fixture-evidence-31387585244-1`
(artifact ID `9062332756`, GitHub digest
`sha256:f4a06bb022b4c916ff5b1db3b14c8514f69b327095d3f16a1303128952d948b9`,
expires `2026-11-08T12:20:52Z`). Its 21 files contain one summary and all 20
expected receipts. The summary SHA-256 is
`7db42975282375feb5294d5d2be0c3964bfda127b5de4a6c02745185449492cc`.

Independent reconciliation re-read every file through the production public
receipt validator and compared the summary to the fixed fixture registry. It
observed:

- `status: PASS`, `10/10` fixtures, and `20/20` passing strict cells;
- exact main-branch commit, event, run URL, run attempt, and artifact name;
- exact archive, checkout, adapted marketplace, plugin root and plugin version
  identities for every fixture;
- exact capability counts, keys, evidence sources and allowed states for both
  Codex versions;
- `DISCOVERED_EFFECTIVE` for every skill, `DISCOVERED_UNTRUSTED` for the five
  declared hooks, and `DECLARED_ONLY` for every MCP declaration;
- no unexpected file, capability, app, personal path, temporary path, or
  invented `VERSION_OR_API_INCOMPATIBLE` cause.

## Publication gate

The technical gate is `PASS`. Before the public release is final, attach the
sanitized receipts and summary as a durable release asset rather than relying
only on the 90-day Actions artifact. A code-`1` receipt must remain plain
`FAIL`/`HOLD`; it cannot establish a version or API incompatibility without
separate causal evidence. This result supports publication of the tool, but it
does not satisfy the independent-use or ongoing-maintainer gates for a Codex
for Open Source application.
