# Codex Plugin Check — approved design specification

**Status:** APPROVED FOR TECHNICAL FALSIFICATION  
**Owner:** Huy (`builtbyhuy`)  
**Date:** 2026-08-10  
**Working repository:** `builtbyhuy/codex-plugin-check`

## Decision

Build an Action-first, dependency-light checker that asks a released Codex
binary whether an exact plugin checkout was installed and whether the
capabilities Codex declares for that plugin appear in Codex's effective
registries.

The first milestone is a falsifier, not a polished product. Failure of any
load-bearing technical gate changes the decision to `NO-BUILD`; it must not be
papered over with static manifest parsing.

## User job

Before merging or releasing a Codex plugin, a maintainer needs one reproducible
receipt proving:

1. the exact checkout was the source Codex installed;
2. Codex itself declared the plugin's skills, hooks, MCP servers, and apps;
3. Codex's effective registries expose every capability for which a safe,
   no-auth registry exists;
4. missing, untrusted, and unobservable capabilities remain different states;
5. the check did not use personal state, credentials, a model call, or plugin
   executable code.

## V0 surface

The reusable core and CLI accept:

- `--marketplace-root <absolute-or-relative-path>`;
- `--plugin <plugin-name>`;
- `--codex <binary-path>` for non-certifying environment diagnostics;
- `--codex-version <exact-version>` for strict container checks;
- `--cwd <workspace-path>`, defaulting to the marketplace root;
- `--output <path>`, defaulting to `conformance.json`;
- `--isolation strict|env`, defaulting to `strict`.

The GitHub Action accepts equivalent inputs, uses Node 24, and initially
supports `ubuntu-latest`. It prepares a container containing the requested
released Codex version before entering the network-denied probe. Strict mode
requires Docker; cross-platform environment-only diagnostics cannot emit a
certified isolation `PASS`.

## Probe flow

1. Resolve and validate the marketplace root, workspace, output, and Codex
   binary paths.
2. Create one owned temporary root with separate `home`, `codex-home`, `tmp`,
   `xdg-config`, `xdg-cache`, `xdg-data`, and `workspace` directories.
3. Construct an allowlisted child environment. Set `HOME`, `CODEX_HOME`,
   `TMPDIR`, and every XDG home to owned paths. Remove OpenAI, ChatGPT, GitHub,
   npm, cloud, SSH-agent, proxy, and telemetry credential variables.
4. Add the local marketplace and install the named plugin with the released
   Codex binary. Verify the CLI's JSON says the plugin is installed from the
   requested local marketplace.
5. Start `codex app-server --stdio --disable remote_plugin` inside the isolated
   environment. Send `initialize` with `experimentalApi: true`, then send the
   `initialized` notification.
6. Request `plugin/read`, `skills/list` with `forceReload: true`, and
   `hooks/list`. Do not call `app/list`: the released implementation uses an
   auth/network-backed connector directory. Do not call MCP status APIs: they
   initialize effective MCP servers.
7. Treat `plugin/read` as Codex-owned declaration evidence. Treat
   `skills/list` and `hooks/list` as effective discovery evidence. Treat MCP
   and app declarations as `DECLARED_ONLY` unless a released, no-auth,
   Codex-owned effective registry can be observed without executing or
   authenticating the capability.
8. Emit one deterministic JSON receipt and a short human summary. Shut down the
   app server and remove only the owned temporary root.

## Result vocabulary

Every declared capability receives exactly one status:

- `DISCOVERED_EFFECTIVE`
- `DISCOVERED_UNTRUSTED`
- `DECLARED_ONLY`
- `UNOBSERVABLE`
- `MISSING`

The whole run receives one status:

- `PASS`: every capability required by the selected policy is present;
- `FAIL`: install, declaration, or required discovery failed;
- `INCONCLUSIVE`: the released Codex API cannot safely observe a requested
  effective surface;
- `ISOLATION_VIOLATION`: the probe attempted a forbidden network or host-state
  access.

Exit codes are stable: `0` for `PASS`, `1` for conformance `FAIL`, `2` for
input/tool errors, `3` for `INCONCLUSIVE`, and `4` for
`ISOLATION_VIOLATION`.

## Receipt contract

The JSON receipt is schema-versioned and deterministic apart from explicit
runtime metadata:

```json
{
  "schemaVersion": "0.1.0",
  "status": "PASS",
  "codexVersion": "0.147.0",
  "platform": "darwin-arm64",
  "plugin": {
    "name": "sample",
    "marketplace": "local-marketplace",
    "sourceRoot": "/workspace"
  },
  "capabilities": [
    {
      "kind": "skill",
      "key": "sample-skill",
      "status": "DISCOVERED_EFFECTIVE",
      "source": "plugin/read + skills/list"
    }
  ],
  "isolation": {
    "mode": "strict",
    "network": "denied",
    "hostState": "denied"
  }
}
```

Absolute temporary paths are normalized before writing the receipt. Capability
records sort by `kind`, then `key`.

## Security and isolation boundary

- Never execute plugin hooks, prompt hooks, agent hooks, MCP servers, scripts,
  or app authentication flows.
- Never send a model request or require an API key.
- Never inherit personal Codex/agent configuration or credentials.
- Network may be used only to prepare a pinned Codex binary before the probe.
- `strict` mode must be enforced by an OS boundary, not an environment-variable
  claim. V0 strict mode uses a network-disabled, read-only Linux container with
  no host home/config mounts. The image is prepared with an exact Codex version
  while network is available; the actual probe starts only under
  `--network none`. The tool source and target checkout are read-only mounts;
  only owned state and receipt destinations are writable. macOS and Windows are
  diagnostic `env` mode only until an equivalent observable boundary is
  implemented.
- The V0 build base is pinned to the official multi-architecture image
  `node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03`.
- Failure to establish the OS boundary is an error, not an automatic downgrade
  to `env` isolation.
- The target checkout is read-only during the probe. The only writable paths
  are inside the owned temporary root and the explicit receipt destination.

## Non-goals

- static manifest security scanning or linting;
- hook or MCP behavior execution;
- model-output evaluation;
- automatic repair;
- multi-vendor compatibility;
- authenticated app verification;
- Windows/macOS Action parity before the Linux gate passes;
- dashboards, hosted services, telemetry, or an account system.

## Technical falsifier gates

The project advances from `VALIDATE` to `BUILD` only when all gates pass:

1. A synthetic all-surface declaration plugin is installed from an exact local
   checkout by stable Codex `0.147.0` and prior stable `0.146.1` inside the
   strict Linux container.
2. Both versions provide Codex-owned declaration evidence. Skill and hook
   declarations are correlated to effective registries with no false positive.
3. A deliberately absent skill and a disabled/untrusted hook produce the
   correct non-pass states.
4. Strict isolation denies network and access to real `~/.codex`, `~/.agents`,
   credentials, and unrelated host files. A canary outside the allowlist never
   appears in output.
5. The exact checkout remains byte-identical before and after the probe.
6. No model, hook, MCP server, or app is executed.
7. Ten representative public plugin fixtures either complete or receive an
   honest version/API incompatibility classification.
8. Each version completes within 90 seconds on the supported CI runner.

Any failure in gates 1, 2, 4, 5, or 6 is a hard `NO-BUILD`. MCP/app remaining
`DECLARED_ONLY` is allowed only when the receipt explicitly says that effective
runtime behavior was not verified.

## Market and application gates

After technical gates pass:

- expose the pinned prerelease to 20 maintainers already carrying bespoke
  plugin-install workflows;
- require at least three independent real runs and at least two repositories
  retaining it as a required CI check;
- kill the product if those thresholds are not met after 20 qualified
  exposures or if it finds no credible unknown defect;
- before considering a Codex for Open Source application, require two
  feedback-driven releases, one real Codex upgrade regression caught, one
  upstream issue reproduced or accepted from the receipt, public triage/review,
  and a target of ten public downstream workflows.

Huy has authorized repository creation, publication, maintainer contact, and a
future application. Authorization does not waive these evidence gates or permit
false claims about adoption, maintainer status, or eligibility.
