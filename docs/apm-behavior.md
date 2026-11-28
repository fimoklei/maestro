# apm behavior — observed reference (Maestro)

How `apm` actually behaves, captured by running it or reading its source —
never guessed (the trap in `LEARNINGS.md`). This document describes **one apm
version: 0.39.1, verified 2026-11-27** (#1991; issues #772–#775 for the method).
Maestro supports apm 0.39.1 and later.
On an apm upgrade it is re-verified and rewritten section by section per
`docs/agents/apm-upgrade.md` — sections are replaced, never appended to with
version deltas; `git log` on this file is the version history.

0.39.1 re-run: the real-apm canaries, the integration suite and every fixture
captured by a single command, plus hand measurements in a sandbox `HOME`
for the claims no fixture holds, and a diff of the source-read functions
against 0.38.1. The sections that rest on the retired `apm-spike-833`
repository (mid-install failure) were **not** re-run byte for byte; the
root-package canary covers their contracts on 0.39.1, and their measurements
still read as 0.29.0's.

Two grades of evidence back these claims, and they re-verify differently:

- **Re-run as a command** — backed by a fixture in `tests/fixtures/` (every
  capture command is in its `README.md`) and/or a real-apm test lane.
- **Read against the apm source** — no command proves them; marked
  "(source)" inline. Re-read the named functions instead of re-running an
  install.

What Maestro *decided* about any of this lives in ADRs (0001, 0003, 0011,
0013, 0014), not here. The imperatives an agent must follow when driving apm
live in `.claude/rules/apm-driver.md`. Which Harness repository to measure
against: `docs/agents/codebase-map.md`.

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
   never at `install`. The message goes to **stderr**, stdout stays empty.
   It carries apm's two fixed phrases, `Authentication failed` and `No token
   available`; only these classify auth-required. git's own passthrough line
   on 0.38.1 (`fatal: Authentication failed for '<url>'`) carries the first
   phrase too, so it classifies the same way; never match the env hints, and
   never echo the matched text (`security.md`). A nonexistent-but-authorized
   ref produces the same "all probes failed … verify the path and ref" text as
   a missing-auth install, so the install stage cannot distinguish auth from a
   typo'd ref — which is why auth is classified at `view`, where the signal
   is clean. Fixture: `apm-view-auth-failed.txt` (stderr).
2. **Success = a summary line, not the exit code.** The install summary
   (source, `core/command_logger.py`) ends a run with exactly one of:
   `Installed <n> APM dependenc…`, `Cleaned <n> stale file(s)` (a narrowing
   that installed nothing new), `Updated apm.lock.yaml`, `Updated local
   content`, `Removed <n> stale MCP server(s)`, or `No changes -- install
   state already up to date`. A failed run ends with `Installation failed …`
   or `Install failed after <t>s.`; an `Installed …` line can still carry
   ` with <n> error(s)` or `; some requested packages were skipped`
   (source). Every observed failure exits 1 or prints no success line; an
   absent success line is failure, fail-closed, regardless of exit code. A
   same-ref re-deploy prints `(already in apm.yml)`, `[+] … (cached)`,
   `|-- (files unchanged)` and the `No changes` line. Fixtures:
   `apm-install-ok.txt`, `apm-install-no-changes.txt`,
   `apm-install-narrowed.txt`, `apm-install-probes-failed.txt`,
   `apm-install-symlink-refused.txt`.
3. **`Unsafe skill destination '<path>'; refusing deployment.` = a linked
   destination.** Measured 2026-11-25 and again on 0.39.1 (2026-11-27) for a
   leaf symlink (`.claude/skills/<name>` → a real folder) and a
   directory-level symlink (`.claude/skills` → a real folder), per subpath
   ref and per global root package: the install writes nothing and prints
   `Install failed after <t>s.`. For the directory-level link the quoted
   path is the link's target (`real-skills/tdd/SKILL.md`), not
   `.claude/skills`. A directory-level symlink is **no longer** a working
   layout.
   Two other linked shapes crash instead, with `Cannot translate
   PosixPath(…) to a lockfile path: path is outside the project tree … This
   is a bug -- please report it.`: a **dangling** leaf symlink, and a leaf
   symlink under a **per-repo root package**. Neither names the link; the
   driver reads them as a plain failure. Match every phrase on
   whitespace-normalized, lowercased output: Rich wraps mid-sentence and the
   wrap point moves between versions (`LEARNINGS.md` ·
   rich-wraps-phrases-mid-sentence).
4. **`-g` opens with `[i] Installing to user scope (<home>/.apm/)`**, the
   home written out in full, and no scope-support warning block.
   `[i] Skipped inactive experimental resolver for target '…'` lines may
   follow the deployed-file rows, and a per-repo uninstall outside a git
   remote prints `[!] Org policy not applied (outcome=no_git_remote, …)`.
   All match none of the signal phrases — inert for classification.
5. **A throttled pre-flight probe prints an `[i]` line and continues.**
   The validation step probes a public repo **anonymously** before spending
   the token (source, `install/validation.py`), so an IP address whose
   unauthenticated GitHub quota is spent prints `[i] GitHub API rate limit
   hit while checking github.com; skipping the pre-flight accessibility
   probe …` on every default install and lets the download step verify
   access. The line matches no signal phrase. With no token at all, the failure then
   surfaces at the download step and carries `Authentication failed` / `No
   token available` in the *install* output — the one case where those
   phrases appear outside `view`; the driver never classifies them there.
   Measured 2026-11-27, sandbox `HOME`, token set, the anonymous quota read
   before and after each run: one default install of `skills/tdd#v0.5.0`
   spends **2** anonymous calls; the same install with
   `APM_GITHUB_AUTH_FIRST=1` spends **0** and adds one line,
   `[!] github-auth-first is enabled: git credentials will be forwarded on
   the first HTTPS attempt to github.com. …`. Each twice, same result. One
   run of `scripts/capture-apm-fixtures.mjs`, setup auth-first and captured
   commands default, spends **20**.
6. **`--trust-bin` / `--no-trust-bin` exist; nothing turns interactive.**
   No warning line appeared in any capture, because no skill under test
   carries a `bin/` payload — the warning is conditional on one
   ("Unobserved" below). Every capture ran non-TTY with no stdin and
   completed.
7. **An unknown `-t` token is an error, not a fallback** (source,
   `core/target_detection.py::_validate_canonical_v2` raises
   `UnknownTargetError`).

### Root package and its Selection

Installing a repository *root* (`github.com/<owner>/<repo>#vX.Y.Z`, no
subpath) creates **one** dependency whose skills are chosen with `--skill
<name>`, repeated once per name. Measured 2026-09-12 against
`github.com/fimoklei/agent-harness#v0.6.0`, per repo and at `-g -t
claude,codex`; `tests/integration/apm-root-package-canary.test.ts` re-runs the
whole sequence (issue #957). Captures: `apm-957-*.txt`,
`apm.lock.957-root-selection-project.yaml`,
`apm.yml.957-narrowed-with-foreign.yaml`.

- The first install persists the Selection into `apm.yml` under the one
  `git:` entry as `skills:` — **sorted**, not in the order passed — and into
  the lockfile as `skill_subset`. The entry carries `package_type:
  apm_package`, and `deployed_files` lists the selected skills only.
- **Narrowing takes two steps:** write the shorter list to `skills:`, then
  install the same names as `--skill` flags (a `--skill` list alone unions
  with the persisted one, § Deploy / #929). The install lists each removed
  folder under `[i] Cleaned <n> stale deployed path(s) for <pkg>:` and ends
  with `Cleaned <n> stale file(s)` instead of the install marker; the
  dropped skill leaves disk, `deployed_files` and `skill_subset` in every
  tool root the package wrote. Fixture: `apm-install-narrowed.txt`.
- **`skills: []` is refused, not empty.** The manifest fails to parse before
  anything is touched: `Invalid APM dependency …: skills: must contain at
  least one name; remove the field to install all skills in the bundle.`,
  exit 1, no marker, files and lockfile unchanged; the CLI-ref path adds
  `apm.yml restored to its previous state`. Dropping the field instead
  installs the **whole** bundle (36 skills at that tag) and leaves no
  `skill_subset` in the lockfile. An empty Selection therefore has no
  expression: the last removal is an `apm uninstall` of the package.
- **A subpath package from the same repository is refused beside the root.**
  Installing `…/.apm/skills/tdd#v0.6.0` over the root package of the same
  repository exits 1 with `<repo> and its subdirectory package <repo>/<path>
  cannot both be declared in apm.yml … Keep only one of them.`, restores
  `apm.yml` and leaves the lockfile unchanged. A manifest that already
  holds both (a legacy per-skill entry beside the root) makes every install
  over it fail the same way: a bare `apm install -t claude` over such a
  manifest exits 1 with the same line (re-measured on 0.39.1, 2026-11-27).
- **A named uninstall of the root package is scoped.** Measured with a second
  dependency from *another* repository (`microsoft/apm-sample-package#v1.0.0`)
  and a hand-placed `.claude/skills/handmade/` beside it: the Harness entry,
  its files and its `apm_modules/` subtree go; the other dependency and the
  hand-placed directory stay — in `apm.yml`, in the lockfile and on disk, per
  repo and at `-g`. The lockfile is rewritten while another dependency
  remains; it is deleted only with the last one (§ Remove).
- **An edited copy refuses the removal before anything is deleted.** With one
  deployed file edited locally the uninstall exits 1 with no success marker;
  every file, `apm.yml` and the lockfile stay as they were (§ Remove).

### A batch install

One install carrying every staged name. Measured 2026-09-22 per repo against
`github.com/fimoklei/agent-harness#v0.6.0` for a bulk deploy (issue #1039)
and re-measured on 0.39.1 (2026-11-27). Fixtures:
`apm-install-unknown-skill.txt`, `apm-install-unmanaged-conflict.txt`.

- **One failing name fails the whole install.** A `--skill` name the package
  does not carry: exit 1, no success line, `--skill did not match skills in
  '<repo>'. Requested: <name>. Available: …` and `Installation failed with 1
  error(s) … No install transaction changes were committed.` Nothing reaches
  disk or the lockfile, and a first install removes the `apm.yml` it created.
- **A hand-made folder with a selected name refuses the whole install.** With
  `.claude/skills/<name>/SKILL.md` present and not owned by apm, the install
  exits 1 with `Installation refused: skill '<name>' from '<repo>' … conflicts
  with unmanaged file '.claude/skills/<name>/SKILL.md'.` and writes nothing.
- **A symlinked leaf fails the whole install** (§ Install signals, item 3).
  Maestro refuses a linked destination before the install.

## Lockfile — `apm.lock.yaml`

Top level: `lockfile_version` (`'4'`), `apm_version`, `manifest_targets`
(the `targets:` list of `apm.yml`), `dependencies: []`, `deployments: []`.
A tag-pinned skill entry:

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
  scope: project                # "user" for -g — see below
  owners:
  - fimoklei/agent-harness/skills/tdd
  active_owner: fimoklei/agent-harness/skills/tdd
  content_hash: sha256:<hex>
```

- Deploy-state reads `resolved_ref` (version), `virtual_path` (identity +
  name), `package_type` (primitive type) — nothing else. Its Zod schema
  ignores unknown keys, so additive shape changes are inert for the reader.
- **apm writes `lockfile_version: '4'` and adds `manifest_targets`**;
  `generated_at` stays absent (diffed against
  `apm.lock.tag-pinned-v0.5.1.yaml` and
  `apm.lock.global-claude-config-dir-inside-home.yaml`, 2026-11-25). The
  first install over an older lockfile prints `[i] Upgraded
  apm.lock.yaml to lockfile_version "4" (hash framing hardening); every
  package content_hash changes once.` and, with nothing else to do, ends
  with `Updated apm.lock.yaml` (on 0.39.1 over a 0.29.0 lockfile,
  2026-11-27). An uninstall reads an old lockfile directly. The parser reads
  none of these keys.
- **An edited copy under a version-1 lockfile fails the whole install.**
  Measured on 0.39.1 (2026-11-27), global root package installed with 0.29.0
  and with 0.32.0, one `SKILL.md` edited, then an install at a newer tag:
  exit 1, one `Skipped <file>: no trustworthy local deployment baseline.
  Move the conflicting file aside and retry. …` line per file of the
  skill, edited or not, and `Installation failed with <n> error(s) … No
  install transaction changes were committed.` `apm.yml` is restored and
  the edit stays. Without the edit the same install passes and upgrades the
  lockfile.
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
- **`scope` reads `user` for a `-g` install**; a lockfile last written by an
  older apm says `project` for both. Scope is known only from *which* lockfile you read
  (`~/.apm/apm.lock.yaml` vs the repo's), never from a field inside it.
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
  `agent-skills` — still read `.agents`, so reconciliation never reclaims it.
  Since ADR-0011's #1557 amendment it never reclaims `.claude` either:
  Cursor, OpenCode and Devin Desktop read that folder too.
- **`claude` honours `CLAUDE_CONFIG_DIR` at user scope (measured 2026-11-11,
  #1796; re-measured inside `HOME` on 0.38.1, 2026-11-25, outside `HOME`
  not re-run).** With it set, `-g` writes `$CLAUDE_CONFIG_DIR/skills/<name>`, not
  `~/.claude/skills`. apm trims the value (blank = unset), expands `~`,
  resolves a relative value against its cwd and resolves symlinks on both the
  value and `$HOME`. `deployed_files` and `deployed_file_hashes` record the
  folder home-relative inside `$HOME` (`.claude-work/skills/tdd/SKILL.md`)
  and absolute outside it (`/Volumes/work/claude/skills/tdd/SKILL.md`); long
  absolute hash keys use YAML's `? ` key form. `.agents` never moves.
  Fixtures: `apm.lock.global-claude-config-dir-{inside,outside}-home.yaml`.
  Setting the variable on a deployment made without it **adds** copies: the
  next `install -g` writes the new folder, keeps the `.claude` copies, and
  the lockfile records both (measured 2026-11-25; #1872). An uninstall then
  removes only the folder the variable selects (§ Remove, item 4).

## Drift — `apm outdated`

No `--json` (`-v` lists available tags, `-j` sets the parallel-check count).
The output is a human table drawn in ASCII — `|` between cells, `+---+`
rules — never box-drawing characters (source, `utils/console.py::new_table`
refuses any other box); the parser sits behind the driver port,
integration-tested against captured output. Rich truncates the Package
column to terminal width — capture and parse non-TTY with `COLUMNS=200`
(`WIDE_COLUMNS` in `apm-cli-driver.ts`, the width production sets); never
key the parser on the full package name surviving. Observed states:

- Tag-pinned, newer tag exists → row `Current v0.5.0 | Latest v0.6.0 |
  Status outdated | Source git tags`.
- Root package (repository-root ref) → one row for the whole package, named
  by the repository's last segment (`maestro-fixture-harness`); never a row
  per selected skill (measured on 0.32.0 via `pnpm smoke:ready --scenario
  behind`; not re-run on 0.38.1).
- Local-path dep → `No remote dependencies to check` (drift impossible —
  ADR-0003's reason to forbid local paths).
- Git unpinned → `All dependencies are up-to-date` (tracks the branch, not
  tags).
- Tag-pinned, remote unreachable (no auth/network) → a row with `Latest -`,
  `Status unknown`, an **empty Source cell**, summary `[i] Some dependencies
  could not be checked`, **exit 0**. Fixture:
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
`--json`, an ASCII table (`| v0.6.0 | tag | f8208f12 |`) that mixes
branches in. Maestro keeps only `tag` rows
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
- **An install keeps an edited copy and still succeeds.** Measured on
  0.38.1 and 0.39.1 (2026-11-27), global root package, one deployed
  `SKILL.md` edited, lockfile written by the same apm: a same-tag
  re-install and an install at a newer tag both exit 0 with the success
  marker (`No changes …` and `Installed 1 APM dependency`) and print
  `[!] Kept .claude/skills/<name>/SKILL.md: it was modified since APM
  deployed it. Move it aside, then run 'apm install -g' to restore it.` The
  edit stays on disk. Under a version-1 lockfile the same install fails
  (§ Lockfile). An untracked file added beside the deployed ones was last
  measured on 0.29.0, where the install deleted it silently.
- **An update never deletes a symlinked leaf.** Measured 2026-09-27 (#1217),
  global root package `fimoklei/harness` `v0.3.5` → `v0.4.1`,
  `-g -t claude,codex`, with `.claude/skills/<name>` a relative symlink into
  `.agents/skills/<name>`. Two cases, split by whether the old lockfile owns
  the Claude Code path:
  - *Owned* (`v0.3.5` deployed real folders, replaced by links afterwards):
    exit 1, `Failed to integrate primitives: Cannot call rmtree on a symbolic
    link`, `No install transaction changes were committed.` Links, `.agents`
    copies, `apm.yml` and lockfile all stay at `v0.3.5`.
  - *Not owned* (links in place before the first Claude Code deploy, so the
    lockfile has no `.claude/skills` rows): exit 0 with the success marker and
    `1 file skipped -- local files exist, not managed by APM`. `.agents` moves
    to `v0.4.1` and the link survives, so Claude Code reads the new content
    through it; the lockfile gets no `.claude/skills` row.

  So apm did not remove the links lost on 2026-09-27; that loss has another
  cause, not investigated here. The owned case still ends in a failed update,
  so refusing a linked destination before apm runs stays the right order.
  Captures: `apm-1217-*.txt`, `apm.lock.1217-*.yaml`, `links-1217-*.txt`.

## Remove — `apm uninstall`

`apm uninstall <PACKAGES>… [--dry-run] [-v] [-g]`. Per-dependency removal is
scoped: it deletes the named package's deployed files, its `apm.yml` entry,
its `apm_modules/` subtree, and its lockfile entry — and nothing else. Other
dependencies and hand-placed skill dirs beside them survive, per-repo and
global alike — except beside a legacy per-skill entry (§ A legacy entry's
removal can take a root package's copies). No network and no credentials: every capture below ran with no
token in the environment.

There is **no `-t` flag** (`--dry-run`, `-v`, `-g` are the whole surface).
Removal spans every tool the package was deployed to.

### Argument grammar

`PACKAGES` is the same ref grammar as install, tag optional — the tag is
ignored for matching. `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z`,
the host-less `<owner>/<repo>/skills/<name>`, and the ref without its tag all
match the same `apm.yml` entry. A bare skill name does not: `apm uninstall
tdd` prints `[x] Invalid package format: tdd` and removes nothing.

### Order of operations (measured)

Selection first, then a check of every tracked file against its recorded
hash, then deployed files, `apm.yml`, `apm_modules/`, the lockfile. A
selection failure and an edited file both stop the run before anything is
deleted.

### Uninstall signals

Exit codes carry meaning — success 0, every abort below 1 — but the driver
still classifies on markers, because a marker is what proves the lockfile
entry went.

1. **Success = `Uninstall complete: removed <n> package(s)`**, optionally
   followed by ` and <n> orphaned transitive dependenc…`. Absent marker is
   failure, fail-closed. The run opens with `Uninstalling 1 package...` and
   lists the deleted folders under `[i] Cleaned <n> stale deployed path(s)
   for <pkg>:`. Fixtures: `apm-uninstall-ok.txt`,
   `apm-uninstall-global-ok.txt`.
2. **Selection is all-or-nothing.** A package that is not in `apm.yml`
   prints `[x] <ref> was not found in apm.yml. Run 'apm deps list' …` and
   `[x] Uninstall aborted: <n> requested package could not be selected.
   Resolve the errors above and retry; no changes were made.`, exit 1. One
   absent package among several aborts the whole run before anything is
   touched, so the success marker and a not-found line never appear
   together; the driver's not-found signal stays as a fail-closed guard.
   Fixture: `apm-uninstall-not-found.txt`.
3. **An edited file refuses the removal before anything is deleted.** With
   one deployed file edited locally:

   ```
   [x] Uninstall refused: deleting these tracked files needs deployment evidence that APM wrote them. Nothing was removed; apm.yml and apm.lock.yaml were not changed.
   [x]   - .claude/skills/tdd/SKILL.md: edited since APM deployed it; kept even with --trust-lockfile
   [x] Move aside any listed file that holds your edits, then run 'apm install' to re-establish deployment evidence (once, with access to the package source), then rerun 'apm uninstall'.
   [x] If the source is unreachable, move each listed file aside or delete it, then run 'apm uninstall' to finish the uninstall.
   ```

   Exit 1, no success marker, every file and record unchanged. Moving the
   edited file aside and running the same uninstall again completes. An
   **untracked file** added inside the deployed folder does not block: the
   run completes with the marker, deletes the tracked files and keeps the
   folder with `[!] … Kept skill directory .claude/skills/<name> for 1
   file(s) not owned by APM`. A **missing** deployed file does not block
   either. Fixture: `apm-uninstall-retained.txt`. Maestro's removal guard
   refuses a diverged copy in front of this (`apm-driver.md` § Remove, #775).
4. **`CLAUDE_CONFIG_DIR` scopes an uninstall to one folder** (measured
   2026-11-25, #1947; both fixtures verified unchanged on 0.39.1). With the copies only under `$CLAUDE_CONFIG_DIR` the
   uninstall completes like item 1 and removes that folder's copies. After a
   switch of folder (§ Lockfile: copies under both `.claude` and
   `$CLAUDE_CONFIG_DIR`), an uninstall with the variable set removes only
   `$CLAUDE_CONFIG_DIR`'s copies, keeps the package in `apm.yml` and its
   `.claude` rows in the lockfile, and prints `Removed <pkg> from the
   selected profile; kept in apm.yml because another profile still uses it`
   and `Uninstall complete: removed 1 package from the selected profile
   only`, exit 0. Running it again prints the same and changes nothing; with
   the variable unset the next uninstall removes the rest and the package:
   it deletes the package's and its orphaned transitive dependency's
   `~/.claude` files, drops the `apm.yml` entry and prints `Uninstall
   complete: removed 1 package`. A hand-placed skill dir and an unrelated
   dependency survive in both folders (measured 2026-11-27, #1973). The
   driver reads `from the selected profile only` as failure and retries once
   with the variable unset. The reverse switch (deployed with the variable
   set, then unset) behaves the same way round: the uninstall deletes the
   `~/.claude` copies and stops at `from the selected profile only`; one with
   the variable set to the old folder removes the rest. The lockfile's
   `deployments[]` rows name each folder with `target: claude`. Fixtures: `apm-uninstall-claude-config-dir.txt`,
   `apm-uninstall-selected-profile-only.txt`,
   `apm-uninstall-selected-profile-retry.txt`,
   `apm-uninstall-selected-profile-only-reverse.txt`,
   `apm-uninstall-selected-profile-retry-reverse.txt`.
5. **The cleaned-paths count is what it deleted this run**, so it moves with
   the state it found. Never parse it.
6. Match every phrase whitespace-normalized and lowercased — the output is
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

### A legacy entry's removal can take a root package's copies

Observed once, on a real global install (#958, 2026-09-13), not reproduced in
a sandbox, backed by no fixture and not re-measured on 0.38.1. The lockfile was last written by apm
0.20.0 and held two entries: a legacy `claude_skill` row
(`fimoklei/agent-harness`, `virtual_path: skills/47`, no `deployed_files`)
and a root package from another repository (`fimoklei/harness`, three
selected skills, deployed `-t claude,codex`). From a neutral cwd:

```
HOME=$(realpath ~) apm uninstall -g "fimoklei/agent-harness/skills/47#v0.5.1"
```

```
[!] Best-effort re-integration skipped for fimoklei/harness. Run 'apm install' to rebuild integrated files.
  [!] 1 skill replaced by a different package (last installed wins)
[+] Cleaned up 7 integrated skills
[*] Uninstall complete: Removed 1 package(s) from apm.yml, Removed 1 package(s) from apm_modules/
```

Exit 0 with the success marker, and the removal reached past the named
package:

- The root package's `.claude/skills/<name>/` copies were deleted; its
  `.agents/skills/<name>/` copies survived.
- Its lockfile entry kept every `.claude` path in `deployed_files`, so the
  record claimed files that were gone.
- The legacy entry's own `.claude/skills/47/` and `.agents/skills/47/` stayed
  on disk, now owned by no entry.
- It printed 0.26.0's `Cleaned up N integrated skills` line, not
  `Cleaned N stale files`.

A same-ref install of the root package with its Selection
(`apm install github.com/fimoklei/harness#v0.3.4 --skill … -g -t claude,codex`)
restored the copies with their recorded hashes. The cause is not read from
source.

### Narrowed `targets:` no longer scopes anything

On 0.26.0, editing `apm.yml`'s `targets:` down to `claude` before an
uninstall deleted only the `.claude` copy and orphaned `.agents`. On 0.29.0
the cleanup removes every file the lockfile entry owns regardless of
`targets:` — measured per-repo: `targets: [claude]` over a `-t claude,codex`
install deleted `.claude/skills/<name>` and `.agents/skills/<name>` alike
and dropped the entry. So `targets:` is neither an orphaning trap nor a
per-tool remove lever; per-tool cleanup stays the scoped `rm` behind
`DeployedCleanupPort` (ADR-0013). Global not re-measured (same code path).

## Prompts and undelivered paths

Measured 2026-10-16 and 2026-10-18 in sandbox spikes against a local
fixture Harness (single-file refs against the public
`microsoft/apm-sample-package#v1.0.0`), project scope and `-g`. The captures were not committed;
re-verify by re-running the method in `docs/research/1559-apm-prompts.md`
and `docs/research/1564-apm-ignored-paths.md`, which hold the full tables.

### What an install delivers

- **The deploy plan is a closed allowlist** (source,
  `install/deployable_source_plan.py:65-234`; every integrator drops a file
  the plan lacks, `integration/base_integrator.py:175-185`). Prompts come
  only from root `*.prompt.md` and `.apm/prompts/*.prompt.md`: the plan
  admits `.apm/prompts/**`, but the integrators glob without recursion
  (`integration/prompt_integrator.py:35`, `command_integrator.py:189-193`).
  Measured: 14 other candidate paths, among them
  `.maestro/prompts/<name>.md`, `prompts/`, `library/`, root `commands/`
  and `.apm/prompts/sub/`, reached no tool folder and no `deployed_files`
  in 24 installs (Deploy, a second Deploy, Update, Remove; two tools, eight
  tools, auto-detect).
- **`--skill` scopes skills only.** A root install delivers every prompt in
  the Harness to every prompt-capable tool of the target. A single-file ref
  (`…/.apm/prompts/<name>.prompt.md#vX.Y.Z`, or `git` + `path` + `ref`) is
  its own package beside the root one, not a filter: both write the same
  file, the last install owns it, and removing either leaves the file. A
  single-file ref needs the GitHub API, so the `pnpm smoke` redirect cannot
  serve it.
- **`includes: auto` has no effect on delivery**; install reads it only for
  the consumer's policy check (source, `install/phases/policy_gate.py:96-103`).
  The recursive `**/*.prompt.md` globs belong to `apm compile`, `apm run`
  and link resolution, none of which writes a deployed file during install.
- **A `SKILL.md` at the Harness root ships the whole repo except `.apm/`**
  as one skill named after the package (source,
  `deployable_source_plan.py:154-172`). Every path above stays undelivered
  only while the root has no `SKILL.md`. A file inside `.apm/skills/<name>/`
  ships with that skill. Measured 2026-10-24 (#1587), a project-scope root
  install with `--skill`: the entry reads `package_type: hybrid`, and
  `.claude/skills/<package>/` receives `SKILL.md`, `README.md`, `apm.yml`
  and `.maestro/prompts/*` beside the selected skills. apm prints `--skill
  filter ignored`, yet honours the Selection; a later install and a named
  uninstall succeed.
- **The Harness's own `targets:` narrows delivery.** apm intersects the
  consumer's `-t` with the package's declared targets (source,
  `install/target_filter.py:72-120`; measured with `targets: [claude,
  codex]`). The scaffold leaves `targets:` commented out.
- `apm_modules/` (and `~/.apm/apm_modules/` at `-g`) holds the full
  checkout, every undelivered file included. No tool reads it.

### Where a prompt lands

| Tool | Project | `-g` | Copy |
|---|---|---|---|
| claude | `.claude/commands/<name>.md` | `~/.claude/commands/<name>.md` | command transform |
| copilot | `.github/prompts/<name>.prompt.md` | `~/.copilot/prompts/<name>.prompt.md` | byte-identical |
| cursor, opencode, windsurf, grok-build | own `commands/` or `workflows/` folder | own user folder | command transform |
| gemini | `.gemini/commands/<name>.toml` | `~/.gemini/commands/<name>.toml` | TOML; `$ARGUMENTS` → `{{args}}` |
| codex | — | — | no prompt primitive |

With an explicit `-t`, apm creates any missing tool folder.

**The command transform** rebuilds the front matter from `description`,
`allowed-tools`, `model`, `argument-hint` and `input`, and drops any other
key with a warning. `input:` becomes `arguments:` plus `argument-hint`, and
`${input:x}` becomes `$x` only for declared names. Keys are sorted, quoting
is normalised, the final newline is dropped, and a prompt without front
matter gets a `---\n{}\n---\n\n` header. `$ARGUMENTS` and `$1` pass through.
Compare a transformed copy with its `deployed_file_hashes` entry, never with
its source.

### Lockfile, drift and edits

- A prompt has no lockfile entry of its own: its copies are paths and
  hashes under the Harness entry, one `deployments` row per file, whose
  `target` is the tool's own name (`claude`, `copilot`, …), unlike the
  `agents` target of a skill's shared copy.
- `apm outdated` reports the Harness tag only: never which prompt changed,
  and never content. A locally edited prompt copy still reads up to date.
- An upgrade or same-ref install **silently overwrites** an edited copy of
  a prompt still in the release. A prompt the release drops is cleaned
  from every tool unless its copy was edited; an edited copy is kept, and it
  then blocks `apm uninstall` (exit 1, the rest
  already deleted), as an edited skill copy does (§ Uninstall signals).

## Skill body budget — stated in the docs, checked nowhere

apm's producer guide ("Author a skill", read 2026-07-28) says *"Keep
`SKILL.md` under **500 lines and 5000 tokens**"* and disclaims it in the next
sentence: *"This is the agent-skills convention, not an APM check."* Matching
the code on 0.29.0: `grep -rn "5000"` and
`grep -rniE "max_lines|token_budget|max_tokens|line_limit"` over `apm_cli`
each find nothing. No source names a tokenizer, so the token half is
uncheckable offline — measurements and the reasoning are in
`docs/research/356-skill-md-token-budget.md`.

## Content drift — apm never reports it as a state

`apm outdated` reports version drift only. `install` keeps an edited
deployed file, warns with a `Kept …` line and still prints its success
marker (§ Update). `uninstall` compares deployed files against
`deployed_file_hashes` and uses the answer to *refuse* the removal
(§ Remove).
Maestro's own detection:

- **Destination drift:** compare `deployed_file_hashes` against a live
  sha256 of each deployed file — a mismatch, a missing file, or a live file
  with no entry means diverged (`deployed-diverged-from-lock`). A copy with
  no recorded hashes at all cannot be verified and is refused as its own
  state, `deployed-unverifiable` — a copy predating content tracking, with a
  known false-positive mode (a stale smoke sandbox; see the
  `verify-in-smoke` skill). Verified end-to-end per-repo (#56) and
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

- **A symlink component in `HOME` no longer empties a global install.**
  With `HOME` under `/tmp` (a symlink to `/private/tmp`) a 0.38.1 `-g`
  install deploys every file and records its hashes (measured 2026-11-25;
  the older failure: `docs/research/772-apm-0.29.0-findings.md` § F1).
  Every test sandbox still `realpath`s its home, so recorded paths
  and the reader's `HOME` agree.
- **`-t` is honoured literally; apm never checks tool presence** (source:
  `core/target_detection.py::resolve_effective_target_decision` returns an
  explicit `-t` first, before the manifest and the filesystem scan; each
  token is validated against the known target names). `-t claude,codex` on a machine without Codex writes both
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
  files on disk — re-measured on 0.38.1 (all six `.agents` files and their
  hashes survived, `targets:` kept both tools). Source, present on 0.38.1:
  `install/phases/targets.py::_read_yaml_targets` and
  `declared_target_profiles` source the declared target universe from the
  consumer's `apm.yml`, and `core/deployment_state.py::_is_stale` keeps
  every row unless `intent.authoritative_targets` is set (false on the
  uninstall path). Pruning
  fires on the install's own active targets or on a row for a known target
  the manifest does not declare — never on `-t`. Because the first install
  persists `targets:` and a narrower `-t` does not rewrite it, the declared
  universe stays wide. Maestro's reconciliation is ADR-0013, and since #1557
  it reclaims nothing: the `.agents` and `.claude` ghost files are left on
  disk deliberately.
- **The 2026-07-17 mass-deletion cannot recur on 0.29.0.** A bare `apm
  uninstall -g` — the command that wiped 19 pre-existing skill dirs from a
  real `~/.claude/skills/` while the global lockfile read `dependencies:
  []` — is rejected by the argument parser (`Error: Missing argument
  'PACKAGES...'`, exit 2, nothing touched; re-measured on 0.38.1). A *named* `-g` uninstall
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
- Uninstall over a copy with no `deployed_file_hashes` (a pre-tracking
  lockfile): whether apm retains or deletes an edited file there.
- Prompts on the copilot-app (SQLite) and copilot-cowork targets (source:
  cowork has no prompt primitive).
- Whether a single-file prompt ref reads `outdated` at a newer tag that
  leaves its prompt unchanged: source says it does; unmeasured.
- Project auto-detect with only `.github/` present: one run failed with
  `No harness detected`, exit 2; not investigated.
