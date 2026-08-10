# Maintainer validation ledger

## Decision

`HOLD — 2 public contacts, 0 maintainer replies, 0 independent runs, 0 retained
workflows, 0 unknown defects`. The technical fixture matrix and first bounded
contact cohort are complete, but no external outcome exists. A sent message is
not a reply, run, integration, adoption signal, or endorsement.

The machine-readable ledger is
[`maintainer-validation.csv`](maintainer-validation.csv). Blank outcome fields
mean unobserved, not false or unsuccessful.

Repository activity, workflow, and contact-route evidence was checked on
`2026-08-10` from the repositories' own README/contribution files and GitHub
metadata. Both selected routes were re-checked immediately before sending.

## Qualified first cohort

The initial cohort contains only repositories with both an active public CI
workflow and a project-owned public route that explicitly accommodates this
kind of discussion. Each message was sent only after the public `v0.1.0`
release and durable, SHA-256-bound evidence asset were anonymously reachable.

| Repository | Existing public workflow | Maintainer route | Status |
| --- | --- | --- | --- |
| [`bitrouter/bitrouter`](https://github.com/bitrouter/bitrouter) | [`CI`](https://github.com/bitrouter/bitrouter/blob/main/.github/workflows/ci.yml) | [Discussion #805](https://github.com/orgs/bitrouter/discussions/805) | `SENT_AWAITING_RESPONSE` |
| [`Cassette-Editor/oh-my-cassette`](https://github.com/Cassette-Editor/oh-my-cassette) | [`CI`](https://github.com/Cassette-Editor/oh-my-cassette/blob/main/.github/workflows/ci.yml) | [Discussion #71](https://github.com/Cassette-Editor/oh-my-cassette/discussions/71) | `SENT_AWAITING_RESPONSE` |

`bitrouter` also publishes a project email for open-source builders and
integrations, but Discussions is the preferred first contact because it keeps
the request and any reply publicly linkable. `oh-my-cassette` explicitly
routes questions, sharing, and plans to Discussions while reserving Issues for
bugs and feature requests. GitHub recorded the two messages from `builtbyhuy`
at `2026-08-10T13:26:00Z` and `2026-08-10T13:26:15Z`, respectively. No reply
or external run was present when this ledger was written.

## Screened but not in the first cohort

| Repository | Verdict | Reason and safe boundary |
| --- | --- | --- |
| [`mostlyharmless-ai/watercooler`](https://github.com/mostlyharmless-ai/watercooler) | `NEEDS_CARE` | Contributions are welcome, but no generic testing request is invited. Contact only with a repository-specific receipt or small proposed PR after reading its contribution guide. |
| [`commercetools/commercetools-ai-plugins`](https://github.com/commercetools/commercetools-ai-plugins) | `SKIP` | Issues and Discussions are disabled; the product support route is not appropriate for unsolicited validation. |
| [`agentis-tools/ctx`](https://github.com/agentis-tools/ctx) | `NEEDS_CARE` | Contribution-first route only; prepare a concrete result or patch before opening an Issue. |
| [`agentmail-to/agentmail-plugins`](https://github.com/agentmail-to/agentmail-plugins) | `NEEDS_CARE` | Issues are open, but no project contact or tool-testing invitation was found. Use only for a reproduced compatibility defect. |
| [`ujjwalredd/sarathi`](https://github.com/ujjwalredd/sarathi) | `NEEDS_CARE` | No contribution or tool-testing invitation was found. Use only for a direct Sarathi defect or patch. |
| [`sofus-nl/cc-plugin-codex`](https://github.com/sofus-nl/cc-plugin-codex) | `NEEDS_CARE` | No contribution or testing route beyond Issues. Contact only with a reproducible receipt or bounded PR offer. |
| [`RMI/speedy-skills`](https://github.com/RMI/speedy-skills) | `NEEDS_CARE` | Its tested `example-minimal` fixture is explicitly temporary. Any future proposal must target a retained plugin and follow the contribution process. |
| [`roadrunner-tuff/roadrunner-admin-plugin`](https://github.com/roadrunner-tuff/roadrunner-admin-plugin) | `NEEDS_CARE` | Preview scaffold with tenant-dependent capability. Contact only with a no-auth, no-tenant reproduction and concrete patch. |

No promotional Issue should be opened in any `NEEDS_CARE` repository. A later
row may be added only when the request has a repository-specific public
workflow target, maintainer route, and concrete evidence payload.

## Exact first-contact payload

The sent messages followed this contract after every bracketed field and route
was re-checked. Send at most one public message per repository.

```text
Hi — I maintain Codex Plugin Check, an experimental GitHub Action that asks a
released Codex binary what it discovered from one local plugin checkout. It
does not call a model or intentionally execute plugin hooks, MCP servers, apps,
or authentication flows.

I tested [REPOSITORY] at [FULL_COMMIT_SHA] using [PREPARATION: DIRECT, or the
exact disclosed static adapter] in a network-denied Linux matrix against Codex
0.147.0 and 0.146.1. That private test passed, but it is not an endorsement and
does not prove runtime behavior or adoption.

Would you be open to running the pinned v0.1.0 check in a branch or PR and
sharing the sanitized receipt? The exact workflow, release, evidence, and
limitations are here: [PUBLIC_RELEASE_URL]. If this is not useful for your
maintenance workflow, no action is needed.
```

The repository-specific message must include the exact tested commit from the
[public fixture matrix](public-fixture-matrix.md), the durable release URL and
asset digest,
the exact `DIRECT` or adapter preparation, and a full-SHA Action pin. The
`oh-my-cassette` message must say that `STATIC_ADAPTER:local-source-v1` changed
only `/plugins/0/source` from its immutable expected input to the audited local
source form; it must not imply that the original manifest was probed unchanged.
Do not use a floating branch or tag in the proposed workflow.

## Evidence accounting

- Record `sent_at` only after observing the public message URL.
- Record `response_url` only for a maintainer-authored public response.
- Record `ran_at` and `receipt_url` only from a public external workflow or a
  maintainer-provided sanitized receipt.
- Set `retained_required_ci` only when the check remains in the repository's
  default branch and is required by its actual CI policy.
- Record `unknown_defect` only for a previously unknown checker or Codex defect
  that the maintainer reproduces or that has a public accepted issue.
- Never infer adoption from a star, clone, artifact download, green local run,
  sent message, or polite reply.

After 20 qualified sends, continue product investment only with at least three
independent runs, at least two retained required-CI integrations, and at least
one credible previously unknown defect. Otherwise record `NO-BUILD` for
further investment while leaving the useful open-source artifact available.

## Application boundary

The Codex for Open Source application remains `HOLD`. This ledger cannot clear
that gate until the stricter public maintenance requirements in
[`application-readiness.md`](application-readiness.md) are also met: ten public
downstream workflows, two feedback-driven releases, a caught Codex upgrade
regression, a separately accepted or reproduced upstream issue, and public
triage/review over the required maintenance period.
