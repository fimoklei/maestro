# apm behavior — observed reference (Maestro)

How `apm` actually behaves, captured by running it or reading its source —
never guessed (the trap in `LEARNINGS.md`). This document describes **one apm
version: 0.29.0, verified 2026-09-04** (issues #772–#775). On an apm upgrade
it is re-verified and rewritten section by section per
`docs/agents/apm-upgrade.md` — sections are replaced, never appended to with
version deltas; `git log` on this file is the version history.

Two grades of evidence back these claims, and they re-verify differently:

- **Re-run as a command** — backed by a fixture in `tests/fixtures/` (every
  capture command is in its `README.md`) and/or a real-apm test lane.
- **Read against the apm source** — no command proves them; marked
  "(source)" inline. Re-read the named functions instead of re-running an
  install.

What Maestro *decided* about any of this lives in ADRs (0001, 0003, 0011,
0013, 0014), not here. The imperatives an agent must follow when driving apm
live in `.claude/rules/apm-driver.md`.

## Deploy — `apm install`

`apm install <REF> -t <tools>`, cwd = consuming repo, via `execFile` + args
array (`security.md`). apm auto-creates `apm.yml` + `apm.lock.yaml`,
materializes the skill into `.claude/skills/<name>/`, creates `apm_modules/`
and appends it to the cwd's `.gitignore`. No pre-init needed. Real git
installs need network (clone from GitHub ~3–4s; a failed partial clone
retries as a full bare clone) — keep real `apm` out of the fast test loop
(`testing.md`, canary lane only).

The first install in a consumer **persists `targets:` into `apm.yml`**
(`[i] Targets set: claude, codex (persisted to apm.yml)`). A later install
with a narrower `-t` leaves that list as it is — measured: `-g -t claude`
over a home created by `-g -t claude,codex` keeps `targets: [claude, codex]`
in `~/.apm/apm.yml`.

### Reference grammar

The Maestro form is `github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z` — a
tag-pinned virtual package (owner/repo taken from the local clone's `origin`
remote, subpath `.apm/skills`, ADR-0021 §4). Most captures below were taken
against the retired root `skills/` shape at a historic tag and are left as
observed. It yields `resolved_ref` + `resolved_commit` + `content_hash` in
the lockfile. The alternatives are unusable or forbidden:

| Form | Result |
|---|---|
| Local path | `source: local`, no version, invisible to drift. Forbidden (ADR-0003). |
| Git, unpinned | `resolved_commit` only; apm warns "unpinned — add #tag". Not used. |
| `https://….git/subpath` | fails ("not accessible"). |

The shorthand's trailing `skills/<name>` is read as a virtual package only
on hosts apm knows — `github.com` (2 path segments) and `dev.azure.com` (3).
On any other host the subpath silently becomes part of the repo name, with
no error to catch:

| Ref | `virtual_path` | `repo_url` |
|---|---|---|
| `github.com/o/r/skills/tdd#v1` | `skills/tdd` | `o/r` |
| `dev.azure.com/org/proj/repo/skills/tdd#v1` | `skills/tdd` | `org/proj/repo` |
| `gitlab.com/o/r/skills/tdd#v1` | **None** | `o/r/skills/tdd` |

Re-read on 0.29.0 (source, `models/dependency/reference.py`): the host gate is
unchanged. Two additions do not reach Maestro's form — a GitLab heuristic that
recognises `prompts/`, `instructions/`, `collections/` as a virtual root
(never `skills/`), and a parse-time rejection of a primitive directory
(`skills`, `agents`, …) embedded in an explicit `ssh://` / `https://` URL,
which the 0.26.0 table above already recorded as "cannot carry a subpath".
The apm.yml `git:` + `path:` escape hatch is still not reachable from the
CLI. Maestro's response — GitHub-only origins, refused at parse time — is
ADR-0014.

### Install signals

The deploy path must not trust the exit code:

1. **Auth fails at `apm view … versions`** (the latest-tag step), exit 1 —
   never at `install`. The output carries apm's two fixed phrases,
   `Authentication failed` and `No token available`; only these classify
   auth-required. Do not match the git passthrough line (on 0.29.0
   `fatal: unable to get password from user`; it was `could not read
   Username` on 0.26.0) or the env hints, and never echo the matched text
   (`security.md`). A nonexistent-but-authorized ref produces the same "all
   probes failed … verify the path and ref" text as a missing-auth install,
   so the install stage cannot distinguish auth from a typo'd ref — which is
   why auth is classified at `view`, where the signal is clean. Fixture:
   `apm-view-auth-failed.txt`.
2. **Success = a marker, not the exit code.** Success is `Installed \d+ APM
   dependenc` OR `No changes -- install state already up to date` present,
   AND no `with <n≥1> error(s)` AND no `Installation failed`. The second
   marker replaces the first when the ref is already installed and its files
   are unchanged — a re-deploy that did nothing prints `(updated ref in
   apm.yml)`, `[*] Updated apm.yml dependency entries`, `[+] … (cached)` /
   `|-- (files unchanged)` and never the install marker. Both observed
   failure modes (validation failure, symlink refusal) exit 1 with no marker;
   an absent marker is failure, fail-closed, regardless of exit code.
   Fixtures: `apm-install-ok.txt`, `apm-install-no-changes.txt`,
   `apm-install-probes-failed.txt`, `apm-install-symlink-refused.txt`.
3. **`is a symlink` = destination refusal**, and only when the *leaf* skill
   dir is a symlink — a directory-level symlink installs fine (measured in
   `docs/research/apm-0.25-symlink-topology-impact.md`). Match every phrase
   on whitespace-normalized, lowercased output: Rich wraps mid-sentence,
   `install` pins no `COLUMNS`, and the wrap point moves between versions
   (`LEARNINGS.md` · rich-wraps-phrases-mid-sentence).
4. **`-g` opens with a scope-support warning block** (`[!] User-scope
   primitives are fully supported by …` / `Some primitives are not
   supported: …`, now naming `grok-build` and `grok-cloud` among the fully
   supported); a per-repo install skips straight to `[*] Created apm.yml`.
   The block matches none of the signal phrases — inert for classification.
5. **A throttled pre-flight probe prints an `[i]` line and continues.**
   The validation step probes a public repo **anonymously** before spending
   the token (source, `install/validation.py`), so a machine whose
   unauthenticated GitHub quota is spent prints `[i] GitHub API rate limit
   hit while checking github.com; skipping the pre-flight accessibility
   probe …` on every install and lets the download step verify access. The
   line matches no signal phrase. With no token at all, the failure then
   surfaces at the download step and carries `Authentication failed` / `No
   token available` in the *install* output — the one case where those
   phrases appear outside `view`; the driver never classifies them there.
6. **`--trust-bin` / `--no-trust-bin` exist; nothing turns interactive.**
   No warning line appeared in any capture, because no skill under test
   carries a `bin/` payload — the warning is conditional on one
   ("Unobserved" below). Every capture ran non-TTY with no stdin and
   completed.
7. **An unknown `-t` token is an error, not a fallback** (source,
   `core/target_detection.py::resolve_targets` → `_validate_canonical_v2`
   raises `UnknownTargetError`).

## Lockfile — `apm.lock.yaml`

Top level: `lockfile_version`, `generated_at`, `apm_version`,
`dependencies: []`, `deployments: []`. A tag-pinned skill entry:

```yaml
- repo_url: fimoklei/agent-harness
  name: tdd                     # the skill name
  host: github.com
  resolved_commit: <40-hex>
  resolved_ref: v0.5.1          # the human version shown in deploy-state
  version: unknown              # deliberate, path-independent (apm PR #2217)
  virtual_path: skills/tdd
  is_virtual: true
  package_type: claude_skill    # only type observed; hooks/MCP unobserved
  deployed_files:               # the dir AND every materialized file
  - .claude/skills/tdd
  - .claude/skills/tdd/SKILL.md
  deployed_file_hashes:         # per-file sha256 of content
    .claude/skills/tdd/SKILL.md: sha256:<hex>
  content_hash: sha256:<hex>
deployments:                    # one row per deployed file per deploy root
- kind: project-relative
  target: claude                # the DEPLOY ROOT (claude / agents), not a tool
  value: .claude/skills/tdd/SKILL.md   # the deployed path
  runtime: null                 # null in every observed row
  scope: project                # reads "project" even for -g — see below
  owners:
  - fimoklei/agent-harness/skills/tdd
  active_owner: fimoklei/agent-harness/skills/tdd
  content_hash: sha256:<hex>
```

- Deploy-state reads `resolved_ref` (version), `virtual_path` (identity +
  name), `package_type` (primitive type) — nothing else. Its Zod schema
  ignores unknown keys, so additive shape changes are inert for the reader.
- **No new key for a skill install between 0.26.0 and 0.29.0.** The four
  lockfile fixtures re-captured on 0.29.0 carry the same key set as their
  0.26.0 captures (diffed 2026-09-04). apm's entry model (source,
  `deps/lockfile.py::LockedDependency`) declares optional fields a skill
  install leaves absent — `host_type`, `port`, `registry_prefix`,
  `resolved_tag`, `skill_subset`, marketplace provenance — all inert for the
  reader. Maestro's parse needs no change.
- The reader filters `package_type === "claude_skill"`; a two-tool entry
  holds multiple `deployed_files`, so a skill is surfaced once per entry,
  not once per file.
- **Four `package_type` values have been measured for a skill install**, all
  under the install command's success marker and exit 0 (2026-07-27/28,
  `docs/research/354-marketplace-as-release-gate.md`, `.../379-does-p3-exist.md`):
  `claude_skill` (a plain skill), `hybrid` (the subpath also holds an
  `apm.yml`), `marketplace_plugin` (it holds a `.claude-plugin/plugin.json`),
  and `invalid` (no `SKILL.md` — nothing is deployed and `deployments` is
  empty). Only the first is manageable as a skill. Re-measured on 0.29.0 for
  `claude_skill` only.
- `deployed_file_hashes` is a plain per-file sha256 of content — identical
  across the `.claude`/`.agents` copies, reproducible.
- `content_hash` is apm-internal and did not reproduce (eight hashing
  schemes tried, no match) — opaque, never recompute.
- **In `deployments[]`, `target` names the deploy root, not the tool.** A
  `-t claude,codex` install writes `target: claude` for the `.claude/…` rows
  and `target: agents` for the `.agents/…` rows (0.26.0 wrote `codex` there).
  `value` is the deployed path; `runtime` was `null` in every observed row.
  `target` therefore no longer says which tool asked for the shared copy —
  the per-tool grouping rework (#172) cannot read it as a tool name.
- **`scope` reads `project` even for a `-g` install.** A single-tool global
  and a single-tool per-repo install produce identical payloads
  (`apm.lock.global-single-tool.yaml` vs `apm.lock.tag-pinned-v0.5.1.yaml`,
  modulo `generated_at` and a fixture comment header) — scope is known only
  from *which* lockfile you read (`~/.apm/apm.lock.yaml` vs the repo's),
  never from a field inside it.
- A two-tool install (`-t claude,codex`) writes **one** entry with deployed
  files under both `.claude/skills/<name>` and `.agents/skills/<name>` —
  codex uses the cross-client agent-skills dir; there is no `.codex/skills`.
- **`.agents/skills/` has ten readers per repo and six per home; `.claude/skills/`
  has one (source).** Read from `apm_cli/integration/targets.py` in 0.29.0:
  at project scope each target's skills primitive either overrides
  `deploy_root` to `.agents` — `copilot`, `cursor`, `opencode`, `gemini`,
  `codex`, `windsurf` — or inherits a `root_dir` of `.agents` —
  `antigravity`, `agent-skills`, `openclaw`, `hermes`. `claude` (`.claude`),
  `kiro` (`.kiro`) and the two new targets `grok-build` / `grok-cloud`
  (`.grok`) deploy skills elsewhere, so the catalog additions did not move
  the count. At **user scope** `for_scope` swaps `root_dir` for
  `user_root_dir`, which moves four readers off `~/.agents/skills/`:
  `antigravity` → `~/.gemini/antigravity-cli/skills`, `openclaw` →
  `~/.openclaw/skills`, `hermes` → `~/.hermes/skills`, and `opencode` (a
  `user_primitive_overrides` entry) → `~/.config/opencode/skills`. The six
  that remain — `copilot`, `cursor`, `gemini`, `codex`, `windsurf`,
  `agent-skills` — keep the asymmetry ADR-0011's #202 amendment encodes:
  reconciliation may reclaim `.claude`, never `.agents`.
- **`claude` honours `CLAUDE_CONFIG_DIR` at user scope (source,
  `for_scope`).** With it set, `-g` deploys under that directory instead of
  `~/.claude` and records the path home-relative (or absolute, outside
  `$HOME`). Maestro reads `~/.claude/skills/` unconditionally and has not
  measured this case ("Unobserved" below).

## Drift — `apm outdated`

No `--json` (`-v` lists available tags, `-j` sets the parallel-check count).
The output is a human Rich table; the parser sits behind the driver port,
integration-tested against captured output. Rich truncates the Package
column to terminal width — capture and parse non-TTY with `COLUMNS=200`
(`WIDE_COLUMNS` in `apm-cli-driver.ts`, the width production sets); never
key the parser on the full package name surviving. Observed states, table
shape unchanged since 0.26.0:

- Tag-pinned, newer tag exists → row `Current v0.5.0 | Latest v0.6.0 |
  Status outdated | Source git tags`.
- Local-path dep → `No remote dependencies to check` (drift impossible —
  ADR-0003's reason to forbid local paths).
- Git unpinned → `All dependencies are up-to-date` (tracks the branch, not
  tags).
- Tag-pinned, remote unreachable (no auth/network) → a row with `Latest -`,
  `Status unknown`, an **empty Source cell**, summary `[i] Some dependencies
  could not be checked (branch/commit refs)`, **exit 0**. Fixture:
  `apm-outdated-could-not-check.txt`. Parse rows with empty cells intact or
  Status shifts a column left. The parser reports `{ ok:false, reason:
  "unverified" }` and runs before row parsing, so a mix of outdated +
  uncheckable never collapses to a false up-to-date (J04). The cockpit shows
  `unverified` distinct from a bare `unknown` (a crashed/unreadable check),
  so it points at auth/network rather than a generic failure.

Maestro consumes this as **behind / up-to-date / unverified**. A cockpit
"unknown" that a manual `apm outdated` in the same repo contradicts is an
auth-context difference between shells, not a timing or parse bug
(`LEARNINGS.md` · outdated-auth). `apm outdated -g` prints the same table
scoped to user deps.

## Latest tag — `apm view`

`apm view <owner>/<repo> versions` queries the remote (network + auth for a
private repo) and prints every tag and branch with its short commit — no
`--json`, a Rich table that mixes branches in. Maestro keeps only `tag` rows
shaped `vX.Y.Z` and semver-sorts them itself: apm's row order is not
contractual, and lexicographic sort gets `v0.10.0 > v0.9.0` wrong. The query
is repo-level — it lists the repo's tags, not those whose tree contains
`.apm/skills/<name>`. Fixture: `apm-view-versions.txt`.

**Canary:** `apm view fimoklei/agent-harness versions` returning the tag
table is the real-apm canary. Without network + auth it fails loudly instead
of resolving a tag — the intended stop-and-report, never a silent wrong
answer.

## Update — re-install, not `apm update`

`apm update` does not move an exact tag pin — its semantics are "refresh to
the latest *matching* ref", and an exact tag's only matching ref is itself.
On a `#v0.5.0` dep with `v0.5.1` available it prints `[+] All dependencies
already at their latest matching refs.` and changes nothing. Fixture:
`apm-update-noop.txt`.

What bumps a pin: `apm install <ref>#<latest-tag> -t …`. It rewrites the
`apm.yml` dep and the lockfile (`resolved_ref` + `resolved_commit`), after
which `apm outdated` reads up-to-date. Maestro's update = resolve the latest
tag (`apm view`) + install at that tag; no other apm command is involved.

- `-t` is mandatory: a bare `install`/`update` with both harnesses present
  in the project cwd fails `Multiple harnesses detected: claude, codex`.
  `-t` takes one comma list; repeating the flag is unsupported (last wins).
- A same-tag re-install prints `(files unchanged)` — but only a clean
  subtree makes that true. Measured on 0.29.0 with one deployed file edited,
  and again with an untracked file added beside the deployed ones: both runs
  print `(cached)` / `(files unchanged)` and the no-op marker, and both
  leave the subtree reset to the tag — the edit and the extra file are gone,
  with no line saying so. The uninstall protection below does **not** apply
  to install.

## Remove — `apm uninstall`

`apm uninstall <PACKAGES>… [--dry-run] [-v] [-g]`. Per-dependency removal is
scoped: it deletes the named package's deployed files, its `apm.yml` entry,
its `apm_modules/` subtree, and its lockfile entry — and nothing else. Other
dependencies and hand-placed skill dirs beside them survive, per-repo and
global alike. No network and no credentials: every capture below ran with no
token in the environment.

There is **no `-t` flag** (`--dry-run`, `-v`, `-g` are the whole surface).
Removal spans every tool the package was deployed to.

### Argument grammar

`PACKAGES` is the same ref grammar as install, tag optional — the tag is
ignored for matching. `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z`,
the host-less `<owner>/<repo>/skills/<name>`, and the ref without its tag all
match the same `apm.yml` entry. A bare skill name does not: `apm uninstall
tdd` prints `[x] Invalid package format: tdd` and removes nothing.

### Order of operations (source, `commands/uninstall/cli.py`)

Selection first, then deployed files, then `apm.yml`, `apm_modules/`, the
lockfile. Two consequences: a selection failure changes nothing, and a
deployed-file failure has already deleted whatever it could before it
stops.

### Uninstall signals

Exit codes now carry meaning — success 0, every abort below 1 — but the
driver still classifies on markers, because a marker is what proves the
lockfile entry went.

1. **Success = `Uninstall complete: Removed \d+ package(s) from apm.yml`.**
   Absent marker is failure, fail-closed. Fixtures: `apm-uninstall-ok.txt`,
   `apm-uninstall-global-ok.txt`. Success output names the package without
   its `#vX.Y.Z` suffix and reports `[i] Cleaned N stale files from <pkg>`;
   0.26.0's `Cleaned up N integrated skills` / `Removed N deployed skills
   file(s)` lines are gone.
2. **Selection is all-or-nothing.** A package that is not in `apm.yml`
   prints `[x] <ref> was not found in apm.yml. Run 'apm deps list' …` and
   `[x] Uninstall aborted: N requested package(s) could not be selected.
   Resolve the errors above and retry; no changes were made.`, exit 1. With
   several packages named, one absent package aborts the whole run before
   anything is touched — measured with one installed and one absent package:
   both stayed. 0.26.0's partial-success shape (success marker plus `[!]
   Note: N package(s) were not found`) can no longer occur; the driver's
   not-found signals stay as a fail-closed guard. Fixture:
   `apm-uninstall-not-found.txt`.
3. **An edited or added file aborts the removal — after deleting the
   rest.** With one deployed file edited locally:

   ```
   Retained user-edited file .claude/skills/tdd/SKILL.md from <pkg>; resolve it and retry.
   [i] Cleaned 12 stale files from <pkg>
   [x] Uninstall could not remove tracked target files; package state was preserved.
   [x]   - .claude/skills/tdd
   [x]   - .claude/skills/tdd/SKILL.md
   [x] Resolve or remove the listed files, then retry uninstall.
   ```

   Exit 1, no success marker. `apm.yml`, the lockfile entry and
   `apm_modules/` keep the package; on disk only the edited file survives —
   the other files across both tool directories are already gone. An
   **untracked file** added inside the deployed directory does the same
   (retained: the directory), and a **missing** deployed file does not:
   apm counts it among the stale files and completes. Deleting the retained
   file and running the same uninstall again completes cleanly. Fixture:
   `apm-uninstall-retained.txt`. Maestro's removal guard refuses a diverged
   copy in front of this (`apm-driver.md` § Remove, #775).
4. **The `Cleaned N stale files` count is what it deleted this run**, so it
   moves with the state it found (14 for a clean two-tool copy, 12 with one
   file retained). Never parse it.
5. Match every phrase whitespace-normalized and lowercased — the output is
   Rich-rendered like install's (`LEARNINGS.md` ·
   rich-wraps-phrases-mid-sentence).

### What it does not tell you

- **`--dry-run` understates the blast radius.** It previews only the
  `apm.yml` and `apm_modules/` removals — never the deployed files it is
  about to delete, even with `-v`. Fixture: `apm-uninstall-dry-run.txt`.
- **The lockfile is deleted, not emptied, when the last dependency goes.**
  `apm.lock.yaml` disappears rather than being rewritten with `dependencies:
  []`; `apm.yml` keeps `apm: []`. A reader must treat an absent lockfile as
  nothing deployed, never as an error.

### Narrowed `targets:` no longer scopes anything

On 0.26.0, editing `apm.yml`'s `targets:` down to `claude` before an
uninstall deleted only the `.claude` copy and orphaned `.agents`. On 0.29.0
the cleanup removes every file the lockfile entry owns regardless of
`targets:` — measured per-repo: `targets: [claude]` over a `-t claude,codex`
install deleted `.claude/skills/<name>` and `.agents/skills/<name>` alike
and dropped the entry. So `targets:` is neither an orphaning trap nor a
per-tool remove lever; per-tool cleanup stays the scoped `rm` behind
`DeployedCleanupPort` (ADR-0013). Global not re-measured (same code path).

## Skill body budget — stated in the docs, checked nowhere

apm's producer guide ("Author a skill", read 2026-07-28) says *"Keep
`SKILL.md` under **500 lines and 5000 tokens**"* and disclaims it in the next
sentence: *"This is the agent-skills convention, not an APM check."* Matching
the code on 0.29.0: `grep -rn "5000"` and
`grep -rniE "max_lines|token_budget|max_tokens|line_limit"` over `apm_cli`
each find nothing. No source names a tokenizer, so the token half is
uncheckable offline — measurements and the reasoning are in
`docs/research/356-skill-md-token-budget.md`.

## Content drift — apm detects it only on uninstall

`apm outdated` reports version drift only. Edits to deployed files are
invisible to `install`, which silently remediates them (above). Only
`uninstall` compares deployed files against `deployed_file_hashes`, and it
uses the answer to *retain* the edited file, not to report it (§ Remove).
Maestro's own detection:

- **Destination drift:** compare `deployed_file_hashes` against a live
  sha256 of each deployed file — a mismatch, a missing file, or a live file
  with no entry means diverged (`deployed-diverged-from-lock`). A copy with
  no recorded hashes at all cannot be verified and is refused as its own
  state, `deployed-unverifiable` — a copy predating content tracking, with a
  known false-positive mode (`LEARNINGS.md` ·
  stale-sandbox-false-unverifiable). Verified end-to-end per-repo (#56) and
  global (#61): the global lockfile (`~/.apm/apm.lock.yaml`) keys its hashes
  HOME-relative, the same form as per-repo, so the identical compare applies
  with deployed root = `HOME`.
- **Source drift:** tree-diff the local `.apm/skills/<name>` subtree against the
  freshly resolved **latest** tag (`local-diverged-from-tag`, via
  `InventoryGitAdapter`) — never recompute `content_hash`.

## Global scope — `-g`

`-g` derives everything from `Path.home()` — metadata (`~/.apm/` holding
`apm.yml`, `apm.lock.yaml`, `apm_modules/`) and deployed primitives — with
no env override (source: `core/scope.py`, re-read on 0.29.0). A missing
global lockfile means nothing deployed (empty, not an error). A global
install still appends `apm_modules/` to the **cwd's** `.gitignore` — run
global deploys from a neutral cwd.

- **A symlink component in `HOME` makes a global install deploy nothing.**
  apm reports success, creates the skill directories and copies no files
  into them; the lockfile carries no `deployed_file_hashes`. Cause and
  trigger in `docs/research/772-apm-0.29.0-findings.md` § F1; a standard
  `/Users/<name>` home is not affected, a sandbox under `/tmp` or
  `tmpdir()` is. Every test sandbox `realpath`s its home (`LEARNINGS.md` ·
  symlinked-home-deploys-nothing). Not filed upstream.
- **`-t` is honoured literally; apm never checks tool presence** (source:
  `core/target_detection.py::resolve_targets` takes `-t` as Priority 1 and
  returns those tokens verbatim after validating each is a known target
  name; the filesystem scan runs only when `-t` and `apm.yml` targets are
  both absent). `-t claude,codex` on a machine without Codex writes both
  subtrees, exit 0, no warning.
- **No apm command lists globally-installed tools.** `apm targets --json` is
  project-scoped — it scans the cwd for markers; in a repo holding only
  `.claude/` it lists nine rows (`grok-build` joined the eight of 0.26.0;
  `grok-cloud` is not a project target). Fixture: `apm-targets-claude.json`.
  A bare `apm install <ref> -g` with no `-t` falls back to the cross-client
  `agent-skills` target: measured on 0.29.0 it wrote `~/.agents/skills/<name>`
  only, no `~/.claude`, and left `~/.copilot`, `~/.cache` and `~/Library`
  behind off-lockfile. apm's auto-detect reads the project cwd, never
  `Path.home()` — also why `Multiple harnesses detected` fires only on a
  project cwd, never on a global install. Whoever drives apm must detect
  tool presence itself — Maestro's answer is ADR-0011. The durable markers
  are the config files (`~/.claude.json`, `~/.codex/config.toml`), which a
  deploy never creates; the directories (`~/.claude/`, `~/.codex/`,
  `~/.agents/`) can all be created *by* a deploy and would read a past
  deploy back as "tool installed".
- **Ghost entries survive a narrowing `-t` (source + command).** `apm
  install -g -t claude` over a lockfile written by `-t claude,codex` keeps
  the `.agents` `deployed_file_hashes` and leaves the `.agents/skills/<name>`
  files on disk — re-measured on 0.29.0 (all six `.agents` files and their
  hashes survived). Source, re-read on 0.29.0: `install/phases/targets.py::
  _read_yaml_targets` sources the declared target universe from the
  consumer's `apm.yml` alone; `declared_target_profiles` returns `None`
  when it names nothing, and `core/deployment_state.py::_is_stale` then
  short-circuits to preserve-all (it also requires
  `intent.authoritative_targets`, false on the uninstall path). Pruning
  fires on the install's own active targets or on a row for a known target
  the manifest does not declare — never on `-t`. Because the first install
  persists `targets:` and a narrower `-t` does not rewrite it, the declared
  universe stays wide. Maestro's reconciliation is ADR-0013, and since #202
  it reclaims only a single-reader directory: the `.agents` ghost files
  above are left on disk deliberately.
- **The 2026-07-17 mass-deletion cannot recur on 0.29.0.** A bare `apm
  uninstall -g` — the command that wiped 19 pre-existing skill dirs from a
  real `~/.claude/skills/` while the global lockfile read `dependencies:
  []` — is rejected by the argument parser (`Error: Missing argument
  'PACKAGES...'`, exit 2, nothing touched; 0.26.0 measurement, parser
  unchanged in the 0.29.0 `--help` surface). A *named* `-g` uninstall
  removes only its own package (§ Remove; `apm-uninstall-global-ok.txt`,
  re-captured beside an unrelated skill that survived). The apm version
  behind the incident was not recorded. The rule stands regardless: never
  point a spike `-g` command at the real home (`LEARNINGS.md` ·
  spike-isolation). Test lane: sandbox `HOME`, auth via
  `GITHUB_TOKEN`/`GITHUB_APM_PAT` from `gh auth token`.

## Producer — authoring, tagging, and `compile`

Facts the authoring-side wayfinder map (issue #343) rests on. Captured
against apm 0.26.0 and re-checked on 0.29.0 as noted per bullet.

- **apm scaffolds `apm.yml` and nothing else.** `apm init -y` writes one
  file — no `README.md`, no `.apm/`, no `.gitkeep` (re-run on 0.29.0).
  `plugin.json` comes only from `apm plugin init`, the plugin-author
  workflow whose next step is `apm pack`, so it has no place in a Harness
  consumed per skill by tag-pinned ref. `README.md` is read, never written:
  the registry publish archive bundles root docs when present. →
  `docs/research/552-empty-repo-and-scaffold-shape.md`
- **apm never creates a git tag.** Tagging is the human's act; the release
  gates apm offers are `apm pack --check-versions` and `--check-clean`, both
  reading local `apm.yml`/artifact state, never git (source,
  `marketplace/version_check.py`: "No git, no network", re-read on 0.29.0). →
  `docs/research/354-marketplace-as-release-gate.md`
- **`apm compile --validate` cannot fail on a skill content defect.**
  `validate_primitives` routes every primitive and link error into a
  warnings list that `_run_validation_mode` never prints; the
  `All primitives validated successfully!` marker fires over a file that
  failed to parse (source, `compilation/agents_compiler.py`, re-read on
  0.29.0: `errors = []` still returned empty). Exit 1 only for a missing
  `apm.yml`, no APM content, or a discovery exception. "No APM content"
  includes the canonical Harness — a skill at `.apm/skills/<name>/SKILL.md`
  exits 1 exactly like an empty repo (0.26.0 measurement). →
  `docs/research/346-apm-proof-owner.md`,
  `docs/research/552-empty-repo-and-scaffold-shape.md`
- **Plain `apm compile` overwrites a hand-authored root context file.**
  `--target codex` rewrites `AGENTS.md`; `--target claude` rewrites
  `CLAUDE.md`; both replace existing content with a generated build. Only
  `--validate` and `--dry-run` are safe in a repo whose `AGENTS.md`/`CLAUDE.md`
  are owned (source, `commands/compile/cli.py`, re-read on 0.29.0). →
  `docs/research/346-apm-proof-owner.md`
- **A ref's subpath is literal, with no discovery fallback**, and is baked
  into an immutable tag — a renamed or moved skill breaks every pin to its
  old subpath. The break is **loud**: `Failed to download dependency
  <owner>/<repo>: Subdirectory '<path>' not found in repository`, then
  `Installation failed with 1 error(s)`, exit 1, and `Removed apm.yml created
  by the failed install` — a clean rollback, no partial state (0.26.0
  measurement; the 0.29.0 captures install root `skills/` at v0.5.x and
  `.apm/skills/` at v0.6.0 by naming each shape literally). Distinct from
  the silent `package_type: invalid` case, which needs the directory to
  exist without a `SKILL.md`. → `docs/research/344-repo-shape.md`
- **The 500-line / 5000-token `SKILL.md` rule is agentskills.io's convention,
  not apm's.** No such constant in the 0.29.0 code; `core` enforces the
  500-line proxy only, the token half is uncheckable offline. →
  `docs/research/356-skill-md-token-budget.md` (full detail already at
  "Skill body budget" above)

## Unobserved — spike before relying

- Hook and MCP deploys (`apm mcp` is a separate command surface). No
  `package_type` other than the four above has been observed.
- Custom ports in git refs after apm PRs #2210/#2211 (see Reference
  grammar).
- The `--trust-bin` warning and whether it prompts: no skill under test
  carries a `bin/` payload.
- `CLAUDE_CONFIG_DIR` at user scope: read from source only; Maestro's
  global reader assumes `~/.claude/skills/`.
- Uninstall over a copy with no `deployed_file_hashes` (a pre-tracking
  lockfile): whether apm retains or deletes an edited file there.
