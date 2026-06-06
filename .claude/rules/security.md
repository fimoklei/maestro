# Security (project-specific for Maestro)

Maestro runs the `apm` CLI, reads and writes your disk, and serves a local web app — three surfaces an attacker can abuse. Treat every input as hostile. Read before writing code that starts a process, touches a path derived from input, parses an external file, or adds an HTTP endpoint.

## Hard rules (apply now)

- **Shelling out.** Args array only (`execFile`/`spawn` with a list). Never `exec`, never `shell: true`, never concatenate input into a command. Names, paths, and versions go in as data, not command text. → prevents command injection (a name like `; rm -rf ~`).
- **Filesystem paths.** Resolve against one fixed allowed root; assert the result stays inside it. Reject `..` and absolute paths from external input. Allowlist the target directories. → prevents path traversal (a name like `../../.ssh/config`).
  - **Exception — the consuming-repo registry is the allowlist.** Registration deliberately accepts an arbitrary absolute path (the user pastes a project path; there is no fixed root). Compensating controls: registration validates absolute + `realpath` + exists + is-a-directory; **every** path-taking endpoint (deploy *and* deploy-state read) requires exact membership in the registry after `realpath` before any filesystem or `apm` access; CSRF/DNS-rebinding is blocked by localhost-bind + the Host/Origin check below, not by a fixed root. A path not in the registry is rejected.
- **External data is untrusted.** Lockfiles, `apm.yml`, `apm` stdout: parse → validate with Zod → use. Never `eval`. Safe YAML only (no custom tags). Boundary placement → `architecture.md`; general validation rules → global `code-standards.md`.

## Local server & secrets

- **Local server (enforced).** `server.ts` binds `127.0.0.1` only, never `0.0.0.0`. The guard runs app-wide on every non-`GET`/`HEAD` (state-changing) method — `packages/server/src/origin-host-guard.ts` — so a new write route is protected by default, not safe-only-if-remembered. It requires a JSON body + allowlisted `Host` + a present, allowlisted `Origin`. It is a `createApp` dep — production always enables it, tests construct it disabled; no static bypass header. → blocks DNS-rebinding / CSRF: a malicious site POSTing to `localhost:<port>` to drive your machine.
  - **Known residual — port not checked.** The allowlist matches hostname only (`127.0.0.1`, `localhost`), not port, so any `localhost:*` origin counts as same-origin. Deliberate: the web dev port (Vite) is not fixed, so pinning it would reject legitimate requests. Remote-origin CSRF and DNS-rebinding are still blocked (their `Host`/`Origin` carry the attacker's domain). The residual gap is a *compromised same-host origin* — revisit if a fixed web origin ever exists.
- **Config location.** The config path is injectable via `MAESTRO_HOME` (default `~/.maestro`), resolved by `resolveMaestroConfigPath`. Tests and `pnpm smoke` point it at a sandbox dir, so they never read or write real data.
- **Secrets (captured — enforce when the code exists).** Don't log raw `apm` output (may contain tokens); don't persist credentials. APM owns credentials, not Maestro.
