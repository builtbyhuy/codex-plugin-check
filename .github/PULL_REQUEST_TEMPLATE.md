## Purpose

Describe the observable behavior or documentation outcome this pull request changes.

## Evidence

Link the focused failing test, issue, receipt, or other evidence that motivated the change. Remove credentials, personal paths, and private plugin source.

## Verification

- [ ] A focused test failed before runtime behavior changed, when testing was practical.
- [ ] Focused tests and the complete suite pass on Node 24.
- [ ] `npm pack --dry-run` contains no credentials or generated evidence.
- [ ] Strict-boundary changes have a released-Codex Linux artifact, or remain explicitly `HOLD`.
- [ ] Documentation, schema, capability states, run status, and exit behavior agree.
- [ ] No receipt or log contains personal names, home paths, secrets, or private source.
- [ ] The change does not claim adoption, endorsement, production readiness, or unobserved compatibility.

## Safety impact

Explain any effect on network access, host-state isolation, plugin execution, identity binding, or receipt validation. Write `None` only after checking each boundary.
