# Public fixture maintenance — 22 October 2026

The fixed public corpus is maintained explicitly when an upstream source becomes
unavailable. This change keeps ten plugins, both exact released Codex versions
(`0.147.0` and `0.146.1`), all receipt validation, and strict isolation. It does
not introduce a floating ref, an automatic replacement, or a reduced pass gate.

## Observed failure

[Main run 39715215341](https://github.com/builtbyhuy/codex-plugin-check/actions/runs/39715215341)
failed while downloading an upstream archive. On 22 October, the exact archive,
repository endpoint and commit endpoint for
`roadrunner-tuff/roadrunner-admin-plugin@8e130c07656c8f9db8bf5431332c9aed60a4b133`
all returned HTTP 404. The other nine pinned archives returned HTTP 200. A 404
does not establish whether the repository was deleted, renamed or made private.

The [August matrix ledger](public-fixture-matrix.md) and its release receipts
describe the historical corpus and remain unchanged. They are not evidence that
the removed source is still publicly available or that this new corpus passed.

## Replacement source and audit

The replacement is Stripe's official, MIT-licensed
[`stripe/ai`](https://github.com/stripe/ai/tree/89ffbee06b3782ed15d77ffd6cbc5620ad26d3bd),
pinned to `89ffbee06b3782ed15d77ffd6cbc5620ad26d3bd` (8 August 2026). This is
the latest commit at the original corpus's 10 August cutoff, keeping the same
time cohort as the fixed Codex releases. It is a real published plugin with the
same skill-plus-MCP declaration coverage as the unavailable fixture.

The replacement uses the supported Claude marketplace format. Native Codex
marketplace and MCP declaration coverage remains in the unchanged `bitrouter`,
`watercooler`, `commercetools` and `agentmail` fixtures; this is a documented
corpus revision, not a claim that Stripe has identical content to Roadrunner.

| Contract | Audited value |
| --- | --- |
| Exact archive | `https://codeload.github.com/stripe/ai/tar.gz/89ffbee06b3782ed15d77ffd6cbc5620ad26d3bd` |
| Marketplace | `.claude-plugin/marketplace.json`, name `stripe` |
| Local plugin subtree | `providers/claude/plugin` |
| Plugin manifest | `.claude-plugin/plugin.json`, name `stripe`, version `0.5.0` |
| License | Root `LICENSE`, MIT, Stripe copyright retained in the downloaded source |
| Adapter | None; the published marketplace already uses the exact local subtree |
| Archive SHA-256 | `8ad5a87be07c735be4c00f64bbb24aee0eaa8cbbd12ed2cd13a1b7064b6a641b` |
| Canonical checkout / marketplace SHA-256 | `d52ef88f27a0be1a4e595644881ea9ef3fac72e102123cfa1373732d19658d90` |

The production preparation path downloaded, bounded, parsed, extracted,
license-checked and hashed this exact source on Linux. The expected capability
set is one `stripe` MCP declaration and seven skills: `connect-recommend`,
`stripe-apps`, `stripe-best-practices`, `stripe-directory`, `stripe-docs`,
`stripe-projects` and `upgrade-stripe`. No Stripe authentication, payment, model
call, MCP connection or upstream script execution is part of this check.

## Regression and diagnostic changes

- An unavailable archive now reports its exact repository, commit and HTTP
  status. An injected HTTP 404 regression requires one exact request and no
  fallback to another source or ref.
- The strict corpus runs on pull requests targeting `main`, with a read-only
  token and no persisted checkout credentials, before its existing main-push
  run. Provenance records the actual pull-request merge ref and event;
  `pull_request_target` is rejected.
- A separate public runner log in trusted runner temporary storage survives an
  aborted matrix. `pipefail` retains
  the falsifier's nonzero result. The matrix still removes incomplete receipt
  directories on unexpected errors; the log is never a passing receipt.

Ordinary local checks cover orchestration and error handling. The real released
Codex check requires Linux with a working Docker server; it is run by the strict
GitHub workflow. Check that workflow's exact revision, final status and artifact
before treating the new ten-by-two matrix as passed.
