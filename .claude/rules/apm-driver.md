---
paths:
  - "packages/core/src/deploy/**"
  - "packages/core/src/deploy-state/**"
  - "packages/core/src/lockfile/**"
  - "packages/core/src/inventory/**"
  - "packages/core/src/drift/**"
  - "tests/integration/apm-*"
  - "tests/fixtures/apm*"
  - "scripts/capture-apm-fixtures.mjs"
  - "docs/apm-behavior.md"
---

# APM driver rules

Imperatives for driving `apm` or parsing its lockfile/output — rules only.
The observed behavior behind every rule lives in `docs/apm-behavior.md`
(describes one apm version; check its header).

## Grounding

- Never guess apm behavior — read `docs/apm-behavior.md`, or measure it and
  record it there. If the installed apm version differs from that doc's
  header, run `docs/agents/apm-upgrade.md` before relying on either.
- Build fixtures from real captures, never retyped; every capture command is
  recorded in `tests/fixtures/README.md`. Capture an install fixture only
  when no `GitHub API rate limit hit` line appears — that line belongs to
  the capturing IP address's spent anonymous quota, not to apm.
- Run an install whose output nobody reads (a setup step) auth-first:
  `APM_GITHUB_AUTH_FIRST=1`. Run default every command whose output is
  evidence — a fixture capture, the measured command of a bug measurement —
  and the canaries.
- Before departing from APM's model, read ADR-0019 — the accepted departures.
  A new departure is amended into it, never given its own ADR.

## Invocation

- Always pass `-t` on install and update, as one comma list of tools.
  `uninstall` has no `-t` — see Remove.
- Deploy refs are tag-pinned
  `github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z` only. Build the
  subpath with `harnessSkillSubpath`: apm reads a ref's subpath literally, so
  a hand-written `skills/<name>` fails `Subdirectory … not found`.
- Run global (`-g`) installs from a neutral cwd — apm edits the cwd's
  `.gitignore`.
- Hand every `-g` command a `realpath`ed `HOME`.

## Root package and its Selection

- Install the Harness as the tag-pinned repository root ref, one `--skill`
  flag per selected name. A Selection is never a set of per-skill subpath
  refs.
- Write the exact Selection to `skills:` in `apm.yml` before every install,
  and pass those same names as `--skill`; the flag alone only adds.
- Never write `skills: []` and never drop the `skills:` key: an empty list is
  refused, and a missing key installs the whole bundle. Remove the last
  selected skill by naming the package in `apm uninstall`.
- Remove the Harness by naming its root ref. Never uninstall a neighbouring
  dependency to reach it, and never widen the removal — a named uninstall
  already spares every other dependency.
- Never install a subpath ref of the Harness repository beside its root
  package; apm refuses the pair.
- Expect an uninstall of a legacy per-skill entry to delete a root package's
  copies. Verify every remaining entry's `deployed_files` exist afterwards,
  and re-install a root package at its same ref when they do not
  (`docs/apm-behavior.md` § A legacy entry's removal).
- Read what is deployed from `deployed_files` plus the file's existence,
  never from `skill_subset` or `skills:`; both keep names apm has already
  dropped.
- Read the Selection back after every install. apm sorts `skills:`, so the
  written order is never the order you passed.
- Classify a Remove from files and the lockfile, never from the exit code or
  a marker alone.
- Edit `skills:` only under exactly one dependency on the connected Harness
  carrying an explicit list. Refuse every other shape — two such dependencies,
  a bare root-ref string, a missing or non-list `skills:` — before anything is
  written, and leave an absent dependency for apm to create on a first Deploy.
- Record the operation, its release and its desired Selection before the first
  mutation, and clear the record only once disk, `skills:` and the deployment
  record all agree with that Selection. A matching tag clears nothing.
- Guard every copy in the desired Selection, never only the named skill: one
  install rewrites the whole Selection.

## Classifying output

- Success = `Installed \d+ APM dependenc`, `Cleaned \d+ stale file(s)`,
  `Updated apm.lock.yaml` or `No changes -- install state already up to
  date`, with no failure phrase from `docs/apm-behavior.md` § Install
  signals — never the exit code. Absent marker = failure, fail-closed.
- Read `Unsafe skill destination`, `Refusing deployment through a symlinked
  path component` and `Uninstall stopped: apm.lock.yaml records paths APM
  does not manage` as a linked destination. Report that uninstall phrase as
  a link only when `linkedDestination` finds one; otherwise as a failed
  removal.
- Classify auth-required only at `apm view`, only on the phrases
  `Authentication failed` / `No token available` (case-insensitive). Never
  echo matched output (`security.md`). The same phrases can appear in
  `install` output when the anonymous probe was throttled and no token is
  set; never classify them there.
- Whitespace-normalize and lowercase before matching any apm phrase — Rich
  wraps mid-sentence.
- Check structural skill rules in `core`. `apm compile --validate` never reads
  `skills/*/SKILL.md`, and `apm install` normalizes a bad name and exits 0. For
  hidden Unicode, read `passed` from `apm audit --file <path> -f json`, never
  the exit code.
- `apm outdated` / `apm view` have no `--json`: parse behind the driver
  port, capture with `COLUMNS=200`, keep empty table cells intact, and
  integration-test against fixtures.

## Lockfile

- Ignore unknown keys.
- Never recompute `content_hash` (opaque); `deployed_file_hashes` is the
  content baseline.
- Scope (global vs per-repo) is known only from *which* lockfile you read,
  never from a field inside it.
- Never read `deployments[].target` as a tool name — it names the deploy
  root (`agents` for the shared `.agents/` copy).

## Update

- Never use `apm update` to move an exact tag pin — it is a no-op. Update =
  resolve the latest tag + re-install at that tag.
- Never install over a dirty subtree; the deploy use-case's guards stay in
  front of every install. Never read a success marker as proof that an
  edited copy was reset.

## Remove

- Success = the `Uninstall complete: removed \d+ package` marker, never the
  exit code. Absent marker = failure, fail-closed. Keep the not-found signal
  beside it, and read `from the selected profile only` as failure: the
  package stays in `apm.yml`.
- On `from the selected profile only` from a global uninstall, run the same
  uninstall once per former Claude Code folder: a `deployments[]` row with
  `target: claude` under another root than the current one. Leave
  `CLAUDE_CONFIG_DIR` out for `.claude`, set it to `$HOME/<root>` otherwise,
  and give a root outside `HOME` no retry (ADR-0019 §9). Guard each former
  folder's copy before the first uninstall, as the current folders.
- Never parse the cleaned-paths count — it counts what that run deleted.
- Name the package with the same tag-pinned ref the install used; a bare
  skill name is rejected.
- Never treat `--dry-run` as a blast-radius preview — it omits the deployed
  files it is about to delete.
- **Refuse a diverged deployed copy before the uninstall call**, as install
  and update do: apm refuses an edited file and keeps an added one. The
  recovery the notice names is `Deploy again`, which resets the copy, then
  remove. An unverifiable copy (no recorded hashes) still warns and goes on
  consent.
- Never narrow `targets:` in `apm.yml` to scope a removal — it scopes
  nothing: the cleanup deletes every tracked file whatever `targets:` says.
  Per-tool cleanup is the scoped `rm` behind `DeployedCleanupPort`.
- Expect the lockfile to be deleted, not emptied, when the last dependency
  goes; an absent lockfile means nothing deployed, never an error.

## Danger

- Never run a bare `apm uninstall -g`; always name the package.
- Never point a spike `-g` command at the real home; sandbox `HOME` always,
  with `GITHUB_TOKEN=$(gh auth token)` and `GITHUB_APM_PAT` set.
- Run `apm compile` only with `--validate` or `--dry-run`. Plain `compile`
  overwrites `AGENTS.md`/`CLAUDE.md` in `$PWD`; `--user-scope` overwrites
  `~/.claude/CLAUDE.md`.
- Move a pin in `apm.yml` by editing the git entry's `ref:`, then check it with
  `grep -n ref:` before installing. apm writes a git dependency as an object
  (`git:`, `ref:`, `skills:`), so a `sed` on a `#tag` string matches nothing.

## Unobserved

- Do not drive hook or MCP deploys until spiked the way skills were
  (`docs/apm-behavior.md` → "Unobserved").
