# Codex for Open Source application readiness

## Decision

`HOLD — NOT READY TO SUBMIT`.

The repository and releases through `v0.1.1` are public, but there is no
independent retained usage or sustained public maintenance history yet. The
technical strict-Linux and public-fixture gates pass, and two bounded
maintainer contacts have been sent, but submitting now would establish only
that Huy created, validated and published a project. It would not establish the
usage, ecosystem importance, or ongoing maintainer responsibility that OpenAI
asks applicants to explain.

OpenAI's current form says eligible applicants maintain active open-source
projects and that reviewers consider meaningful usage, broad adoption or clear
ecosystem importance, plus evidence of active maintenance such as PR review,
issue triage and release management. There is no published star threshold.
Source: [Codex for Open Source](https://openai.com/form/codex-for-oss/).

## Current evidence

| Gate | Current state | Required evidence |
| --- | --- | --- |
| Public repository and profile | `PASS` | [Public repository](https://github.com/builtbyhuy/codex-plugin-check) and profile |
| Useful, bounded technical job | `PASS` | Real released-Codex loader evidence with no model/auth dependency |
| Synthetic strict boundary | `PASS` | Publicly documented Linux receipts for both target releases |
| Public-plugin compatibility | `PASS` | Reconciled 10-repository, 20-cell strict matrix |
| Independent retained use | `0` | External repositories keep the workflow enabled |
| Unknown regression caught | `1 local defect` | Publicly linkable regression/issue accepted or reproduced externally |
| Releases | `2 experimental releases` | [v0.1.0](https://github.com/builtbyhuy/codex-plugin-check/releases/tag/v0.1.0) carries the strict evidence; [v0.1.1](https://github.com/builtbyhuy/codex-plugin-check/releases/tag/v0.1.1) adds distribution metadata and is not feedback-driven; additional feedback-driven releases required |
| Ongoing maintainer duties | `INSUFFICIENT` | Public issue triage, PR review and release work over time |
| Application | `NOT SUBMITTED` | All required form fields bound to public evidence |

The technical compatibility result is bound to the [reconciled Linux run and
durable release asset ledger](public-fixture-matrix.md#strict-linux-observation).
It is publication evidence, not usage or maintainer-role evidence.

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
3. At least ten unrelated plugin repositories retain the check in public
   default-branch workflows.
4. The retained integrations cover two consecutive Codex release updates and
   catch at least one real Codex upgrade regression.
5. At least one separate public upstream issue is accepted or independently
   reproduced by its maintainer.
6. At least 60 days of public maintenance evidence exists, including issue
   triage, review of an external contribution, and two feedback-driven release
   decisions.
7. Every application claim fits one of the public links in this directory; no
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

1. Monitor the two public maintainer Discussions; count only observed replies,
   external runs, retained workflows and reproduced defects.
2. Keep the application on hold while independent use and maintenance accrue.
3. Prepare a repository-specific integration PR only if a maintainer requests
   it or a concrete reproducible compatibility defect appears.
4. Record retained workflows, maintainer replies, defects and release upkeep in
   the maintainer-validation ledger.
5. Re-evaluate the internal submission gates monthly. A green local build or a
   star count alone never changes this decision.
