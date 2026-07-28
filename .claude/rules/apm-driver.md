# APM driver rules (project-specific for Maestro)

Imperatives for driving `apm` or parsing its lockfile/output — rules only.
The observed behavior behind every rule lives in `docs/apm-behavior.md`
(describes one apm version; check its header). The decisions live in ADRs:
0001 (never reimplement apm), 0003 (tag-pinned git refs), 0011 (global
targets = detected tools), 0013 (narrowed-install reconciliation), 0014
(GitHub-only origins).

## Grounding

- Never guess apm behavior — read `docs/apm-behavior.md`, or measure it and
  record it there. If the installed apm version differs from that doc's
  header, run `docs/agents/apm-upgrade.md` before relying on either.
- Build fixtures from real captures, never retyped; every capture command is
  recorded in `tests/fixtures/README.md`.

## Invocation

- `execFile` + args array, never a shell string (`security.md`).
- Always pass `-t` on install and update, as one comma list of tools.
  `uninstall` has no `-t` — see Remove.
- Deploy refs are tag-pinned
  `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z` only (ADR-0003,
  ADR-0014).
- Run global (`-g`) installs from a neutral cwd — apm edits the cwd's
  `.gitignore`.
- Keep real apm out of the fast test loop (`testing.md`); network + auth
  belong to the canary/integration lanes.

## Classifying output

- Success = the `Installed \d+ APM dependenc` marker with no error phrases —
  never the exit code. Absent marker = failure, fail-closed.
- Classify auth-required only at `apm view`, only on the phrases
  `Authentication failed` / `No token available` (case-insensitive). Never
  echo matched output (`security.md`).
- Whitespace-normalize and lowercase before matching any apm phrase — Rich
  wraps mid-sentence (`LEARNINGS.md` · rich-wraps-phrases-mid-sentence).
- `apm outdated` / `apm view` have no `--json`: parse behind the driver
  port, capture with `COLUMNS=200`, keep empty table cells intact, and
  integration-test against fixtures.

## Lockfile

- Parse → validate with Zod → use (`security.md`); ignore unknown keys.
- Never recompute `content_hash` (opaque); `deployed_file_hashes` is the
  content baseline.
- Scope (global vs per-repo) is known only from *which* lockfile you read,
  never from a field inside it.

## Update

- Never use `apm update` to move an exact tag pin — it is a no-op. Update =
  resolve the latest tag + re-install at that tag.
- Never same-ref install over a dirty subtree — apm silently resets local
  edits. The deploy use-case's guards stay in front of every install.

## Remove

- Success = the `Uninstall complete: Removed \d+ package(s) from apm.yml`
  marker, never the exit code — every outcome exits 0, including a package
  that was never installed. Absent marker = failure, fail-closed.
- Read every marker, not the first: the success marker can be followed by
  `Note: \d+ package(s) were not found in apm.yml`.
- Never parse the `Cleaned up \d+ integrated skills` count — it is unstable.
- Name the package with the same tag-pinned ref the install used; a bare
  skill name is rejected and still exits 0.
- Never treat `--dry-run` as a blast-radius preview — it omits the deployed
  files it is about to delete.
- A dirty deployed subtree warns, never blocks: apm deletes local edits with
  no warning, so classify the copy and state the consequence in the
  confirmation before the uninstall call. Install and update still refuse.
- Never narrow `targets:` in `apm.yml` to scope a removal — it orphans the
  other tools' files while dropping the lockfile entry. Per-tool cleanup is
  the scoped `rm` behind `DeployedCleanupPort` (ADR-0013).
- Expect the lockfile to be deleted, not emptied, when the last dependency
  goes; an absent lockfile means nothing deployed, never an error.

## Danger

- Never run a bare `apm uninstall -g`. On 0.26.0 the parser rejects it, but
  it is the command that wiped 19 dirs beyond its lockfile on the version
  behind the 2026-07-17 incident. Always name the package.
- Never point a spike `-g` command at the real home; sandbox `HOME` always
  (`LEARNINGS.md` · spike-isolation).

## Unobserved

- Do not drive hook or MCP deploys until spiked the way skills were
  (`docs/apm-behavior.md` → "Unobserved").
