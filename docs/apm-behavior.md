# apm behavior — observed reference (Maestro)

How `apm` actually behaves, captured by running it or reading its source —
never guessed (the trap in `LEARNINGS.md`). This document describes **one apm
version: 0.26.0, verified 2026-07-20**. On an apm upgrade it is re-verified
and rewritten section by section per `docs/agents/apm-upgrade.md` — sections
are replaced, never appended to with version deltas; `git log` on this file
is the version history.

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

### Reference grammar

The Maestro form is `github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z` — a
tag-pinned virtual package (owner/repo taken from the local clone's `origin`
remote, subpath `.apm/skills/<name>`, ADR-0021 §4). The captures below were
taken against the retired root `skills/` shape and are left as observed. It
yields `resolved_ref` +
`resolved_commit` + `content_hash` in the lockfile. The alternatives are
unusable or forbidden:

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

Transport forms cannot carry a skill: `ssh://…/o/r/skills/tdd#v1` and
`http://…/o/r/skills/tdd#v1` are rejected ("A subpath cannot be embedded in
a git URL"); scheme forms without a subpath parse but cannot name a skill.
The apm.yml `git:` + `path:` escape hatch is not reachable from the CLI
(`apm install --help` exposes no `--path`). Port handling changed upstream
after the #152 spike (apm PRs #2210/#2211) — re-spike before relying on the
old port observations. Maestro's response — GitHub-only origins, refused at
parse time — is ADR-0014.

### Install signals

The deploy path must not trust the exit code:

1. **Auth fails at `apm view … versions`** (the latest-tag step), exit 1 —
   never at `install`. The output carries apm's two fixed phrases,
   `Authentication failed` and `No token available`; only these classify
   auth-required. Do not match the git passthrough line (`could not read
   Username`) or the env hints, and never echo the matched text
   (`security.md`). A nonexistent-but-authorized ref produces the same "all
   probes failed … verify the path and ref" text as a missing-auth install,
   so the install stage cannot distinguish auth from a typo'd ref — which is
   why auth is classified at `view`, where the signal is clean. Fixture:
   `apm-view-auth-failed.txt`.
2. **Success = the marker, not the exit code.** Success is `Installed \d+
   APM dependenc` present AND no `with <n≥1> error(s)` AND no `Installation
   failed`. Both observed failure modes (validation failure, symlink
   refusal) exit 1 with no marker; an absent marker is failure, fail-closed,
   regardless of exit code. Fixtures: `apm-install-ok.txt`,
   `apm-install-probes-failed.txt`, `apm-install-symlink-refused.txt`.
3. **`is a symlink` = destination refusal**, and only when the *leaf* skill
   dir is a symlink — a directory-level symlink installs fine (measured in
   `docs/research/apm-0.25-symlink-topology-impact.md`). Match every phrase
   on whitespace-normalized, lowercased output: Rich wraps mid-sentence,
   `install` pins no `COLUMNS`, and the wrap point moves between versions
   (`LEARNINGS.md` · rich-wraps-phrases-mid-sentence).
4. **`-g` opens with a scope-support warning block** (`[!] User-scope
   primitives are fully supported by …` / `Some primitives are not
   supported: …`, listing `antigravity` among the partially supported); a
   per-repo install skips straight to `[*] Created apm.yml`. The block
   matches none of the signal phrases — inert for classification. Its tool
   list differs from `apm targets --json` (8 project targets, no
   `antigravity`).

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
deployments:                    # one row per deployed file per tool
- kind: project-relative
  target: claude                # the TOOL NAME (claude/codex), not a path
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
- The reader filters `package_type === "claude_skill"`; a two-tool entry
  holds multiple `deployed_files`, so a skill is surfaced once per entry,
  not once per file.
- `deployed_file_hashes` is a plain per-file sha256 of content — identical
  across the `.claude`/`.agents` copies, reproducible.
- `content_hash` is apm-internal and did not reproduce (eight hashing
  schemes tried, no match) — opaque, never recompute.
- In `deployments[]`, `target` is the tool name (`claude`/`codex`) and
  `value` the deployed path; `runtime` was `null` in every observed row.
  `target` is the designated replacement for prefix-sniffing
  `deployed_files` when per-tool grouping is reworked (#172).
- **`scope` reads `project` even for a `-g` install.** A single-tool global
  and a single-tool per-repo install produce identical payloads
  (`apm.lock.global-single-tool.yaml` vs `apm.lock.tag-pinned-v0.5.1.yaml`,
  modulo `generated_at` and a fixture comment header) — scope is known only
  from *which* lockfile you read (`~/.apm/apm.lock.yaml` vs the repo's),
  never from a field inside it.
- A two-tool install (`-t claude,codex`) writes **one** entry with deployed
  files under both `.claude/skills/<name>` and `.agents/skills/<name>` —
  codex uses the cross-client agent-skills dir; there is no `.codex/skills`.
- **`.agents/skills/` has ten readers; `.claude/skills/` has one (source).**
  Read from `apm_cli/integration/targets.py` in 0.26.0 (#202): each target's
  skills primitive either overrides `deploy_root` to `.agents` — `copilot`,
  `cursor`, `opencode`, `gemini`, `codex`, `windsurf` — or inherits a
  `root_dir` of `.agents` — `antigravity`, `agent-skills`, `openclaw`,
  `hermes`. Only `claude` (`root_dir` `.claude`, no override) and `kiro`
  (`.kiro`) deploy skills anywhere else. So an undetected codex is one of ten
  possible readers of `~/.agents/skills/`, while an undetected Claude Code is
  the sole reader of `~/.claude/skills/`. This asymmetry is what ADR-0011's
  #202 amendment encodes: reconciliation may reclaim `.claude`, never
  `.agents`.

## Drift — `apm outdated`

No `--json` (`-v` lists available tags, `-j` sets the parallel-check count).
The output is a human Rich table; the parser sits behind the driver port,
integration-tested against captured output. Rich truncates the Package
column to terminal width — capture and parse non-TTY with `COLUMNS=200`
(`WIDE_COLUMNS` in `apm-cli-driver.ts`, the width production sets); never
key the parser on the full package name surviving. Observed states:

- Tag-pinned, newer tag exists → row `Current v0.5.0 | Latest v0.5.1 |
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
`skills/<name>`. Fixture: `apm-view-versions.txt`.

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
  subtree makes that true. With local edits or untracked files it silently
  resets the subtree to the tag, dropping them, while still printing
  `(files unchanged)`.

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
tdd` prints `[x] Invalid package format: tdd` and removes nothing, exit 0.

### Uninstall signals

Never trust the exit code — **every** outcome above exits 0, including a
package that was never installed. The argument parser is the sole exception
(missing `PACKAGES` → exit 2, nothing touched).

1. **Success = `Uninstall complete: Removed \d+ package(s) from apm.yml`.**
   Absent marker is failure, fail-closed. Fixtures: `apm-uninstall-ok.txt`,
   `apm-uninstall-global-ok.txt`.
2. **Nothing removed** prints `[!] <ref> - not found in apm.yml` and `[!] No
   packages found in apm.yml to remove`, with no success marker, exit 0.
   Fixture: `apm-uninstall-not-found.txt`.
3. **Partial success** (several packages, some absent) prints the success
   marker *and* `[!] Note: \d+ package(s) were not found in apm.yml`. Present
   markers must be read together, not first-match.
4. **The `Cleaned up \d+ integrated skills` count is not a contract.** Two
   runs of the same command over the same package reported 7 and 11; it
   matches neither the skill count nor the file count. Never parse it.
5. Match every phrase whitespace-normalized and lowercased — the output is
   Rich-rendered like install's (`LEARNINGS.md` ·
   rich-wraps-phrases-mid-sentence).

### What it does not tell you

- **`--dry-run` understates the blast radius.** It previews only the
  `apm.yml` and `apm_modules/` removals — never the deployed files it is
  about to delete, even with `-v`. Fixture: `apm-uninstall-dry-run.txt`.
- **Local edits die silently.** A deployed file with uncommitted changes is
  deleted with no warning and no distinct output — the same trap as a
  same-ref re-install over a dirty subtree.
- **The lockfile is deleted, not emptied, when the last dependency goes.**
  `apm.lock.yaml` disappears rather than being rewritten with `dependencies:
  []`. A reader must treat an absent lockfile as nothing deployed, never as
  an error.

### Narrowed `targets:` orphans the other tools

Removal scope comes from the consumer's `apm.yml` `targets:`, not from the
lockfile's `deployed_files`. Editing `targets:` down to `claude` before
uninstalling a `-t claude,codex` package deletes `.claude/skills/<name>`,
leaves `.agents/skills/<name>` on disk, and still drops the whole lockfile
entry — so the orphan becomes invisible to deploy-state. This is the install
ghost-entry problem (ADR-0013) in reverse and rules out `targets:` editing as
a per-tool remove lever; per-tool cleanup stays the scoped `rm`.

Measured on the per-repo path only. The global (`-g`) path runs the same scope
resolution, so the same orphaning is inferred, not observed (#339). The reclaim
that acts on the inference is a force-`rm` of an exact subtree, so it costs a
no-op if the inference is wrong.

## Skill body budget — stated in the docs, checked nowhere

apm's producer guide ("Author a skill", read 2026-07-28) says *"Keep
`SKILL.md` under **500 lines and 5000 tokens**"* and disclaims it in the next
sentence: *"This is the agent-skills convention, not an APM check."* Matching
the code on 0.26.0: `grep -rn "5000"` and
`grep -rniE "max_lines|token_budget|max_tokens|line_limit"` over `apm_cli`
each exit 1 (control `grep -rln "SKILL.md"` exits 0, 16 files). No source
names a tokenizer, so the token half is uncheckable offline — measurements
and the reasoning are in `docs/research/356-skill-md-token-budget.md`.

## Content drift — apm detects nothing

`apm outdated` reports version drift only. Edits to deployed files are
invisible to apm, and a same-ref install silently remediates them without
ever reporting them (above). Maestro's own detection:

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
no env override (source: apm's `core/scope.py`). A missing global lockfile
means nothing deployed (empty, not an error). A global install still appends
`apm_modules/` to the **cwd's** `.gitignore` — run global deploys from a
neutral cwd.

- **`-t` is honoured literally; apm never checks tool presence** (source:
  `core/target_detection.py::resolve_targets` takes `-t` as Priority 1 and
  returns those tokens verbatim; the filesystem scan runs only when `-t` is
  absent). `-t claude,codex` on a machine without Codex writes both
  subtrees, exit 0, no warning. `-t codex` also leaves an empty `~/.codex/`
  behind, off-lockfile
  — a deploy creates the very directory naive presence detection would look
  for.
- **No apm command lists globally-installed tools.** `apm targets --json` is
  project-scoped — it scans the cwd for markers (fixture
  `apm-targets-claude.json`). A bare `apm install -g` ignores `HOME`
  entirely and falls back to the cross-client `agent-skills` meta-target
  (`.agents/` only); apm's auto-detect reads the project cwd, never
  `Path.home()` — also why `Multiple harnesses detected` fires only on a
  project cwd, never on a global install. Whoever drives apm must detect
  tool presence itself — Maestro's answer is ADR-0011. The durable markers
  are the config files (`~/.claude.json`, `~/.codex/config.toml`), which a
  deploy never creates; the directories (`~/.claude/`, `~/.codex/`,
  `~/.agents/`) can all be created *by* a deploy and would read a past
  deploy back as "tool installed".
- **Ghost entries survive a narrowing `-t` (source).** `apm install -g -t
  claude` over a lockfile written by `-t claude,codex` keeps the `.agents`
  `deployed_file_hashes` and leaves the `.agents/skills/<name>` files on
  disk. Verified against the 0.26.0 source (#191): `_read_yaml_targets`
  sources the declared target universe from the consumer's `apm.yml` alone,
  so a `--target`-only consumer yields `None` and `_is_stale`
  short-circuits to preserve-all; pruning fires on a contracted `targets:`
  in `apm.yml`, on the install's own active targets, or on ghost rows for a
  known-but-undeclared target — never on `-t`. Maestro's reconciliation is
  ADR-0013, and since #202 it reclaims only a single-reader directory: the
  `.agents` ghost files above are left on disk deliberately.
- **The 2026-07-17 mass-deletion cannot recur on 0.26.0.** A bare `apm
  uninstall -g` — the command that wiped 19 pre-existing skill dirs from a
  real `~/.claude/skills/` while the global lockfile read `dependencies:
  []` — is now rejected by the argument parser (`Error: Missing argument
  'PACKAGES...'`, exit 2, nothing touched). Re-measured against that exact
  shape in a sandbox home holding three unrelated skill dirs: all three
  survived, and a *named* `-g` uninstall beside them removed only its own
  package (§ Remove). The apm version behind the incident was not recorded,
  so this is a 0.26.0 fact, not a retraction of the incident. The rule
  stands regardless: never point a spike `-g` command at the real home
  (`LEARNINGS.md` · spike-isolation). Test lane: sandbox `HOME`, auth via
  `GITHUB_TOKEN`/`GITHUB_APM_PAT` from `gh auth token`.

## Producer — authoring, tagging, and `compile`

Facts the authoring-side wayfinder map (issue #343) rests on. Captured
against apm 0.26.0, the version this document describes.

- **apm never creates a git tag.** Tagging is the human's act; the release
  gates apm offers are `apm pack --check-versions` and `--check-clean`, both
  reading local `apm.yml`/artifact state, never git. →
  `docs/research/354-marketplace-as-release-gate.md`
- **`apm compile --validate` cannot fail on a skill content defect.**
  `validate_primitives` routes every primitive and link error into a
  warnings list that `_run_validation_mode` never prints; the
  `All primitives validated successfully!` marker fires over a file that
  failed to parse. Exit 1 only for a missing `apm.yml`, no APM content, or a
  discovery exception (source). → `docs/research/346-apm-proof-owner.md`
- **Plain `apm compile` overwrites a hand-authored root context file.**
  `--target codex` rewrites `AGENTS.md`; `--target claude` rewrites
  `CLAUDE.md`; both replace existing content with a generated build. Only
  `--validate` and `--dry-run` are safe in a repo whose `AGENTS.md`/`CLAUDE.md`
  are owned (source). → `docs/research/346-apm-proof-owner.md`
- **A ref's subpath is literal, with no discovery fallback**, and is baked
  into an immutable tag — a renamed or moved skill breaks every pin to its
  old subpath. The break is **loud**: `Failed to download dependency
  <owner>/<repo>: Subdirectory '<path>' not found in repository`, then
  `Installation failed with 1 error(s)`, exit 1, and `Removed apm.yml created
  by the failed install` — a clean rollback, no partial state. Distinct from
  the silent `package_type: invalid` case, which needs the directory to exist
  without a `SKILL.md`. → `docs/research/344-repo-shape.md`
- **The 500-line / 5000-token `SKILL.md` rule is agentskills.io's convention,
  not apm's.** apm 0.26.0 has no such constant in code; `core` enforces the
  500-line proxy only, the token half is uncheckable offline. →
  `docs/research/356-skill-md-token-budget.md` (full detail already at
  "Skill body budget" above)

## Unobserved — spike before relying

- Hook and MCP deploys (`apm mcp` is a separate command surface). Only
  `package_type: claude_skill` has ever been observed.
- Custom ports in git refs after apm PRs #2210/#2211 (see Reference
  grammar).
