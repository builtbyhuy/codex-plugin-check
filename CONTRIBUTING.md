# Contributing

Codex Plugin Check is experimental and evidence-gated. Contributions are
welcome, but no change may turn an unobserved claim into `PASS`, weaken the
no-execution boundary, or publish artifacts on behalf of the repository owner.

## Local setup

Use Node 24.19.0 or a compatible Node 24 runtime. The project intentionally has
no runtime or development dependencies.

```sh
node --version
npm test
npm pack --dry-run
```

macOS and Windows can run unit tests and `env` diagnostics. They cannot certify
strict isolation. Strict behavior must be observed on Linux with Docker in the
released-Codex workflow.

## Change process

1. Start from a focused branch and keep unrelated changes out of the diff.
2. Write a test that fails for the intended behavior before changing runtime
   code. Tests for command-line or documentation examples must execute the
   artifact, not grep its source text.
3. Make the smallest implementation change that passes the focused test.
4. Run the focused test, then `npm test` and `npm pack --dry-run`.
5. Run `git diff --check` and review every changed receipt or documentation
   claim against observed evidence.
6. Use a conventional commit whose subject describes the outcome.

## Safety invariants

Changes must preserve all of these properties:

- no model request;
- no hook, MCP server, plugin script, app, or authentication execution;
- no personal Codex/agent home or credential inheritance;
- one complete checker container per strict probe, with network denied;
- read-only checkout and tool mounts in strict mode;
- MCP and app results remain `DECLARED_ONLY` without a safe released registry;
- receipt status agrees with capability states and the process exit code;
- strict mode fails closed instead of downgrading to `env`.

Do not add telemetry, credential-dependent tests, floating released-Codex
versions, unpinned third-party Actions, or new dependencies without an
evidence-backed design change.

## Documentation and schema

Update [`docs/receipt.schema.json`](docs/receipt.schema.json) whenever the
receipt contract changes. Keep README examples executable through the injected
synthetic boundary. Separate environment observations, strict observations,
and unknowns; do not claim adoption, endorsement, production readiness, or
publication before those states are observed.

## Pull request checklist

- [ ] A focused test was observed failing before the implementation change.
- [ ] Focused tests and the complete suite pass on Node 24.
- [ ] `npm pack --dry-run` contains no credentials or generated evidence.
- [ ] Strict-boundary changes have a released-Codex Linux artifact, or the PR
      explicitly remains HOLD pending that artifact.
- [ ] Documentation, schema, status/exit behavior, and evidence ledgers agree.
- [ ] No generated receipt contains personal names, home paths, or secrets.

Security reports follow [`SECURITY.md`](SECURITY.md), not the public issue
tracker.
