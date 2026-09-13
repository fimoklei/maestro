# APM driver rules (project-specific for Maestro)

Imperatives for driving `apm` or parsing its lockfile/output — rules only.
The observed behavior behind every rule lives in `docs/apm-behavior.md`
(describes one apm version; check its header). The decisions live in ADRs:
0001 (never reimplement apm), 0003 (tag-pinned git refs), 0011 (global
targets = detected tools), 0013 (narrowed-install reconciliation), 0014
(GitHub-only origins), 0019 (departures from APM's model).

## Grounding

- Never guess apm behavior — read `docs/apm-behavior.md`, or measure it and
  record it there. If the installed apm version differs from that doc's
  header, run `docs/agents/apm-upgrade.md` before relying on either.
- Build fixtures from real captures, never retyped; every capture command is
  recorded in `tests/fixtures/README.md`. Capture an install fixture only
  when no `GitHub API rate limit hit` line appears — that line belongs to
  the capturing machine's spent anonymous quota, not to apm.
- Before departing from APM's model, read ADR-0019 — the accepted departures.
  A new departure is amended into it, never given its own ADR.

## Invocation

- `execFile` + args array, never a shell string (`security.md`).
- Always pass `-t` on install and update, as one comma list of tools.
  `uninstall` has no `-t` — see Remove.
- Deploy refs are tag-pinned
  `github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z` only (ADR-0021 §4,
  ADR-0014).
- Run global (`-g`) installs from a neutral cwd — apm edits the cwd's
  `.gitignore`.
- Hand every `-g` command a `realpath`ed `HOME`; a symlink component makes
  the install deploy nothing while reporting success (`LEARNINGS.md` ·
  symlinked-home-deploys-nothing).
- Keep real apm out of the fast test loop (`testing.md`); network + auth
  belong to the canary/integration lanes.

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
  already spares every other dependency, including one from the same
  repository.
- Read what is deployed from `deployed_files` plus the file's existence,
  never from `skill_subset` or `skills:`; both keep names apm has already
  dropped.
- Read the Selection back after every install. apm sorts `skills:`, so the
  written order is never the order you passed.
- Classify a Remove from files and the lockfile, never from the exit code or
  a marker: a blocked removal has already deleted the rest of the Selection.
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

- Success = the `Installed \d+ APM dependenc` marker or the
  `No changes -- install state already up to date` no-op marker, with no
  error phrases — never the exit code. Absent marker = failure, fail-closed.
- Classify auth-required only at `apm view`, only on the phrases
  `Authentication failed` / `No token available` (case-insensitive). Never
  echo matched output (`security.md`). The same phrases can appear in
  `install` output when the anonymous probe was throttled and no token is
  set; never classify them there.
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
- Never read `deployments[].target` as a tool name — it names the deploy
  root (`agents` for the shared `.agents/` copy).

## Update

- Never use `apm update` to move an exact tag pin — it is a no-op. Update =
  resolve the latest tag + re-install at that tag.
- Never same-ref install over a dirty subtree — apm silently resets local
  edits and drops untracked files, printing `(files unchanged)`. The deploy
  use-case's guards stay in front of every install.

## Remove

- Success = the `Uninstall complete: Removed \d+ package(s) from apm.yml`
  marker, never the exit code. Absent marker = failure, fail-closed. Keep
  the not-found signals beside it: they cost nothing and close 0.26.0's
  partial-success shape.
- Never parse the `Cleaned \d+ stale files` count — it counts what that run
  deleted.
- Name the package with the same tag-pinned ref the install used; a bare
  skill name is rejected.
- Never treat `--dry-run` as a blast-radius preview — it omits the deployed
  files it is about to delete.
- **Refuse a diverged deployed copy before the uninstall call**, as install
  and update do: apm keeps an edited or added file, aborts with exit 1, and
  has already deleted the rest of the copy by then. The recovery the notice
  names is `Deploy again`, which resets the copy, then remove. An
  unverifiable copy (no recorded hashes) still warns and goes on consent.
- Never narrow `targets:` in `apm.yml` to scope a removal — it scopes
  nothing: the cleanup deletes every tracked file whatever `targets:` says.
  Per-tool cleanup is the scoped `rm` behind `DeployedCleanupPort`
  (ADR-0013).
- Expect the lockfile to be deleted, not emptied, when the last dependency
  goes; an absent lockfile means nothing deployed, never an error.

## Danger

- Never run a bare `apm uninstall -g`; always name the package (ADR-0013).
- Never point a spike `-g` command at the real home; sandbox `HOME` always
  (`LEARNINGS.md` · spike-isolation).

## Unobserved

- Do not drive hook or MCP deploys until spiked the way skills were
  (`docs/apm-behavior.md` → "Unobserved").
