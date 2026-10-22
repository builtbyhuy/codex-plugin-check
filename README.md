# Codex Plugin Check

**Check what a pinned Codex release discovers from your plugin checkout.**

A plugin manifest can look correct while an installed skill is missing, a hook
is untrusted, or the installed identity points somewhere unexpected. This Node.js
CLI and GitHub Action reconciles those surfaces into a machine-readable receipt
before you test the plugin's behavior.

The check sends no model request and does not start plugin hooks, MCP servers or
app authentication. It answers a specific release question: **did this exact
Codex version discover the expected capabilities from this source?**

## How it works

1. Add the local marketplace and install the requested plugin in temporary state.
2. Reconcile install/list identity with Codex's plugin, skill and hook registries.
3. Write a JSON receipt and return a status-specific exit code.

The strict Linux/Docker probe denies network access, mounts the source read-only
and excludes your personal Codex home. Image preparation can download the pinned
Codex package; the probe itself runs without network access.

## GitHub Action

Use a reviewed full commit SHA. This example pins the implementation exercised
by the archived two-version public-fixture matrix:

```yaml
jobs:
  codex-plugin-discovery:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false

      - name: Check plugin discovery
        id: discovery
        uses: builtbyhuy/codex-plugin-check@3285a65bab2ba805665c6be4e4349874fc7be417
        with:
          marketplace-root: .
          plugin: your-plugin-name
          codex-version: 0.147.0
          isolation: strict
```

Replace the plugin name and marketplace path. The runner needs Linux with Docker.
The Action exposes `status`, `receipt` and `codex-version`; the default receipt
file is `conformance.json`. See [`action.yml`](action.yml) for all inputs.

## CLI diagnostic example

From this checkout, the command below checks the included synthetic fixture.
The installed `codex` binary must report the exact stable version supplied.

```sh
node ./src/cli.mjs \
  --marketplace-root ./test/fixtures/marketplace \
  --plugin sample \
  --codex-version 0.147.0 \
  --output ./conformance.json \
  --isolation env
```

For your plugin, replace `--marketplace-root` and `--plugin`. `--codex` accepts a
binary path; `--expected-plugin-root` and `--expected-plugin-version` can bind the
expected source subtree and installed version. Run `node ./src/cli.mjs --help`.

| Mode | Host | Boundary |
| --- | --- | --- |
| `strict` | Linux with Docker | Network-denied probe, read-only source, isolated state; fails closed if unavailable |
| `env` | Linux, macOS, Windows | Temporary allowlisted process state; network and host access are not OS-enforced |

## Read the result

| Outcome | Exit | Meaning |
| --- | ---: | --- |
| `PASS` | 0 | Required discovery evidence is present |
| `FAIL` | 1 | A required declared capability is missing |
| Input/tool error | 2 | The request or tool evidence is invalid; a valid receipt is not guaranteed |
| `INCONCLUSIVE` | 3 | A requested surface cannot be observed safely |
| `ISOLATION_VIOLATION` | 4 | The requested boundary was violated |

Each capability records its own state: `DISCOVERED_EFFECTIVE`,
`DISCOVERED_UNTRUSTED`, `DECLARED_ONLY`, `UNOBSERVABLE` or `MISSING`.
An untrusted hook can be discovered without running it. MCP servers and apps
remain declaration-only. A discovery `PASS` is not a runtime integration test
or a security assessment. The [receipt schema](docs/receipt.schema.json) defines
the full contract.

## Inspect the engineering

- [Public fixture matrix](docs/evidence/public-fixture-matrix.md): ten pinned
  plugin fixtures across Codex 0.146.1 and 0.147.0, with retained receipts and
  input identities. Nine fixtures were direct; one used a documented adapter.
- [Released-binary falsifier](docs/evidence/technical-falsifier.md): positive and
  deliberately missing-skill cases, isolation canaries and execution sentinels.
- [Windows and Linux validation](docs/evidence/portable-tests-2026-10-22.md):
  native-path, link-boundary, process-shutdown and installed-package checks.
- [Evidence archive](https://github.com/builtbyhuy/codex-plugin-check/releases/tag/v0.1.0):
  the recorded Linux public-fixture run. These are historical pinned checks,
  rather than a claim about every future Codex release.

The ordinary suite runs without a model or a Codex installation:

```sh
node --test
npm pack --dry-run
```

Use Node 24 with its bundled npm. There are no runtime or development dependencies. The real
released-binary test is opt-in and requires Linux/Docker; `node --test` does not
silently launch it. See [Contributing](CONTRIBUTING.md) for local checks and
[Security](SECURITY.md) for reports.

## License

MIT. See [LICENSE](LICENSE).
