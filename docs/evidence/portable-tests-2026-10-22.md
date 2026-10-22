# Exercising the same contract on Windows and Linux

Validation date: 22 October 2026. Runtime: Node 24.19.0 with its bundled npm
11.17.0. Linux validation used Ubuntu 24.04 under WSL; Windows validation used
the native Node binary. No Codex/model request or external integration was run.

## Starting point

The ordinary test suite initially reported 136 passes, 22 failures and one
opt-in skip on Windows. Several failures happened before the behavior under
test: Unix-only path expectations, line endings, symlink privileges, process
signals and the assumption that `spawn('npm')` can launch a Windows command shim.

The production discovery and isolation implementation is unchanged by this
revision. The change makes tests exercise their intended contract on each host.

## Decisions that preserve the checks

- Compare native paths and accept both line endings; keep exact identity checks.
- Use Windows directory junctions for applicable link-boundary cases. Tests still
  require the original link/escape rejection, untouched canaries and no outside
  reads; an unrelated filesystem error is not accepted as success.
- Retain Linux file-symlink extraction checks. Where Windows denies creating the
  required file symlink, assert the denied operation and unchanged boundary
  rather than pretending a symlink was created.
- Separate platform signal/pipe observations from deterministic transport-error
  checks. POSIX closed-pipe expectations remain on Linux; explicit write-error
  and forced-shutdown cases cover their own contracts on both hosts.
- Invoke npm's JavaScript entry point when `npm_execpath` is available, then
  install the locally packed tarball with `--offline --ignore-scripts`. Execute
  the installed CLI shim and verify its help output.

## Observed result

| Environment | Command | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: |
| Native Windows | `node --test`, with bundled npm supplied through `npm_execpath` | 160 | 0 | 1 |
| Ubuntu 24.04 / WSL | `node --test`, with official Node/npm on PATH | 160 | 0 | 1 |

The two added tests cover deterministic forced shutdown and write-error
handling. The one existing skip is the real released-Codex strict integration
test, which requires an explicit opt-in and Linux/Docker. These results are
ordinary-suite observations; the separate [archived strict fixture
matrix](public-fixture-matrix.md) records released-binary discovery evidence.

The CI workflow now runs ordinary tests and package inspection on both
`ubuntu-24.04` and `windows-2025`. A workflow definition is not itself a completed
run; inspect the repository's Actions result for the exact commit being reviewed.

## Reproduce

Install the official Node 24 distribution, including npm, then run:

```sh
npm test
npm pack --dry-run
```

The repository has no runtime or development dependencies. Keep strict runtime
checks separate from this ordinary suite; no authentication or model key is
needed for these tests.
