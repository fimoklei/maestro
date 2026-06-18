# APM driver — observed behavior (project-specific for Maestro)

How `apm` actually behaves, captured by running it — not guessed (the trap in
`LEARNINGS.md`). Read before writing code that drives `apm` or parses its
lockfile/output. Pair with `security.md` (how to shell out safely) and ADR-0003
(why tag-pinned git refs). **Verified against apm 0.20.0 (2026-06-13); re-verify
on upgrade.** Spike sections keep their original 0.16.0 dates; 0.20.0 deltas are
inline.

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
  deployed_files:               # 0.20.0: enumerates the dir AND every file
  - .claude/skills/tdd
  - .claude/skills/tdd/SKILL.md
  - .claude/skills/tdd/refactoring.md   # …one line per materialized file
  deployed_file_hashes:         # 0.20.0: NEW — per-file sha256 of content
    .claude/skills/tdd/SKILL.md: sha256:<hex>
  content_hash: sha256:<hex>
```

Deploy-state reads `resolved_ref` (version), `virtual_path` (identity + name),
`package_type` (primitive type). It does **not** read `deployed_files`, so the
0.20.0 shape change is inert for the reader — its Zod schema ignores unknown
keys (confirmed by the suite passing against refreshed fixtures).

**0.20.0 deltas (vs 0.16.0):** `deployed_files` now lists the directory *and*
every materialized file (was just the dir); `deployed_file_hashes` is new.
Unlike the opaque `content_hash`, these per-file hashes **are a plain sha256 of
file content** — identical across the `.claude`/`.agents` copies — so they look
reproducible. See content-drift note below.

## Drift — `apm outdated`

**No `--json`** (still absent on 0.20.0; new flags `-v` = available tags, `-j` =
parallel-check count). Output is a human table; the parser sits behind the driver
port, integration-tested against captured output. **Rich truncates the Package
column to terminal width** (a narrow run shows `fimoklei/agent-harn…`): capture
and parse non-TTY with a fixed `COLUMNS` (fixtures use 120); never key the parser
on the full package name surviving. Observed states:

- Tag-pinned, newer tag exists → row: `Package | Current v0.5.0 | Latest v0.5.1 |
  Status outdated | Source git tags`.
- Local-path dep → `No remote dependencies to check` (drift impossible — why
  ADR-0003 forbids local paths).
- Git unpinned → `All dependencies are up-to-date` (tracks the branch, not tags).

Maestro consumes this **binary** (behind / up-to-date), per roadmap 01.

## Update — re-install at the latest tag, NOT `apm update`

**Spiked against apm 0.20.0 on 2026-06-16**, auth to `fimoklei/agent-harness`
(scratch repo, tag-pinned `skills/tdd#v0.5.0` while `v0.5.1` existed). Fixture:
`tests/fixtures/apm-update-noop.txt`.

`apm update` **does not move an exact tag pin** — the Maestro form (ADR-0003).
`apm update [-y -t claude,codex]` on a `#v0.5.0` dep with `v0.5.1` available
printed `No dependency changes were applied.`; `apm.yml` and lockfile stayed at
`v0.5.0`. `apm update` = "refresh to latest *matching* ref", and an exact tag's
only matching ref is itself — a **no-op** for us (verified, not guessed).

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
      `.agents` copy shares the per-file hash, so the same compare applies;
      confirm when the global adapter lands.

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
- Each target is a real copied directory, not a symlink.
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
- **apm 0.20.0 is the observed version** (upgraded from 0.16.0 on 2026-06-13;
  installed via `uv tool`). Re-verify this doc on the next upgrade.
