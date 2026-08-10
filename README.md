# Codex Plugin Check

Codex Plugin Check is an experimental, evidence-first GitHub Action and CLI
for checking how a released Codex binary sees one local plugin checkout. It
produces a deterministic JSON receipt from Codex-owned install, declaration,
skill-registry, and hook-registry responses.

This repository is in pre-release validation. The current project decision is
**HOLD**: the bounded synthetic falsifier has passed private strict Linux CI,
but the ten-public-fixture gate is **UNRUN (0/10)**. There is no adoption or
production-readiness claim.

## What the receipt proves

For the requested checkout and exact Codex version, the checker correlates:

- `codex plugin marketplace add`, `plugin add`, and `plugin list` JSON;
- Codex app-server `plugin/read` declarations;
- safe `skills/list` and `hooks/list` discovery registries;
- the requested plugin, marketplace, source checkout, and installed cache
  identity;
- the isolation boundary that was actually used.

A `PASS` means the declared skills and hooks required by this policy were found
in those Codex-owned registries. It does not mean the plugin is secure, its
runtime behavior is correct, or its external integrations work.

MCP servers and apps remain `DECLARED_ONLY`. The checker intentionally does not
start an MCP server or enter an app authentication flow, so it makes no claim
about their effective runtime behavior.

## No-execution boundary

The probe never sends a model request and never executes plugin hooks, MCP
servers, plugin scripts, apps, or authentication flows. It disables remote
plugin discovery and does not mount personal Codex or agent state into strict
mode. Synthetic hook and MCP commands are execution sentinels: if Codex starts
either command during the falsifier, the run fails before isolation cleanup.

Network access is permitted only while Docker prepares an image containing the
exact released Codex package. The complete strict probe then runs once with
network disabled, a read-only root and checkout, no host home/config mount, and
only owned state plus receipt paths writable.

## Isolation modes

| Mode | Supported host | Meaning |
| --- | --- | --- |
| `strict` | Linux with Docker | OS-enforced network and host-state denial; eligible for a certified receipt |
| `env` | Linux, macOS, or Windows | Temporary allowlisted process state only; diagnostic and never strict-certified |

Strict mode fails closed when Linux or Docker is unavailable. It never falls
back to `env`. macOS and Windows currently have no strict implementation.

## GitHub Action distribution

The JavaScript Action in [`action.yml`](action.yml) is the intended primary
distribution surface and uses the Node 24 Action runtime. No public immutable
release reference exists while the repository is on HOLD. Once the release
gates pass, consumers should pin the Action to a reviewed full commit SHA—not a
floating branch or tag.

Action inputs mirror the CLI: `marketplace-root`, `plugin`, `codex-version`,
`codex`, `cwd`, `output`, and `isolation`. The outputs are `status`, the full
`receipt`, and the observed `codex-version`.

## CLI diagnostic example

From this repository checkout, this copy-paste example exercises the synthetic
marketplace in diagnostic mode. Replace the marketplace and plugin values for
your own checkout. The installed `codex` command must report the exact version
passed below.

```sh
node ./src/cli.mjs \
  --marketplace-root ./test/fixtures/marketplace \
  --plugin sample \
  --codex-version 0.147.0 \
  --output ./conformance.json \
  --isolation env
```

The example uses `env`, so its receipt must say `network: "not_enforced"` and
`hostState: "not_enforced"`. Use strict mode only on Linux with Docker:

```sh
node ./src/cli.mjs \
  --marketplace-root ./path/to/marketplace \
  --plugin plugin-name \
  --codex-version 0.147.0 \
  --output ./conformance.json \
  --isolation strict
```

## Receipt and exit contract

Receipts conform to [`docs/receipt.schema.json`](docs/receipt.schema.json).
Every capability has one of these states:

- `DISCOVERED_EFFECTIVE`
- `DISCOVERED_UNTRUSTED`
- `DECLARED_ONLY`
- `UNOBSERVABLE`
- `MISSING`

Run outcomes and CLI/Action exit codes are stable:

| Outcome | Exit | Meaning |
| --- | ---: | --- |
| `PASS` | `0` | Required safe discovery evidence is present |
| `FAIL` | `1` | A required declared capability is missing |
| Input/tool error | `2` | The request, tool, schema, or evidence was invalid; a valid receipt is not guaranteed |
| `INCONCLUSIVE` | `3` | A requested surface cannot be observed safely through the released API |
| `ISOLATION_VIOLATION` | `4` | The required isolation boundary was violated |

`DISCOVERED_UNTRUSTED` and `DECLARED_ONLY` are explicit evidence states; neither
silently claims execution. Under the current policy they may appear in a
semantically valid `PASS` receipt when no required capability is missing.

## Released-Codex falsifier

The bounded falsifier accepts exactly Codex `0.147.0` and prior `0.146.1`:

```sh
CODEX_CURRENT_VERSION=0.147.0 \
CODEX_PRIOR_VERSION=0.146.1 \
npm run falsify
```

The workflow additionally sets `CODEX_FALSIFIER_OUTPUT_ROOT` to a
repository-relative evidence directory. Environment-derived output is bound to
the canonical checkout: every parent component must be a real directory, no
symlink is followed, and containment is rechecked before evidence writes.
Programmatic callers of `runFalsifier({ outputRoot })` may intentionally manage
an arbitrary output location; callers that require checkout containment must
also pass `outputBoundary`.

Ordinary `npm test` runs skip the real strict released-binary integration test
unless a trusted operator explicitly sets
`CODEX_RELEASED_FALSIFIER_OPT_IN=1`. The released workflow does not duplicate
that expensive test; its single evidence-producing step is `npm run falsify`.

It runs positive and deliberately disabled-skill lanes for both versions and
writes an evidence ledger. Even after that bounded check passes, its summary
remains `HOLD` while the separate public-fixture matrix is `UNRUN (0/10)`.
See [`docs/evidence/technical-falsifier.md`](docs/evidence/technical-falsifier.md)
for the observed strict boundary and the remaining public-fixture hold.

## Development

Node 24 is required. There are no runtime or development dependencies.

```sh
npm test
npm pack --dry-run
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing discovery or isolation
behavior and [`SECURITY.md`](SECURITY.md) for private vulnerability reporting.

## License

MIT. See [`LICENSE`](LICENSE).
