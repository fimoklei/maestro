# APM driver — observed behavior (project-specific for Maestro)

How `apm` actually behaves, captured by running it — not guessed (the trap in
`LEARNINGS.md`). Read before writing code that drives `apm` or parses its
lockfile/output. Pair with `security.md` (how to shell out safely) and ADR-0003
(why tag-pinned git refs). **Observed against apm 0.16.0 on 2026-06-02;
re-verify on an apm upgrade.**

## Deploy command

`apm install <REF> -t claude`, run with the consuming repo as the working
directory, via `execFile` with an args array (never a shell string —
`security.md`). apm auto-creates `apm.yml`, writes `apm.lock.yaml`, materializes
the skill into `.claude/skills/<name>/`, creates `apm_modules/`, and appends
`apm_modules/` to `.gitignore`. The repo need not be pre-initialized.

### Reference forms (only one is used)

| Form | Example | Result |
|---|---|---|
| Local path | `/abs/.../agent-harness/skills/tdd` | `source: local`, **no version, invisible to drift**. Forbidden (ADR-0003). |
| Git, unpinned | `github.com/<owner>/<repo>/skills/<name>` | `resolved_commit` only; apm warns "unpinned — add #tag". Not used. |
| **Git, tag-pinned** | `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z` | `resolved_ref` + `resolved_commit` + `content_hash`. **The Maestro form.** |

The `host/owner/repo/subpath#ref` shape works. The `https://….git/subpath` shape
**fails** ("not accessible"). Owner/repo are derived from the local clone's
`origin` remote; the subpath is `skills/<name>`.

Real git installs **need network** (clone from GitHub, ~3–4s; a partial clone may
fail and retry a full bare clone). Keep real `apm` out of the fast test loop —
see `testing.md` (canary integration test only).

## Lockfile shape — `apm.lock.yaml`

Top level: `lockfile_version`, `generated_at`, `apm_version`, `dependencies: []`.
Parse → validate with Zod → use (`security.md`). A tag-pinned skill entry:

```yaml
- repo_url: fimoklei/agent-harness
  host: github.com
  resolved_commit: <40-hex>
  resolved_ref: v0.5.0          # the human version shown in deploy-state
  virtual_path: skills/tdd
  is_virtual: true
  package_type: claude_skill    # only type observed; hooks/MCP UNobserved
  deployed_files: [.claude/skills/tdd]
  content_hash: sha256:<hex>
```

Deploy-state reads `resolved_ref` as the version, `virtual_path`/`deployed_files`
for identity and location, `package_type` for the primitive type.

## Drift — `apm outdated`

**No `--json`.** Output is a human table; the parser lives behind the driver port
and is integration-tested against captured output. Observed states:

- Tag-pinned, newer tag exists → row: `Package | Current v0.5.0 | Latest v0.5.1 |
  Status outdated | Source git tags`.
- Local-path dep → `No remote dependencies to check` (drift impossible — why
  ADR-0003 forbids local paths).
- Git unpinned → `All dependencies are up-to-date` (tracks the branch, not tags).

Maestro consumes this **binary** (behind / up-to-date), per roadmap 01.

## Update

`apm update` moves a tag-pinned dep to the latest matching tag — same driver port
as deploy.

## Open — observe before relying on it

- **Resolving "latest tag"** for a deploy is not yet observed. `apm view` ("list
  remote versions") is the likely source; spike it before the deploy code assumes
  a mechanism.
- **Hook and MCP deploys** are unobserved. `apm mcp` is a separate command
  surface. Do not drive them until spiked the same way skills were.
