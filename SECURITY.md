# Security policy

## Current support status

`v0.1.0` is the current experimental release. The maintainer accepts private
security reports for the latest release and current `main`, but does not claim
production readiness or a stable compatibility guarantee. A security fix must
pass the relevant regression suite and, for strict-boundary changes, produce
fresh released-Codex Linux evidence before a new release.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability.

Use **Security → Report a vulnerability** to open a private security advisory.
The private advisory endpoint is
`https://github.com/builtbyhuy/codex-plugin-check/security/advisories/new`.
If that private form is unavailable, contact `@builtbyhuy` through the GitHub
profile only to request a private channel; do not include vulnerability details
in a public message.

Never include API keys, tokens, private plugin source, personal Codex state, or
other credentials in a report. Reproduce with synthetic data whenever
possible.

Include:

- the affected commit SHA and exact Codex version;
- host OS/architecture and whether the mode was `strict` or `env`;
- a minimal reproduction and observed receipt with secrets removed;
- expected versus observed isolation or discovery behavior;
- the potential impact and any known workaround.

## Response targets

Maintainers target an acknowledgement within three business days, an initial
triage decision within seven business days, and a status update at least every
14 days until resolution. These are response targets, not a guarantee of a
particular fix or release date.

Please allow coordinated disclosure. A fix must include a regression test and,
for isolation findings, fresh strict Linux evidence before public disclosure.

## Security boundary

Reports are especially useful when they demonstrate credential inheritance,
personal-state access, checkout writes, network access during the strict probe,
receipt identity substitution, status/exit disagreement, or execution of a
plugin hook, MCP server, script, app, authentication flow, or model request.

The checker is not a plugin sandbox or malware scanner. A `PASS` receipt does
not attest that plugin runtime code is safe; the checker deliberately avoids
executing that code.
