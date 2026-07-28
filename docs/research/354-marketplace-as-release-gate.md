# Can a `marketplace:` block be carried purely as a release gate? (#354)

Measured 2026-07-27 against **apm 0.26.0** and **Claude Code 2.1.220**, in a
sandboxed throwaway harness (`HOME` redirected, `COLUMNS=200`). Every claim
below is either a captured command or a cited source line. Anything that could
not be measured sits under [UNMEASURED](#unmeasured).

## Verdict — NO

The literal question is **YES**: a single-skill git ref installs from a repo
carrying a `marketplace:` block exactly as it does without one — the deployed
layout, the lockfile entry, `resolved_ref`, `package_type` and `content_hash`
are identical to the control run. The block is inert for the install route.

But the plan the block was meant to buy — *apm owns version discipline through
`pack --check-versions` / `--check-clean`* — does **not** hold:

1. **The gate demands a file that breaks Maestro.** `--check-versions` reads
   each local package's own `apm.yml` `version:` and nothing else. Adding
   `skills/<name>/apm.yml` flips the installed `package_type` from
   `claude_skill` to `hybrid`, which Maestro's own reader drops — the skill
   disappears from deploy-state.
2. **The one shape that avoids that file gates nothing.** A single
   `source: ./` package makes `lockstep` compare the root `apm.yml` version
   against itself; a version of `7.7.7` on a repo tagged `v0.4.0` passes.
3. **The gate never looks at git tags.** It is pure file reading ("No git, no
   network"). Maestro deploys tag-pinned refs, so the gate cannot answer *is
   this version out yet* or *does the tag match the manifest*.
4. **It does not even check the version it publishes.**
   `marketplace.packages[].version` can say `5.5.5` while the gate reports
   "Version alignment OK" — and that is the number the generated
   `marketplace.json` advertises and Claude Code caches under.
5. **The artifact is a real second route.** The generated
   `.claude-plugin/marketplace.json` installs the same skills as Claude Code
   plugins into `~/.claude/plugins/cache/`, and through apm as `source: local`
   entries that Maestro's lockfile parser rejects outright.

So the out-of-scope line stands and **Maestro owns version handling** (#350).
One narrowing is real and worth banking: the *block* is harmless; the
*per-package files the gate demands* are what break the cockpit.

## Evidence

Sandbox: `HOME=<scratch>/354/home`, `COLUMNS=200`, producer harness at
`<scratch>/354/producer` (`git init`, `skills/tdd/SKILL.md`,
`skills/review/SKILL.md`, root `apm.yml`), tags `v0.1.0`–`v0.4.0`. The install
leg reaches a **local bare repo** through
`git config --global url.<path>.insteadOf https://github.com/sandbox-owner/harness`,
so a real `github.com/...` ref resolves offline — see UNMEASURED for what that
costs.

### 1. The block is inert for the install route

`v0.1.0` = control. `v0.2.0` = same tree plus a `marketplace:` block in the
root `apm.yml` and a committed `.claude-plugin/marketplace.json`
(`git diff --name-status v0.1.0 v0.2.0` → `A .claude-plugin/marketplace.json`,
`M apm.yml`; `skills/tdd/SKILL.md` sha identical across all tags).

```
apm install github.com/sandbox-owner/harness/skills/tdd#v0.1.0 -t claude   # control
apm install github.com/sandbox-owner/harness/skills/tdd#v0.2.0 -t claude   # marketplace block
```

Both print `[*] Installed 1 APM dependency`, both deploy
`.claude/skills/tdd/SKILL.md` and nothing else. Normalized lockfile diff — the
only difference is the commit the tag points at:

```diff
-  resolved_commit: 76bce431fc41a803b1d5ecd5ef3d39dfc176d245
+  resolved_commit: c0b85957567a7a26ee942988f2869f84e8585947
   resolved_ref: <TAG>
   version: unknown
   package_type: claude_skill
   content_hash: sha256:08639ea1b488620d946aca17ce4194514d56c15986e2f105633ff5fbba7d8d4e
```

`content_hash` is byte-identical, so apm hashed the same materialized subtree.

Also measured here: the harness's root `apm.yml` `version:` never reaches the
consumer. Both entries read `version: unknown` while the producer declared
`0.1.0` / `0.2.0` (relevant to #350's "what is in `apm.yml`'s `version:`
field").

### 2. `--check-versions` only reads per-package `apm.yml`

Source: `apm_cli/marketplace/version_check.py:147` filters to local-path
packages; `:100-128` reads `<project_root>/<source>/apm.yml` and returns
`no_apm_yml` / `missing_version` / the version string. Line 5: *"No git, no
network."*

With the two skills as `source: ./skills/tdd` / `./skills/review` and no
per-skill `apm.yml`:

```
apm pack --offline --check-versions --check-clean --dry-run
[x] Version alignment failed [strategy=lockstep, expected=0.1.0]
[i]     skills/review  <none>  [no_apm_yml]
[i]     skills/tdd  <none>  [no_apm_yml]
[x] Marketplace working tree dirty [outputs=claude]
[i]     .claude-plugin/marketplace.json  [missing on disk; would be created]
EXIT=3
```

`apm marketplace check --offline` is happy with the same config (`All 2 entries
OK`, exit 0) — only the version gate needs the extra file.

### 3. The file the gate needs breaks Maestro's reader

`v0.3.0` adds `skills/<name>/apm.yml` with a matching `version:` — the gate
then passes (`GATE_EXIT=0`). The install changes:

```diff
-  version: unknown
+  version: 0.3.0
-  package_type: claude_skill
+  package_type: hybrid
   deployed_files:
   - .claude/skills/tdd
   - .claude/skills/tdd/SKILL.md
+  - .claude/skills/tdd/apm.yml
```

apm's classifier explains it: `CLAUDE_SKILL = "claude_skill"  # Has SKILL.md,
no apm.yml` vs `HYBRID = "hybrid"  # Has both apm.yml and SKILL.md (root)`
(`apm_cli/models/validation.py:25,27`).

Run against Maestro's own parser
(`packages/core/src/lockfile/lockfile.ts`, `parseLockfile` +
`claudeSkillName`, executed with `node --experimental-strip-types`):

| lockfile | `parseLockfile` | `claudeSkillName` |
|---|---|---|
| control `v0.1.0` | ok | `tdd` |
| marketplace block `v0.2.0` | ok | `tdd` |
| + per-skill `apm.yml` `v0.3.0` | ok | **null** |
| + `.claude-plugin/plugin.json` `v0.4.0` (`package_type: marketplace_plugin`) | ok | **null** |
| installed via the marketplace route | **fails** | — |

`claudeSkillName` returns null for any `package_type` other than
`claude_skill` (`lockfile.ts:59`), so the deployed skill vanishes from
deploy-state while sitting on disk. Three producer-side shapes cause it:
a per-skill `apm.yml`, a per-skill `.claude-plugin/plugin.json`, and the
marketplace install route.

### 4. A single `source: ./` package is a tautology

One package covering the whole repo needs no per-skill `apm.yml` and passes —
but it compares the root `apm.yml` against itself:

```
# root apm.yml: version: 0.3.0, packages: [{name: sandbox-harness, source: ./}]
[*] Version alignment OK [strategy=lockstep, expected=0.3.0]
[i]     .  0.3.0  [matches]                                        EXIT=0
# root apm.yml version changed to 7.7.7, tags in the repo are v0.1.0..v0.4.0
[*] Version alignment OK [strategy=lockstep, expected=7.7.7]
[i]     .  7.7.7  [matches]                                        EXIT=0
```

It only bites once you add a second version field for it to disagree with
(`marketplace.version: 1.0.0` over a root `7.7.7` → `[drift:expected=1.0.0]`,
exit 3). A gate whose only failure mode is a field you introduced for the gate
is ceremony.

### 5. The published version is not gated

`marketplace.packages[].version` set to `5.5.5`, root and per-skill `apm.yml`
left at `0.2.0`, then `apm pack --offline` and the gate:

```
[*] Version alignment OK [strategy=lockstep, expected=0.2.0]
[*] Marketplace working tree clean [outputs=claude]              EXIT=0
$ grep '"version"' .claude-plugin/marketplace.json
      "version": "5.5.5",
      "version": "5.5.5",
```

That field is what consumers see: Claude Code cached the plugin under
`~/.claude/plugins/cache/sandbox-harness/tdd/0.3.0/` — the directory name is
the `marketplace.json` version.

### 6. `--check-clean` is honest but narrow

It compares the on-disk artifact against a fresh regeneration; it does not
consult git (an *untracked* `marketplace.json` counts as clean). Measured
outcomes:

| Change | Exit |
|---|---|
| `marketplace.json` absent | 4 (`missing on disk; would be created`) |
| present and matching | 0 |
| **a SKILL.md edited, nothing else** | **0** |
| versions bumped in `apm.yml`, artifact stale | 4 (`plugins[0].version "0.1.0" -> "0.2.0"`) |
| regenerated with `apm pack --offline` | 0 |

So the feared "exit 4 on every edit" is **not** real — the artifact only tracks
the `marketplace:` block. Equally, it gates nothing about the skills. When both
gates fail the exit code is 3; `--check-versions` wins.

### 7. The three strategies

Schema: `_VERSIONING_STRATEGIES = {"lockstep", "tag_pattern", "per_package"}`,
default `lockstep` (`marketplace/yml_schema.py:252,302,623`);
`apm marketplace init` writes no `versioning:` block at all.

| Strategy | What it demands | Two skills, one repo-wide tag | One package |
|---|---|---|---|
| `lockstep` | every package's `apm.yml` `version` == the marketplace version | works, and is the honest fit for a repo-wide tag — but every skill needs its own `apm.yml` | passes; a tautology when `source: ./` |
| `tag_pattern` | rendered tags unique across packages | **fails** on the default `v{version}` (`duplicate_tag:other=skills/tdd`, exit 3); needs a per-package `tag_pattern: "{name}-v{version}"`, i.e. per-skill tags — the opposite of one repo-wide tag | passes (nothing to collide with) |
| `per_package` | a `version` field, nothing more | passes with `0.2.0` and `9.9.9` side by side | passes |

None of them checks a git tag. For "one repo-wide tag over many independent
skills", `lockstep` is the only strategy that means anything — and it is the
one that forces the `package_type`-breaking `apm.yml` into every skill dir.

### 8. The generated manifest is a working second route

```
apm marketplace add <producer> --name sandbox      # local-directory sources are supported
apm marketplace browse sandbox                     # lists tdd + review, "Install: tdd@sandbox"
apm install tdd@sandbox -t claude
```

Deploys the same `.claude/skills/tdd/` — but the lockfile entry is a different
species: `repo_url: _local/tdd`, `source: local`, `local_path: <abs path>`,
`discovered_via: sandbox`, `marketplace_plugin_name: tdd`,
`package_type: hybrid`, and **no** `resolved_ref` and **no** `virtual_path`.
Maestro's `lockfileEntrySchema` requires both, so `parseLockfile` returns
`{ ok: false }` for the whole file — one marketplace-route install makes the
entire repo's deploy-state unreadable, not just that skill.

Claude Code 2.1.220, same sandbox home:

```
claude plugin validate .            # -> Validation passed with warnings (exit 0)
claude plugin validate ./skills/tdd # -> No manifest found in directory (validation failed)
claude plugin marketplace add <producer>   # Successfully added marketplace: sandbox-harness
claude plugin install tdd@sandbox-harness  # Successfully installed (scope: user)
claude plugin details tdd@sandbox-harness  # Component inventory: Skills (1) tdd
```

So the apm-generated manifest passes Claude Code's marketplace validator and
the plugin **does** load with the skill, even though the source dir is not a
valid plugin on its own. The skill then lives at
`~/.claude/plugins/cache/sandbox-harness/tdd/0.3.0/`, recorded in
`~/.claude/plugins/{known_marketplaces,installed_plugins}.json` — invisible to
apm's lockfiles and therefore to Maestro. Per Claude Code's docs a marketplace
is never auto-read; a user must add it
(<https://code.claude.com/docs/en/plugin-marketplaces>, fetched 2026-07-27) —
so the second route is opt-in, not automatic. It also refines the map's line
"a marketplace installs a package, never a single skill": with
`source: ./skills/<name>` it installs exactly one skill. The mismatch is not
granularity, it is **shape** — local path, no tag, no drift.

### 9. `apm compile` writes only when there is content, and `--validate` writes nothing

In the skills-only harness (no `.apm/`), both `apm compile --validate` and bare
`apm compile` print `[x] No APM content found to compile` and exit **1**,
touching nothing (`git status` unchanged). With one
`.apm/instructions/sandbox.instructions.md` present:

| Command | Exit | Files written |
|---|---|---|
| `apm compile --validate` | 0 | none |
| `apm compile --dry-run` | 0 | none |
| `apm compile` | 0 | `AGENTS.md` at the repo root |

`--validate` is enough as a CI check and is the only one of the three that is
both safe and non-trivial — but on a skills-only harness it exits 1, so a
producer pipeline that runs it must treat "no APM content" as a pass.

`apm pack --target claude --dry-run` wrote no `plugin.json`; it only announced
`marketplace.json`, and warned `--target is deprecated`. The producer `apm.yml`
had no `target:`/`targets:` block, which is the branch pack's help ties
`plugin.json` to — see UNMEASURED.

## UNMEASURED

- **A real `github.com` install of a marketplace-carrying repo.** Every install
  ran against a local bare repo via `url.<path>.insteadOf`; apm's HTTP legs
  404'd and it fell back to git, printing `[!] API validation skipped for
  sandbox-owner/harness/skills/tdd#<tag>; resolved via git credential
  fallback`. Creating a GitHub repo is an outward-facing action outside this
  ticket's mandate, so the API-validated path is unmeasured. What the debug log
  does show: every API probe was for `skills/tdd/*`
  (`raw.githubusercontent.com/.../skills/tdd/apm.yml`,
  `api.github.com/repos/.../contents/skills/tdd/...`) — the root `apm.yml` was
  never fetched, so there is no probe that could observe a root-level
  `marketplace:` block. Evidence, not proof.
- **A git-hosted marketplace's install route.** Measured only with a
  local-directory marketplace, so the `_local/…` + `source: local` lockfile
  shape may differ when the marketplace itself is a git source. The conclusion
  that it is a *second* route does not depend on that; the exact entry shape
  does.
- **`apm pack` writing `plugin.json`.** The producer `apm.yml` carried no
  `target:`/`targets:` block, so that branch never ran.
- **`apm marketplace outdated` on local packages.** Rows read
  `[x] … Git authentication failed during ls-remote` while the summary printed
  `[i] All packages are up to date`, exit 0. Why local-path entries triggered
  `ls-remote` at all, and whether the fail-open summary reproduces with a
  token, is unestablished (one run, no token in the sandbox).
- **`apm compile` on the real `agent-harness`.** Only the sandbox harness was
  measured; the real repo's `.apm/` content, if any, decides what `compile`
  would write there.
- **Runtime behaviour of the plugin route.** `claude plugin details` reports
  `Skills (1) tdd`; no session was run to see the skill fire.
- **Hooks and MCP as marketplace packages.** Untouched, per
  `docs/apm-behavior.md` → "Unobserved".

## Consequences

### For #350 (which version does Maestro propose)

- **#350 is unblocked in this direction and its premise holds.** apm's version
  gates cannot be inherited: they never read a git tag, and the only strategy
  that fits one repo-wide tag over many skills requires a per-skill `apm.yml`
  that costs the skill its `claude_skill` classification. Maestro owns the
  version proposal.
- **A hard constraint for the design:** `skills/<name>/` must stay free of
  `apm.yml` and `.claude-plugin/plugin.json`. Either one changes
  `package_type` and the deployed skill silently leaves the cockpit's view.
- **A measured answer to one of #350's bullets:** the harness's root `apm.yml`
  `version:` is invisible to consumers on the git-ref route — the lockfile
  reads `version: unknown`. The only way a version reaches a consumer entry is
  the per-skill `apm.yml`, and that is the shape that breaks the reader. So a
  per-skill version is **not** reachable on the git-ref route without paying
  that price.

### For the map's Out-of-scope section (#343)

The "not out of scope, and deliberately so" carve-out closes with a **no**.
Suggested replacement for that paragraph:

> **Answered (#354, 2026-07-27):** carrying a `marketplace:` block purely as a
> release gate does not work. The block itself is inert for the install route
> (measured: byte-identical lockfile and layout), but
> `pack --check-versions` reads only per-package `apm.yml` versions, never git
> tags, and the per-skill `apm.yml` it needs flips `package_type` to `hybrid`,
> which Maestro's deploy-state reader drops. Version handling stays Maestro's.
> Producer harnesses must keep `apm.yml` and `.claude-plugin/plugin.json` out
> of `skills/<name>/`.

### For the ADR-0001 tension

It does not resolve — it dissolves. apm's version discipline lives entirely in
the marketplace/package unit; the tag-pinned git-ref route apm also supports
has **no** version gate at all. Maestro proposing a version is therefore not
reimplementing apm; there is nothing on this route to reimplement. What Maestro
must not do is invent installing, pinning or lockfiles — and it still doesn't.
Worth recording in the version ADR when #350 lands.

### New questions worth their own ticket

1. **`package_type` is the cockpit's blind spot.** Three producer-side shapes
   (`hybrid`, `marketplace_plugin`, marketplace-route `source: local`) make a
   deployed skill either invisible or unreadable, silently. Two of them are
   things a well-meaning harness author would do. Does Maestro warn, or keep
   dropping them?
2. **One marketplace-route install poisons the whole read.** Maestro's
   `lockfileEntrySchema` requires `resolved_ref` + `virtual_path` on *every*
   entry, so a single `source: local` dependency makes the entire repo's
   deploy-state unreadable rather than showing the rest. That is a
   fail-closed-too-hard call worth revisiting on its own.

## For `docs/apm-behavior.md`

New apm-0.26.0 observations from this ticket (another agent owns that file —
these are the lines to fold in, not written there here):

- **`package_type` is content-derived, not declared.** `claude_skill` =
  `SKILL.md` and no `apm.yml`; `hybrid` = both; `marketplace_plugin` = a
  `plugin.json` or `.claude-plugin/` in the package root
  (`apm_cli/models/validation.py:24-30`). A producer adding `apm.yml` or
  `.claude-plugin/plugin.json` inside `skills/<name>/` changes the installed
  `package_type`, adds those files to `deployed_files`, and — with a per-skill
  `apm.yml` — replaces the lockfile's `version: unknown` with that file's
  version.
- **A `marketplace:` block in the source repo's root `apm.yml` is inert for a
  virtual-package install.** Control vs marketplace tag differ only in
  `resolved_commit`; `content_hash` matches byte for byte.
- **`apm pack` release gates.** Exit 3 = version alignment (wins over 4),
  exit 4 = artifact drift, both composable with `--dry-run`, which never
  writes. `--check-versions` reads only local-path packages' own `apm.yml`
  `version:` — no git, no network (`marketplace/version_check.py:5,100-147`) —
  and never checks `marketplace.packages[].version`, the value that lands in
  `marketplace.json`. `--check-clean` diffs the on-disk artifact against a
  fresh pack and ignores git, so an untracked artifact reads clean and a
  SKILL.md edit never dirties it.
- **`versioning.strategy` defaults to `lockstep`** and
  `apm marketplace init` writes no `versioning:` block
  (`marketplace/yml_schema.py:252,302,623`). `tag_pattern` fails closed on
  colliding rendered tags; `per_package` only requires the field to exist.
- **The marketplace is a second install route.** `apm install <name>@<mkt>`
  from a local-directory marketplace writes an entry with `source: local`,
  `local_path`, `discovered_via`, `marketplace_plugin_name`, no `resolved_ref`
  and no `virtual_path`.
- **`apm compile`** exits 1 with `No APM content found to compile` on a
  skills-only repo; with `.apm/instructions` present, `--validate` and
  `--dry-run` write nothing and bare `compile` writes a root `AGENTS.md`.
- **`apm marketplace outdated`** printed `[x]` rows carrying
  `Git authentication failed during ls-remote` and still summarised
  `All packages are up to date`, exit 0 — a fail-open summary, seen once.
- **Offline harness for spikes.** A `github.com/<owner>/<repo>/...#<tag>` ref
  can be pointed at a local bare repo with
  `git config --global url.<path>.insteadOf https://github.com/<owner>/<repo>`.
  apm's HTTP probes 404 and it falls back to git, printing
  `[!] API validation skipped … resolved via git credential fallback` plus
  `Partial clone (--filter=blob:none) failed … retrying with full bare clone`.
  Useful for measuring install shape without a network repo; it does not
  exercise apm's API-validation path.

No fixtures were promoted from this spike, so `tests/fixtures/README.md` is
unchanged. The capture scripts are throwaway (sandbox scratchpad) — the
commands are inline above.
