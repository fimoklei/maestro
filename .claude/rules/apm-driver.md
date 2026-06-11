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

## Observed latest-tag resolution (Phase 0 spike, issue #10)

**Spiked against apm 0.16.0 on 2026-06-05, authenticated to the private
`fimoklei/agent-harness`.** Closes the former "latest tag" open item. Fixtures:
raw output in `tests/fixtures/apm-view-versions.txt`, a tag-pinned lockfile in
`tests/fixtures/apm.lock.tag-pinned.yaml`.

### Latest-tag — `apm view <owner>/<repo> versions`

The mechanism; **no git fallback needed.** It queries the remote (needs network
plus auth for a private repo) and prints every tag and branch with its short
commit:

```text
│ v0.5.1 │ tag    │ 471c4b26 │
│ main   │ branch │ 41ecfe81 │
```

- **No `--json`** — a human Rich table, like `apm outdated`. The parser sits
  behind the driver port, integration-tested against the fixture.
- The table **mixes in branches.** Maestro keeps only `tag` rows of shape
  `vX.Y.Z` and **semver-sorts them itself**; apm's row order is not contractual
  (`v0.10.0 > v0.9.0`, which a lexicographic sort gets wrong).
- The query is **repo-level**: it lists the repo's tags, not the tags whose tree
  contains `skills/<name>`. The single-harness model needs no per-skill check.

### Package divergence — two kinds, one detectable

- **Version drift** (a newer tag exists) → `apm outdated`, documented above. The
  tracer consumes only this (binary behind/up-to-date).
- **Content drift** (deployed files edited or added vs the pinned tag) → **apm
  detects nothing.** `apm outdated` ignores it. The lockfile `content_hash` is
  apm-internal and **did not reproduce** (eight hashing schemes, no match) —
  treat it as opaque, never recompute it. A same-ref `apm install` silently
  **resets** the tree to the tag, dropping local edits and untracked files, while
  printing "(files unchanged)": it remediates drift but never reports it.
  - **Decision:** the tracer detects version drift only. For content drift later,
    tree-diff the deployed subtree against a fresh export of the pinned tag —
    never replicate `content_hash`.

### Phase 0 canary (completion gate for the deploy slices)

`apm view fimoklei/agent-harness versions` returning the tag table is the
real-apm canary. It needs network plus auth to the private repo; lacking either,
it fails loudly instead of resolving a tag — the intended stop-and-report, not a
silent wrong answer.

## Global + two-tool behavior (01.2 spike, issue #28)

**apm 0.16.0, 2026-06-11, authenticated to `fimoklei/agent-harness`, run with
`HOME` redirected to a throwaway dir** (never the real home — see safety below).
Fixtures: `apm.lock.global-two-tool.yaml`, `apm-outdated-global.txt`,
`apm-outdated-global-uptodate.txt`.

### Global scope — `-g`

`apm install <REF> -g -t claude,codex` installs to user scope. Metadata and
primitives both derive from `Path.home()` (`core/scope.py`, no env override):

- Metadata root `~/.apm/` holds `apm.yml`, `apm.lock.yaml`, `apm_modules/`.
  Lockfile shape is identical to per-repo; a missing lockfile means nothing is
  deployed (empty, not an error).
- A global install needs no repo, but still appends `apm_modules/` to the
  **cwd's** `.gitignore`. Run global deploys from a neutral cwd.

### Two-tool install — `claude_skill` filter survives

`-t claude,codex` (local and global) writes **one** entry, not two:
`package_type: claude_skill` with two `deployed_files` — `.claude/skills/<name>`
(claude) and `.agents/skills/<name>` (codex, via the cross-client agent-skills
dir; there is no `.codex/skills`). The harness skill lands usable for Codex.

- The reader's `package_type === "claude_skill"` filter is **not** a silent
  breaker. The change: `deployed_files` now holds multiple paths, so surface a
  skill once per entry, not once per file.
- Each target is a real copied directory, not a symlink.
- `-t` takes a comma list; repeating the flag (`-t a -t b`) is unsupported (last
  wins).

### Drift, test lane, safety

- `apm outdated -g` prints the same table as per-repo `apm outdated`, scoped to
  user deps. Consumed binary in 01.3.
- **Test lane:** user scope is `HOME`-redirectable, auth via
  `GITHUB_TOKEN=$(gh auth token)` (gh's keyring is HOME-independent). The
  integration lane runs real `-g` installs against a sandbox `HOME` — no
  fixture-only fallback.
- **Safety:** `apm uninstall -g` deleted 19 pre-existing skill dirs from a real
  `~/.claude/skills/` while the global lockfile read `dependencies: []` — it
  cleans beyond its lockfile. Never run spike `apm -g` against the real home (see
  `LEARNINGS.md`).

## Open — observe before relying on it

- **Content-drift detection** is implemented at deploy time only: the deploy
  use-case refuses when the local `skills/<name>` tree differs from the latest
  tag (tree-diff via `InventoryGitAdapter`, per the decision above). The
  deploy-state/tracer view still shows version drift only.
- **Hook and MCP deploys** are unobserved. `apm mcp` is a separate command
  surface. Do not drive them until spiked the same way skills were.
- **apm 0.16.0 is the observed version; 0.19.0 is available** (not yet adopted).
  Re-verify this doc on upgrade.
