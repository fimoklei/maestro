# APM driver — observed behavior (project-specific for Maestro)

How `apm` actually behaves, captured by running it — not guessed (the trap in
`LEARNINGS.md`). Read before writing code that drives `apm` or parses its
lockfile/output. Pair with `security.md` (how to shell out safely) and ADR-0003
(why tag-pinned git refs). **Verified against apm 0.26.0 (2026-07-20); re-verify
on upgrade.** Spike sections keep their original 0.16.0 dates; 0.20.0 and 0.26.0
deltas are inline.

## Deploy command

`apm install <REF> -t claude`, cwd = consuming repo, via `execFile` + args array
(never a shell string — `security.md`). apm auto-creates `apm.yml` +
`apm.lock.yaml`, materializes the skill into `.claude/skills/<name>/`, creates
`apm_modules/` and appends it to `.gitignore`. No pre-init needed.

### Reference forms (only one is used)

| Form | Example | Result |
|---|---|---|
| Local path | `/abs/.../agent-harness/skills/tdd` | `source: local`, **no version, invisible to drift**. Forbidden (ADR-0003). |
| Git, unpinned | `github.com/<owner>/<repo>/skills/<name>` | `resolved_commit` only; apm warns "unpinned — add #tag". Not used. |
| **Git, tag-pinned** | `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z` | `resolved_ref` + `resolved_commit` + `content_hash`. **The Maestro form.** |

The `host/owner/repo/subpath#ref` shape works; `https://….git/subpath` **fails**
("not accessible"). Owner/repo come from the local clone's `origin` remote; the
subpath is `skills/<name>`.

Real git installs **need network** (clone from GitHub ~3–4s; partial clone may
fail → retries full bare clone). Keep real `apm` out of the fast test loop
(`testing.md`, canary only).

### Deploy failure & success signals (spiked 2026-07-13, apm 0.20.0, issue #119; re-verified 2026-07-20, apm 0.26.0, issues #182–#184)

Redirected `HOME`, no gh helper, private `agent-harness`. Three facts break the
naive "execFile throws on failure" model — the deploy path must not trust the
exit code:

1. **Auth bites earlier, at `resolveLatestTag` (`apm view … versions`), exit 1** —
   never at `install`. The throw carries apm's two **fixed auth phrases**,
   `Authentication failed` and `No token available`. Classify auth here on
   either phrase (case-insensitive); do **not** match the git passthrough line
   (`could not read Username`) or the env hints (`Set GITHUB_APM_PAT…`), and
   never echo the matched text (`security.md`). Fixture:
   `apm-view-auth-failed.txt`.
2. **The success marker is the signal; the exit code is not load-bearing.** On
   0.26.0 both failure modes exit **1** with **no marker**: a validation
   failure (`apm-install-probes-failed.txt`) and a symlink refusal
   (`apm-install-symlink-refused.txt`, ending `[x] Installation failed with 1
   error(s) … No install transaction changes were committed.`). This is a
   correction, not just a re-verification — 0.20.0 had exits split by case
   (probes-failed exit 0 with no marker, symlink-refused exit 1 *with* the
   marker present); that split is gone on 0.26.0. Success = marker `Installed
   \d+ APM dependenc` AND no `with <n≥1> error(s)` AND no `Installation
   failed`; absent marker = failure (fail-closed), regardless of exit code.
   Fixture: `apm-install-ok.txt`.
3. **Phrase `is a symlink` → `destination-symlinked`** (leaf skill dir only; a
   directory-level symlink installs fine); every other install failure →
   `failed`. Match all install signals on whitespace-normalized, lowercased
   output — Rich wraps mid-sentence and `install` pins no `COLUMNS`. The wrap
   point itself moved between versions (0.20.0 split `is` / `a symlink`;
   0.26.0 splits `is a` / `symlink`) without breaking the match, which is the
   point of normalizing before matching.
4. **`-g` installs open with a scope-support warning block that no signal
   reads.** `apm install … -g` (success or failure alike) prints `[!]
   User-scope primitives are fully supported by …` followed by `Some
   primitives are not supported: …` before anything else — 0.26.0 lists
   `antigravity` among the partially-supported tools. A per-repo install skips
   straight to `[*] Created apm.yml` (compare `apm-install-symlink-refused.txt`,
   a `-g` run, against `apm-install-ok.txt`, a per-repo run). The block matches
   none of the phrases above, so the classifier is unaffected — recorded here
   so the next agent doesn't re-measure it from scratch. It's a different tool
   list from `apm targets --json` (below), which still reports 8 project
   targets and never mentions `antigravity`.

**Auth-only scope.** Only the two phrases classify `auth-required`; network /
host-down / CLI-missing stay the generic failure. A nonexistent-but-authorized
ref produces the *same* `all probes failed … verify the path and ref` text at
exit 0 as a missing-auth install would, so the **install stage cannot classify
auth** (ambiguous with a typo'd ref) — which is why auth is caught at `view`,
where the signal is clean. Deliberately unlike the drift side's `unverified`,
which lumps auth+network because `outdated`'s summary forces it.

`resolveLatestTag` returns a discriminated result — `{ ok:true; tag } |
{ ok:false; reason:"no-tag"|"auth-required"|"failed" }` — mirroring
`checkOutdated`, so there is no control-flow-by-exception. The use-case maps
`no-tag → no-published-tag`, `auth-required → auth-required` (HTTP 502),
`failed → deploy-failed`.

## Lockfile shape — `apm.lock.yaml`

Top level: `lockfile_version`, `generated_at`, `apm_version`, `dependencies: []`,
and, as of 0.26.0, a top-level `deployments: []` (below). Parse → validate with
Zod → use (`security.md`). A tag-pinned skill entry:

```yaml
- repo_url: fimoklei/agent-harness
  name: tdd                     # 0.26.0: NEW — the skill name (was the repo name pre-0.26.0)
  host: github.com
  resolved_commit: <40-hex>
  resolved_ref: v0.5.1          # the human version shown in deploy-state
  version: unknown               # 0.26.0: NEW — deliberate, path-independent (apm PR #2217)
  virtual_path: skills/tdd
  is_virtual: true
  package_type: claude_skill    # only type observed; hooks/MCP UNobserved
  deployed_files:               # 0.20.0: enumerates the dir AND every file
  - .claude/skills/tdd
  - .claude/skills/tdd/SKILL.md
  - .claude/skills/tdd/refactoring.md   # …one line per materialized file
  deployed_file_hashes:         # 0.20.0: NEW — per-file sha256 of content
    .claude/skills/tdd/SKILL.md: sha256:<hex>
  content_hash: sha256:<hex>
deployments:                    # 0.26.0: NEW — top-level, one row per deployed file per tool
- kind: project-relative
  target: claude                # the TOOL NAME (claude/codex), not a path prefix
  value: .claude/skills/tdd/SKILL.md   # the deployed path — the load-bearing field
  runtime: null
  scope: project                 # reads "project" even for a -g install — see below
  owners:
  - fimoklei/agent-harness/skills/tdd
  active_owner: fimoklei/agent-harness/skills/tdd
  content_hash: sha256:<hex>
```

`repo_url` survives unchanged as the entry's first key. Deploy-state reads
`resolved_ref` (version), `virtual_path` (identity + name), `package_type`
(primitive type). It does **not** read `deployed_files` or `deployments`, so
these shape changes are inert for the reader — its Zod schema ignores unknown
keys (confirmed by the suite passing against refreshed fixtures).

**0.20.0 deltas (vs 0.16.0):** `deployed_files` now lists the directory *and*
every materialized file (was just the dir); `deployed_file_hashes` is new.
Unlike the opaque `content_hash`, these per-file hashes **are a plain sha256 of
file content** — identical across the `.claude`/`.agents` copies — so they look
reproducible. See content-drift note below.

**0.26.0 deltas (vs 0.20.0), measured refreshing the fixtures for #183/#184:**
`name` and `version` are new per-dependency keys, and `deployments:` is a new
top-level block, one row per deployed file per tool. In `deployments[]`,
`target` is the tool name (`claude` / `codex`) — relevant to #172 as a
replacement for prefix-sniffing `deployed_files` — and `value` is the deployed
path, the field actually worth reading; `runtime` was observed `null` in every
row. **`scope` reads `project` even for a `-g` install**, so it cannot be used
to distinguish global from per-repo. That matters concretely:
**`apm.lock.global-single-tool.yaml` (a `-g -t claude` install) now carries the
same payload as `apm.lock.tag-pinned-v0.5.1.yaml` (a per-repo `-t claude`
install) — identical modulo `generated_at` and the fixture's comment header**
— a single-tool global and a single-tool per-repo install produce
the same relative paths, so neither the dependency entry nor the `deployments`
rows can tell the two scopes apart from lockfile content alone — scope is only
known from *which* lockfile you read (`~/.apm/apm.lock.yaml` vs the repo's),
never from a field inside it.

## Drift — `apm outdated`

**No `--json`** (still absent on 0.20.0; new flags `-v` = available tags, `-j` =
parallel-check count). Output is a human table; the parser sits behind the driver
port, integration-tested against captured output. **Rich truncates the Package
column to terminal width** (a narrow run shows `fimoklei/agent-harn…`): capture
and parse non-TTY with a fixed `COLUMNS` — 200, matching `WIDE_COLUMNS` in
`apm-cli-driver.ts`, which is the width production sets; never key the parser
on the full package name surviving. Observed states:

- Tag-pinned, newer tag exists → row: `Package | Current v0.5.0 | Latest v0.5.1 |
  Status outdated | Source git tags`.
- Local-path dep → `No remote dependencies to check` (drift impossible — why
  ADR-0003 forbids local paths).
- Git unpinned → `All dependencies are up-to-date` (tracks the branch, not tags).
- **Tag-pinned, remote unreachable (no auth/network) → a row with `Latest -`,
  `Status unknown` and the summary `[i] Some dependencies could not be checked
  (branch/commit refs)`, exit 0** (spiked 2026-07-05, issue #108; fixture
  `tests/fixtures/apm-outdated-could-not-check.txt`). apm reached the tool but
  could not resolve the tag against the remote. **This is the root of a cockpit
  "unknown" that a manual `apm outdated` contradicts:** the interactive shell has
  the gh credential helper, a `pnpm dev` server may not — same repo, different
  auth. The `unknown`-status row carries an empty Source cell, so a parser that
  drops empty cells collapses it to **four** cells and shifts every later column
  left — parse the row with empties intact, so Status keeps its column index.
  The parser reports this as `{ ok:false, reason:
  "unverified" }` (its own state, distinct from a bare failure), and precedes row
  parsing so a mix of outdated + uncheckable never drops the uncheckable one to a
  false up-to-date (J04).

Maestro consumes this as **behind / up-to-date / unverified**, per roadmap 01:
up-to-date and behind derive from a check that resolved; `unverified` is apm's
own could-not-check, shown distinct from a bare `unknown` (a crashed/unreadable
check) so the cockpit points at auth/network, not a generic failure.

## Update — re-install at the latest tag, NOT `apm update`

**Spiked against apm 0.20.0 on 2026-06-16**, auth to `fimoklei/agent-harness`
(scratch repo, tag-pinned `skills/tdd#v0.5.0` while `v0.5.1` existed).
**Re-verified against apm 0.26.0 on 2026-07-20.** Fixture:
`tests/fixtures/apm-update-noop.txt`.

`apm update` **does not move an exact tag pin** — the Maestro form (ADR-0003).
`apm update [-y -t claude,codex]` on a `#v0.5.0` dep with `v0.5.1` available
prints `[+] All dependencies already at their latest matching refs.`;
`apm.yml` and lockfile stay at `v0.5.0`. (0.20.0 printed a multi-line update-plan
table ending `No dependency changes were applied.`; 0.26.0 collapsed that to the
one line above. The verdict — a no-op on an exact tag pin — is unchanged.)
`apm update` = "refresh to latest *matching* ref", and an exact tag's only
matching ref is itself — a **no-op** for us (verified, not guessed).

**What bumps a pin: re-install at the new tag.**
`apm install <host/owner/repo/subpath>#<latest-tag> -t claude,codex`, same args
array + cwd rules as deploy (`security.md`). It rewrites the `apm.yml` dep, the
lockfile (`resolved_ref` + `resolved_commit` → new tag), and `apm outdated` then
reads `All dependencies are up-to-date`.

**Maestro's update = resolve-latest-tag + install at that tag.** Both driver
methods exist (`resolve-latest-tag` via `apm view … versions`; `deploy-skill` via
`install`) — no new apm command. Global: same with `-g` from a neutral cwd.

- **`-t` is mandatory** (as for deploy): a bare `apm update`/`install` with both
  harnesses present fails `Multiple harnesses detected: claude, codex`. Always
  pass `-t claude,codex`.
- **Same-tag re-install is idempotent *only on a clean subtree*** — prints
  `(files unchanged)`, leaves the pin. **Not safe with local edits or untracked
  files:** a same-ref `apm install` silently resets the tree to the tag and drops
  them, still printing `(files unchanged)` (see "Package divergence"). The deploy
  use-case guards this (`local-diverged-from-tag`, tree-diff); update inherits the
  refusal, so it never overwrites local edits unannounced.
- Real updates **need network + auth** (clone), like deploy — keep out of the
  fast test loop.

## Observed latest-tag resolution (Phase 0 spike, issue #10)

**Spiked against apm 0.16.0 on 2026-06-05, auth to private
`fimoklei/agent-harness`.** Fixtures: raw output
`tests/fixtures/apm-view-versions.txt`, tag-pinned lockfile
`tests/fixtures/apm.lock.tag-pinned.yaml`.

### Latest-tag — `apm view <owner>/<repo> versions`

The mechanism; **no git fallback needed.** Queries the remote (needs network +
auth for a private repo), prints every tag and branch with its short commit:

```text
│ v0.5.1 │ tag    │ 471c4b26 │
│ main   │ branch │ 41ecfe81 │
```

- **No `--json`** — a human Rich table, like `apm outdated`. Parser behind the
  driver port, integration-tested against the fixture.
- The table **mixes in branches.** Maestro keeps only `tag` rows of shape
  `vX.Y.Z` and **semver-sorts them itself**; apm's row order is not contractual
  (`v0.10.0 > v0.9.0`, which lexicographic sort gets wrong).
- The query is **repo-level**: lists the repo's tags, not those whose tree
  contains `skills/<name>`. The single-harness model needs no per-skill check.

### Package divergence — two kinds, one detectable

- **Version drift** (a newer tag exists) → `apm outdated` (above). The tracer
  consumes only this (binary behind/up-to-date).
- **Content drift** (deployed files edited/added vs the pinned tag) → **apm
  detects nothing.** `apm outdated` ignores it. The lockfile `content_hash` is
  apm-internal and **did not reproduce** (eight hashing schemes, no match) — treat
  as opaque, never recompute. A same-ref `apm install` silently **resets** the
  tree to the tag, dropping local edits + untracked files while printing
  "(files unchanged)": it remediates drift but never reports it.
  - **Decision:** the tracer detects version drift only. Fallback for content
    drift: tree-diff the deployed subtree against a fresh export of the pinned tag
    — never replicate `content_hash`.
  - **0.20.0 — `deployed_file_hashes`, spiked end-to-end (2026-06-16, issue
    #56).** Real `apm install …/skills/tdd#v0.5.1 -t claude` in a scratch
    per-repo install. The map is a reliable destination-drift mechanism: a plain
    per-file `sha256` of content (not apm-internal like `content_hash`; same hash
    across the `.claude`/`.agents` copies). Clean tree — all six entries equalled
    a live `sha256`; edited file — no longer matches its entry; untracked extra
    file — no entry at all. All three detectable.
    - **Verdict (#56):** detect destination drift by comparing
      `deployed_file_hashes` to a fresh `sha256` of each live deployed file
      (mismatch, missing file, or live file with no entry → diverged). No fresh
      tag export. **Per-repo `claude` only was run;** the global (`-g`) and
      two-tool (`.agents`) paths reuse the identical lockfile shape — the
      `.agents` copy shares the per-file hash, so the same compare applies.
    - **0.20.0 — global (`-g`) path confirmed (2026-06-18, issue #61).** Real
      `apm install …/skills/tdd#v0.5.1 -g -t claude,codex` against a sandbox
      `HOME` (never the real home). The global lockfile at `~/.apm/apm.lock.yaml`
      keys `deployed_file_hashes` **`HOME`-relative** — `.claude/skills/tdd/…`
      and `.agents/skills/tdd/…`, the *same* form as a per-repo install (keys
      relative to the deployed root, not to `~/.apm`). A live `sha256` of each
      deployed file under `HOME` matched its lockfile entry exactly. So the
      destination guard's global wiring is correct as built: deployed root =
      `HOME`, lockfile = `~/.apm/apm.lock.yaml`; a clean global skill classifies
      `clean`, not `diverged`. No wiring change was needed — the feared
      false-refusal does not occur.

### Phase 0 canary (completion gate for the deploy slices)

`apm view fimoklei/agent-harness versions` returning the tag table is the
real-apm canary. Needs network + auth to the private repo; lacking either, it
fails loudly instead of resolving a tag — the intended stop-and-report, not a
silent wrong answer.

## Global + two-tool behavior (01.2 spike, issue #28)

**apm 0.16.0, 2026-06-11 (re-verified on 0.20.0, 2026-06-13), auth to
`fimoklei/agent-harness`, `HOME` redirected to a throwaway dir** (never the real
home — see safety below). Fixtures: `apm.lock.global-two-tool.yaml`,
`apm-outdated-global.txt`, `apm-outdated-global-uptodate.txt`.

### Global scope — `-g`

`apm install <REF> -g -t claude,codex` installs to user scope. Metadata +
primitives both derive from `Path.home()` (`core/scope.py`, no env override):

- Metadata root `~/.apm/` holds `apm.yml`, `apm.lock.yaml`, `apm_modules/`.
  Lockfile shape identical to per-repo; a missing lockfile = nothing deployed
  (empty, not an error).
- A global install needs no repo, but still appends `apm_modules/` to the
  **cwd's** `.gitignore`. Run global deploys from a neutral cwd.

### Two-tool install — `claude_skill` filter survives

`-t claude,codex` (local + global) writes **one** entry, not two:
`package_type: claude_skill` with two `deployed_files` — `.claude/skills/<name>`
(claude) and `.agents/skills/<name>` (codex, via the cross-client agent-skills
dir; no `.codex/skills`). The skill lands usable for Codex.

- The reader's `package_type === "claude_skill"` filter is **not** a silent
  breaker. The change: `deployed_files` holds multiple paths, so surface a skill
  once per entry, not once per file.
- Each target is a real copied directory by default — but a directory-level
  symlink is also a working deploy path (measured on 0.20.0 and 0.25.0, impact
  analysis); apm only refuses when the *leaf skill dir itself* is a symlink
  (see the `destination-symlinked` signal above).
- `-t` takes a comma list; repeating the flag (`-t a -t b`) is unsupported (last
  wins).

### Drift, test lane, safety

- `apm outdated -g` prints the same table as per-repo, scoped to user deps.
  Consumed binary in 01.3.
- **Test lane:** user scope is `HOME`-redirectable, auth via
  `GITHUB_TOKEN=$(gh auth token)` (gh's keyring is HOME-independent). The
  integration lane runs real `-g` installs against a sandbox `HOME` — no
  fixture-only fallback.
- **Safety:** `apm uninstall -g` deleted 19 pre-existing skill dirs from a real
  `~/.claude/skills/` while the global lockfile read `dependencies: []` — it
  cleans beyond its lockfile. Never run spike `apm -g` against the real home
  (`LEARNINGS.md`).

## Global tool presence + single-tool `-t` scoping (issue #127 spike)

**Spiked against apm 0.20.0 on 2026-07-13, auth to `fimoklei/agent-harness`,
`HOME` redirected to throwaway sandbox dirs** (never the real home). Fixtures:
`apm.lock.global-single-tool.yaml` (the `-t claude`-only lockfile),
`apm-targets-claude.json` (project-scoped `apm targets --json`). Maestro's
consumption of these facts — the `ToolPresencePort` contract and per-tool
cockpit design — lives in ADR-0011 and issue #111, shipped as
`packages/core/src/tools/`; this section records only what apm does.

### `-t` is scoped literally; apm never filters by tool presence

`apm install <REF> -g -t <tokens>` writes exactly the tools named in `-t` and
never checks that a tool is installed. Target resolution takes the `-t` flag as
Priority 1 and returns those tokens verbatim
(`core/target_detection.py::resolve_targets`); the filesystem scan runs only
when `-t` is absent. Observed on a sandbox HOME with no tools present:

- `-t claude` → integrates to `.claude/skills/` **only**. No `.agents/`, no
  `.codex/`. Lockfile: 7 `deployed_files`, all `.claude/`-prefixed
  (`apm.lock.global-single-tool.yaml`). Exit 0.
- `-t claude,codex` → integrates to **both** `.agents/skills/` and
  `.claude/skills/`, exit 0, **even though Codex is not installed**. Same
  14-file two-tool shape as the 01.2 section above
  (`apm.lock.global-two-tool.yaml`); the new fact is that apm writes it on a
  machine with no Codex.
- **No error when targeting an absent tool.** apm honours `-t` as intent, not
  as a claim about the machine. The caller must filter to present tools; apm
  will not, and will not complain.

**Side effect — `-t codex` creates an empty `~/.codex/`.** The two-tool install
left an empty `~/.codex/` directory, off-lockfile (`deployed_files` lists only
`.agents/` + `.claude/`). A codex deploy therefore creates the very directory
one might use to detect Codex.

### apm cannot report which *global* tools are installed

No apm command lists user-level installed tools. Both candidates fail:

- `apm targets --json` is **project-scoped**: it scans the current working
  directory for markers (`.claude/`, `.codex/`, …) and reports each canonical
  target `active`/`inactive`. The fixture `apm-targets-claude.json` came from a
  `.claude/`-only project: `claude` `active`, every other target `inactive`. It
  answers "what does *this project* target", not "what tools does this
  *machine* have".
- A bare `apm install -g` (no `-t`) from a neutral cwd **ignores HOME
  entirely**: with `~/.claude.json` and `~/.codex/` both present in the sandbox
  HOME, apm detected neither — it fell back to the cross-client `agent-skills`
  meta-target and deployed to `.agents/skills/` only. apm's auto-detect reads
  the *project* cwd, never `Path.home()`. (This is also why "Multiple harnesses
  detected" fires only on a project dir, never on a global install.)

Consequence: whoever drives apm must detect global tool presence itself.

### Observed filesystem markers around a global deploy

Facts that constrain any presence detection (the chosen signals and their
rationale live in ADR-0011 / #111):

- A `-t claude` skill deploy writes only `~/.claude/skills/…`. It never creates
  `~/.claude.json` (Claude Code's user config; present only on a machine that
  runs Claude Code).
- A `-t codex` skill deploy writes skills to `~/.agents/skills/` and leaves an
  empty `~/.codex/`. It never creates `~/.codex/config.toml` (Codex's runtime
  config, beside `history.jsonl` + `log/`; present only on a machine that runs
  Codex).
- `~/.agents/` is purely a deploy target: it exists on a machine that only ever
  deployed, alongside a genuine `~/.codex/` on a machine that runs Codex.

So the config files (`~/.claude.json`, `~/.codex/config.toml`) survive a deploy
untouched, while the directories (`~/.claude/`, `~/.codex/`, `~/.agents/`) can
all be created *by* a deploy — a directory-based signal would read a past
deploy back as "tool installed".

## Reconciling a narrowed global install (issue #136)

Follow-up to #131: a global deploy now targets only the detected tools, but two
gaps remain for a machine that already ran the old always-`claude,codex` global
install. Both are **global-path only**; per-repo deploys are unaffected.

### The two leftovers apm does not clean

1. **Lockfile hashes survive a narrowing `-t`.** `apm install -g -t claude` over
   a lockfile written by `-t claude,codex` **keeps the `.agents` (codex)
   `deployed_file_hashes`** — apm does not prune targets outside the current
   `-t`. So the destination guard, if it scans every `DEPLOY_TOOLS` subtree,
   compares those retained `.agents` hashes against a `.agents` copy that is no
   longer on disk and mis-reads the absence as `diverged` → a legitimate
   single-tool redeploy is falsely refused (`deployed-diverged-from-lock`).
   - **Fix (built):** the guard is **scoped to the detected tools** on the global
     path. `deployTargetSubtrees(name, tools?)` filters to those tools, and
     `DeployedContentAdapter.classify({ …, tools })` filters the recorded baseline
     to the same subtrees, so an untargeted tool's retained hashes never count as
     this deploy's drift. Absent `tools` (the repo path — the only caller that
     leaves it undefined) still scans every tool — unchanged.
   - **Still true on 0.26.0** (read against the installed apm source, #191).
     `-t` never reaches the pruning decision: `_read_yaml_targets` sources the
     declared universe from the consumer's `apm.yml` alone, so
     `declared_target_profiles` returns `None` for a `--target`-only consumer —
     its docstring names this exact case, *"a `--target`-narrowed sibling
     target — preserve"* — and `_is_stale` short-circuits to preserve-all on a
     `None` declared universe. Pruning fires on a contracted `targets:` in
     `apm.yml`, on the install's own active targets, or on ghost rows for a
     known-but-undeclared target — never on `-t`. An earlier impact analysis
     suspected 0.25+ prunes here, making the scoping redundant; that rested on
     an upstream release note rather than a measurement, and is refuted.
2. **The dead files survive too.** The `.agents/skills/<name>` tree apm wrote on
   the old two-tool install stays on disk after the narrowed redeploy — exactly
   the dead tree ADR-0011 exists to eliminate.

### Safe cleanup mechanism — direct subtree `rm`, NOT `apm uninstall -g`

**Decision (grounded in the `apm uninstall -g` danger already recorded above —
it deleted 19 real skill dirs beyond its lockfile; never re-run it against the
real home).** Maestro reconciles the obsolete copy with a **direct,
subtree-scoped filesystem removal**: after a *successful* global install (the
driver verifies apm's positive `Installed N APM dependenc` marker, so a failed
install never triggers removal), `DeployedCleanupAdapter.removeSkillTargets`
`rm -rf`s exactly `<HOME>/<prefix>/skills/<name>` for each **untargeted** tool
(`untargetedTools(detected)` = `DEPLOY_TOOLS` minus detected). `force: true`
makes an already-gone copy a no-op, so a Claude-only machine reconciles on every
global deploy idempotently. **Best-effort:** the install already succeeded, so a
cleanup error does not invert the result to `deploy-failed` — it leaves the
pre-existing dead tree (no regression), which the next deploy retries. The retained lockfile hashes are left as-is (apm
owns the lockfile); scoping the guard (fix 1) makes them inert for the reader, so
hand-editing apm's lockfile — fragile and out of scope — is unnecessary.

- **Why not `apm uninstall -g -t codex`?** Unspiked and, given the recorded
  over-deletion, unsafe to trust; a filesystem `rm` of the exact known subtree is
  narrower and auditable. If a future spike proves a per-tool `apm uninstall`
  safe, it can replace the `rm` behind the same `DeployedCleanupPort`.
- **Test lane:** unit (`deploy-skill.test.ts` — cleanup invoked with the obsolete
  tool only after a successful narrowed install, never on repo deploys or a
  failed install) + integration (`deployed-cleanup.test.ts` — real `rm` under a
  sandbox HOME removes the codex subtree, leaves claude, no-op when already gone)
  + acceptance (J07 narrowing scenario). **Never the real home.**
- **Both fixes stay, and stay together.** The guard-scoping (fix 1) and this
  `rm` are current behavior, not 0.20.0 leftovers. Should a future apm version
  start pruning, the `rm` becomes *more* necessary: pruning without cleanup
  leaves deployed files on disk with no lockfile baseline, which the
  destination guard reads as divergence — a new false refusal. Never remove
  both.

## Ref grammar — a skill ref cannot carry transport (issue #152 spike, apm 0.20.0; grounding note added 2026-07-20, issue #185)

**Spiked against apm 0.20.0 on 2026-07-18** by calling apm's own reference
parser (`DependencyReference.parse`) — no network, so this is repeatable
offline. A skill is a *virtual package*: `owner/repo` plus the `skills/<name>`
subpath. Only one input form accepts that subpath, and it is the form that
accepts no transport:

| Ref | Result |
|---|---|
| `github.com/o/r/skills/tdd#v0.5.1` | parses; `virtual_path=skills/tdd` |
| `git.example:2222/o/r#v1` | **rejected** — `Use 'user/repo' or 'github.com/user/repo' … format` |
| `ssh://git.example:2222/o/r/skills/tdd#v1` | **rejected** — `A subpath cannot be embedded in a git URL` |
| `http://git.example/o/r/skills/tdd#v1` | **rejected** — same subpath error |
| `ssh://git.example:2222/o/r#v1` | parses (`port=2222`) — but no subpath, so unusable for a skill |
| `http://git.example/o/r#v1` | parses (`is_insecure=true`) — same limitation |

**The shorthand form is also host-gated.** apm reads a trailing `skills/<name>`
as a virtual package only for the host shapes it knows — `github.com` (2 path
segments) and `dev.azure.com` (3). On any other host the subpath silently
becomes part of the repo name, with no error to catch:

| Ref | `virtual_path` | `repo_url` |
|---|---|---|
| `github.com/o/r/skills/tdd#v1` | `skills/tdd` | `o/r` |
| `dev.azure.com/org/proj/repo/skills/tdd#v1` | `skills/tdd` | `org/proj/repo` |
| `gitlab.com/o/r/skills/tdd#v1` | **None** | `o/r/skills/tdd` |
| `git.example/acme/inventory/skills/tdd#v1` | **None** | `acme/inventory/skills/tdd` |

So a non-GitHub origin yields a ref naming a repo that does not exist. Maestro
narrows this further to `github.com` alone: `DeploySkill` passes only
`origin.ownerRepo` to `resolveLatestTag`, dropping the host, so `apm view`
resolves tags against GitHub regardless — the GitHub model ADR-0003 already
binds us to. `parseGitOrigin` therefore allowlists `github.com` as the one
deployable host.

So on 0.20.0, neither the shorthand nor the scheme form could carry both a
custom port and a skill subpath. **That grounding is now partly stale: apm PRs
#2210/#2211 changed apm to preserve and re-parse custom ports in git URLs and
in the shorthand form**, so the port-handling table above should be re-spiked
before being relied on for anything beyond Maestro's own decision. What has
**not** changed is the decision itself — `parseGitOrigin` still allowlists
`github.com` alone, and that's grounded in ADR-0003 (Maestro deploys only from
GitHub), not in what apm's ref parser happens to accept. apm's escape hatch is
the apm.yml `git:` + `path:` key pair — **not reachable from the CLI**: `apm
install --help` exposes no `--path` flag, and Maestro drives `install` by
argument, never by hand-writing apm.yml.

**Decision (#152): reject at parse time.** `parseGitOrigin` returns null for an
origin carrying a non-default port or an `http:` scheme, exactly as it already
does for `file:`/`git:`. **Non-default is the load-bearing word:** JS `URL`
blanks a default port only for the schemes it knows, and `ssh:` is not one — so
`ssh://host:22/o/r` keeps `port === "22"` where `https://host:443/o/r` yields
`""`. A bare `parsed.port.length > 0` test therefore refuses an ordinary SSH
remote; compare against the scheme's default instead. Connect and deploy share
that one function, so both
refuse consistently and the user hears it at connect time instead of at the
first `apm install`. Representing transport was the alternative; the table above
rules it out on observed behavior, not on preference.

## Open — observe before relying on it

- **Content-drift detection** is implemented at deploy/update time, two guards
  (#56/#57): source — refuse when the local `skills/<name>` tree differs from the
  latest tag (tree-diff via `InventoryGitAdapter`, `local-diverged-from-tag`);
  destination — refuse when the deployed copy (both `.claude` and `.agents`)
  differs from the lockfile's `deployed_file_hashes`, or has no baseline
  (`DeployedContentAdapter`; `deployed-diverged-from-lock` / `deployed-unverifiable`).
  The deploy-state/tracer view still shows version drift only.
- **Hook and MCP deploys** are unobserved. `apm mcp` is a separate command
  surface. Do not drive them until spiked the same way skills were.
- **apm 0.26.0 is the observed version** (upgraded from 0.20.0 on 2026-07-20).
  Re-verify this doc on the next upgrade. Two grades of evidence back the
  0.26.0 claims above, and they do not re-verify the same way:
  - **Re-run as a command** — the install/view signals and their fixtures
    (#182–#184), plus `apm outdated`, `apm outdated -g` and `apm targets
    --json` (#183/#184), confirmed unchanged against real output.
  - **Read against the 0.26.0 source** — ghost-entry retention on a narrowed
    `-t` (#191): `_read_yaml_targets`, `declared_target_profiles`, `_is_stale`.
    No install was run for it, so re-read those functions rather than
    re-running an install if it is ever doubted.
