# Security (project-specific for Maestro)

Treat every input as hostile. Read before writing code that starts a process, touches a path derived from input, parses an external file, or adds an HTTP endpoint.

## Hard rules

- **Shelling out.** Args array only (`execFile`/`spawn` with a list). Never `exec`, never `shell: true`, never concatenate input into a command. Names, paths, and versions go in as data, not command text.
  - **Three executables, no fourth.** Maestro starts `apm`, `git` and `gh` and nothing else. `gh` is optional: its absence degrades the review capability only, never blocks the cockpit (ADR-0029). Adding a fourth takes an ADR.
- **Filesystem paths.** Resolve against one fixed allowed root; assert the result stays inside it. Reject `..` and absolute paths from external input.
  - **Exception — the consuming-repo registry is the allowlist.** Registration deliberately accepts an arbitrary absolute path. Controls: registration validates absolute + `realpath` + exists + is-a-directory; **every** path-taking endpoint (deploy *and* deploy-state read) requires exact registry membership after `realpath` before any filesystem or `apm` access. A path not in the registry is rejected.
- **External data is untrusted.** Lockfiles, `apm.yml`, `apm` stdout: parse → validate with Zod → use. Never `eval`. Safe YAML only (no custom tags).

## Local server & secrets

- `server.ts` binds `127.0.0.1` only, never `0.0.0.0`. The guard (`packages/server/src/origin-host-guard.ts`) runs app-wide on every non-`GET`/`HEAD` method: JSON body + allowlisted `Host` + present, allowlisted `Origin`. It is a `createApp` dep — production always enables it, tests construct it disabled; no static bypass header.
  - **Known residual — port not checked.** The allowlist matches hostname only (deliberate: the Vite port is not fixed). Residual gap: a compromised same-host origin — revisit if a fixed web origin ever exists.
- Config path via `MAESTRO_HOME` (default `~/.maestro`), resolved by `resolveMaestroConfigPath`; tests and `pnpm smoke` point it at a sandbox.
- Don't log raw `apm` or `gh` output (may contain tokens); don't persist credentials. APM and `gh` own their credentials, not Maestro.
- Never put `apm` or `gh` prose in an HTTP response — a failure is stated from the server's own message table, never from what the binary printed. A named field derived from their output may cross only with a shape check where that output is first read, and a cell failing it fails the whole read (ADR-0018; `parseOutdated` and the `gh` adapter's Zod schema are the precedents).
- `ApmCliDriver` passes only ambient env to apm, and `GhCliAdapter` only ambient env to `gh` — never inject `GITHUB_TOKEN`, `GH_TOKEN` or any credential. Maestro never stores, reads or forwards a token to either (ADR-0029). Sole exception: the dev smoke harness (sandbox only, ADR-0010). Do not add token-bridging to the product.
