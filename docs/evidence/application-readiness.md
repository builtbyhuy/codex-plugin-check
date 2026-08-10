# Codex for Open Source application readiness

## Decision

`HOLD — NOT READY TO SUBMIT`.

The repository is still private, the public-fixture runtime gate is incomplete,
and there is no independent retained usage yet. Submitting now would establish
that Huy created a project, but it would not establish the usage, ecosystem
importance, or ongoing maintainer responsibility that OpenAI asks applicants
to explain.

OpenAI's current form says eligible applicants maintain active open-source
projects and that reviewers consider meaningful usage, broad adoption or clear
ecosystem importance, plus evidence of active maintenance such as PR review,
issue triage and release management. There is no published star threshold.
Source: [Codex for Open Source](https://openai.com/form/codex-for-oss/).

## Current evidence

| Gate | Current state | Required evidence |
| --- | --- | --- |
| Public repository and profile | `HOLD` | Public GitHub profile and public repository URL |
| Useful, bounded technical job | `PASS` | Real released-Codex loader evidence with no model/auth dependency |
| Synthetic strict boundary | `PASS` | Private Linux receipts for both target releases |
| Public-plugin compatibility | `UNRUN` | Reconciled 10-repository, 20-cell strict matrix |
| Independent retained use | `0` | External repositories keep the workflow enabled |
| Unknown regression caught | `1 local defect` | Publicly linkable regression/issue accepted or reproduced externally |
| Releases | `0 public releases` | Maintained tagged releases and release notes |
| Ongoing maintainer duties | `INSUFFICIENT` | Public issue triage, PR review and release work over time |
| Application | `NOT SUBMITTED` | All required form fields bound to public evidence |

The local defect was real: an unmodified Claude-compatible marketplace loaded
in Codex while the checker rejected it. The fix is useful product evidence, but
it is not independent adoption because Huy found it while testing his own tool.

## Conservative internal submission gates

These are project safeguards, not claims that OpenAI publishes numeric rules.
Submit only after all are observed:

1. The technical 10-repository matrix passes or honestly records and explains
   every version/API incompatibility, with no unexplained tool error.
2. The repository is public with a signed-off `v0.1.0` release, public CI and
   reproducible evidence links.
3. At least three unrelated plugin repositories retain the check in their
   default-branch workflow.
4. The retained integrations remain green across two consecutive Codex release
   updates, or one catches a real regression that an upstream maintainer accepts
   or independently reproduces.
5. At least 60 days of public maintenance evidence exists, including issue
   triage, review of an external contribution, and two release decisions.
6. Every application claim fits one of the public links in this directory; no
   stars, downloads, adoption or maintainer duty is inferred from local work.

## Exact form payload still required

The current form requests:

- first and last name;
- the email associated with the applicant's ChatGPT account;
- public GitHub username and public repository URL;
- primary or core maintainer role;
- a maximum-500-character qualification explanation;
- optional interest in Codex Security and API credits;
- OpenAI organization ID and a maximum-500-character API-credit use case;
- an optional maximum-500-character final note.

Email and OpenAI organization ID are identity-linked inputs. They will be bound
at the submission boundary and never inferred from credentials or unrelated
local files.

## Next evidence-producing actions

1. Finish and privately reconcile the strict public-fixture matrix.
2. Publish only after security/code review and all technical gates pass.
3. Offer a bounded integration to maintainers whose immutable fixtures were
   tested; do not open promotional issues or claim endorsement.
4. Record retained workflows, maintainer replies, defects and release upkeep in
   the maintainer-validation ledger.
5. Re-evaluate the internal submission gates monthly. A green local build or a
   star count alone never changes this decision.
