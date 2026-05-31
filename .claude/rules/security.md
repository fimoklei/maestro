# Security (project-specific for Maestro)

Maestro runs the `apm` CLI, reads and writes your disk, and serves a local web app — three surfaces an attacker can abuse. Treat every input as hostile. Read before writing code that starts a process, touches a path derived from input, parses an external file, or adds an HTTP endpoint.

## Hard rules (apply now)

- **Shelling out.** Args array only (`execFile`/`spawn` with a list). Never `exec`, never `shell: true`, never concatenate input into a command. Names, paths, and versions go in as data, not command text. → prevents command injection (a name like `; rm -rf ~`).
- **Filesystem paths.** Resolve against one fixed allowed root; assert the result stays inside it. Reject `..` and absolute paths from external input. Allowlist the target directories. → prevents path traversal (a name like `../../.ssh/config`).
- **External data is untrusted.** Lockfiles, `apm.yml`, `apm` stdout: parse → validate with Zod → use. Never `eval`. Safe YAML only (no custom tags). Boundary placement → `architecture.md`; general validation rules → global `code-standards.md`.

## Captured — enforce when the code exists

- **Local server.** Bind `127.0.0.1` only, never `0.0.0.0`. At the first write/deploy endpoint, add an Origin/Host check. → blocks DNS-rebinding / CSRF: a malicious site open in your browser POSTing to `localhost:<port>` to make your machine deploy.
- **Secrets.** Don't log raw `apm` output (may contain tokens); don't persist credentials. APM owns credentials, not Maestro.
