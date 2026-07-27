# Which repo shape should the producer scaffold write? (#344)

Research input for the producer map (#343, job P1). Every claim below is
either a command captured in a sandboxed harness on 2026-07-27 against
**apm 0.26.0** (the version `docs/apm-behavior.md` describes) or a line read
in apm's installed source, cited by file and line. Nothing here is inference
presented as fact; what could not be measured is in **UNMEASURED**.

Sandbox: `HOME` redirected to a throwaway dir, no GitHub token in the
environment, and `github.com/sandbox/*` rewritten to local bare repos through
`GIT_CONFIG_KEY_*` (see Method). The real home, the real `~/.apm`, and the
real `agent-harness` were never written to.

## Recommendation

**Scaffold `.apm/skills/<name>/SKILL.md`, and make the subpath a value
Maestro detects per harness instead of the constant it is today** — because
apm 0.26.0 tells you so out loud at scaffold time ("Move publishable files
under `.apm/`"), the later primitive types have no other home, and the ref
path is part of an immutable tag, so picking the tolerated shape now buys a
migration that breaks every consumer's *update* later.

The cost is not cosmetic: the shape is carried in the deploy ref, so
ADR-0003's grammar line and five call sites in `packages/core` change with it.

## Evidence

### E1 — The deploy ref path changes with the shape (the decisive question)

apm's own reference parser, run offline over both shapes
(`captures/parse-refs.txt`):

```
$ apm-python parse-refs.py     # DependencyReference.parse(...)
github.com/sandbox/harness-root/skills/tdd#v0.1.0
    host='github.com' repo_url='sandbox/harness-root' is_virtual=True virtual_path='skills/tdd' reference='v0.1.0'
    is_virtual_subdirectory=True is_virtual_file=False
github.com/sandbox/harness-apmdir/.apm/skills/tdd#v0.1.0
    host='github.com' repo_url='sandbox/harness-apmdir' is_virtual=True virtual_path='.apm/skills/tdd' reference='v0.1.0'
    is_virtual_subdirectory=True is_virtual_file=False
```

Both parse. The `.apm/` shape makes the ref
`github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z`, and `.apm/skills/<name>`
lands verbatim in `virtual_path`. The host gate is unchanged: `github.com`
still yields a 2-segment repo and the whole tail as the virtual path
(`models/dependency/reference.py:1340-1341`), so ADR-0014's allowlist is
untouched.

### E2 — The subpath is literal. There is no discovery fallback

A `.apm/`-shaped repo installed with the root-shaped ref, and a root-shaped
repo installed at the tag that moved its skills — both fail identically
(`captures/install-apmdir-rootref.txt`, `captures/install-root-newtag-rootref.txt`):

```
$ apm install github.com/sandbox/harness-apmdir/skills/tdd#v0.1.0 -t claude
...
[i] Removed apm.yml created by the failed install.
  [x] 1 package failed:
    +- harness-apmdir-tdd -- Failed to download dependency sandbox/harness-apmdir: Subdirectory 'skills/tdd' not found in repository
[x] Installation failed with 1 error(s) in 122.8s. No install transaction changes were committed.
### exit=1
```

The "apm discovers skills under both" line in #343 is about apm reading a
package it already has on disk, not about resolving a ref. A per-skill ref
names one path and only that path. Failure is loud, exit 1, `Installation
failed`, and rolled back — the signal Maestro's driver already classifies
fail-closed.

### E3 — For skills-only today, nothing else differs. Both shapes deploy identically

Same skill, same tag, same target, one repo per shape
(`captures/install-root-shape.txt`, `captures/install-apmdir-shape.txt`):

```
$ apm install github.com/sandbox/harness-root/skills/tdd#v0.1.0 -t claude
  [+] github.com/sandbox/harness-root/skills/tdd#v0.1.0 #v0.1.0 @00b21a8d
  |-- Skill integrated -> .claude/skills/
[*] Installed 1 APM dependency in 247.2s.

$ apm install github.com/sandbox/harness-apmdir/.apm/skills/tdd#v0.1.0 -t claude
  [+] github.com/sandbox/harness-apmdir/.apm/skills/tdd#v0.1.0 #v0.1.0 @bd89abfe
  |-- Skill integrated -> .claude/skills/
[*] Installed 1 APM dependency in 246.4s.
```

Both deploy to `.claude/skills/tdd/SKILL.md`. Both write
`package_type: claude_skill`. The lockfiles differ in exactly three strings —
`virtual_path`, `owners[]`, `active_owner` — all of which carry the ref, and
none of which Maestro's deploy-state reader keys on beyond `virtual_path` as
identity (`docs/apm-behavior.md` → Lockfile). The ticket's expectation is
**confirmed**: for skills-only, nothing breaks in either shape.

`apm pack` is shape-neutral too (`captures/pack-gates.txt`): both shapes
produce `build/<name>-0.1.0/skills/tdd/SKILL.md`, byte-for-byte the same
bundle layout.

### E4 — apm 0.26.0 nudges away from the root shape, at scaffold time

`apm plugin init -y --target claude`, run in each shape
(`captures/producer-gates2.txt`):

```
## shape: root skills/
[!] Found plugin-native sources at the project root: skills/. They remain included by apm pack. Move publishable files under .apm/ when you want apm pack to source from that directory.
[*] APM project initialized successfully!

## shape: .apm/skills/
[*] APM project initialized successfully!
```

The root shape is supported, not preferred. This is the one place apm states
a preference, and it states it in the exact command the scaffold (P1) will
run.

### E5 — The later types have no root-level home for a dependency (source)

Read in the installed 0.26.0 source:

- Instructions, agents (chatmodes) and context in a **dependency** are
  scanned only under `dep/.apm/` and `dep/.github/`
  (`primitives/discovery.py:459-470`, patterns at `:57-77`). The permissive
  `**/*.instructions.md` globs are in `LOCAL_PRIMITIVE_PATTERNS`
  (`:20-39`) — the project's own tree, not a dependency's.
- Prompts: package root or `.apm/prompts/` only
  (`integration/prompt_integrator.py:21-33`).
- Hooks: type detection accepts **both** `hooks/` and `.apm/hooks/`
  (`models/format_detection.py:181-187`).
- `SKILL_BUNDLE` detection reads root `skills/` only
  (`_collect_nested_skill_dirs`, `models/format_detection.py:169-178`);
  `.apm/skills/` is served by a separate sub-skill promotion path
  (`integration/skill_integrator.py:689, 875`). This only bites whole-repo
  installs, which Maestro does not do.

So a root-`skills/` scaffold needs migrating the day the harness grows a
prompt or an instruction. A `.apm/skills/` scaffold does not. Hooks are the
exception that would work either way — but hook deploys are still unobserved
end-to-end (`docs/apm-behavior.md` → Unobserved), so that is a type-detection
fact, not a working-deploy fact.

### E6 — Already-deployed pins keep resolving after a migration; updates break

Measured on a producer that ships root `skills/` at `v0.1.0`/`v0.2.0` and
moves to `.apm/skills/` at `v0.3.0` (`captures/install-root-oldpin-after-move.txt`):

```
$ apm install github.com/sandbox/harness-root/skills/tdd#v0.1.0 -t claude
  [+] github.com/sandbox/harness-root/skills/tdd#v0.1.0 #v0.1.0 @00b21a8d
  |-- Skill integrated -> .claude/skills/
[*] Installed 1 APM dependency in 243.6s.
### exit=0
```

Tag immutability holds in practice, not just in theory: the old pin still
installs from the old tag after the move. What breaks is the *next* step —
`apm install …/skills/tdd#v0.3.0` is E2's hard failure. Combined with the
already-recorded fact that tag listing is repo-level and not filtered by tree
(`docs/apm-behavior.md` → "Latest tag — `apm view`"), Maestro's update
(resolve latest tag, re-install at it) hits the migrated tag with the stale
subpath and fails. Every deployed skill's update breaks until the consumer
side emits the new subpath.

### E7 — Five places in Maestro bake in the root shape

Grepped in this worktree:

- `packages/core/src/deploy/package-ref.ts:17` — builds the deploy ref.
- `packages/core/src/deploy/inventory-git.ts:34,41` — `skillExistsAtTag` and
  the source-drift subtree.
- `packages/core/src/inventory/inventory-reader.ts:79` — where the inventory
  is read.
- `packages/core/src/inventory/connect-inventory.ts:45` — the connect gate
  *refuses* a repo without a root `skills/` dir.
- `packages/core/src/filesystem/browse-filesystem.ts:227` — the picker's
  `hasSkillsSubdir` hint.

Destination paths are not affected: `deploy-tools.ts:87` builds
`<toolPrefix>/skills/<name>`, which E3 shows is shape-independent.

Consequence: a `.apm/` scaffold means a cockpit that today would refuse to
connect the harness it just scaffolded (`connect-inventory.ts:45`). That is
the single sharpest thing this ticket surfaces.

### E8 — The existing `agent-harness` is root-shaped throughout, and large

Read-only, no apm involved:

```
$ ls /Users/michielmerks/Projects/agent-harness/skills | wc -l
      36
$ git -C /Users/michielmerks/Projects/agent-harness tag --list
v0.1.0 v0.2.0 v0.2.1 v0.3.0 v0.4.0 v0.4.1 v0.5.0 v0.5.1
$ ls /Users/michielmerks/Projects/agent-harness
.claude/ .out-of-scope/ agents/ bundles/ docs/ hooks/ skills/ apm.yml …
```

36 skills, 8 tags, and `agents/`, `hooks/`, `bundles/` also at the root. Per
E5, that root `agents/` is already undiscoverable as a dependency primitive.

Migration cost on the consumer side, from E6: nothing already deployed
breaks; every *update* does, once, at the first tag past the move. There are
no external consumers, so the blast radius is Michiel's own registered repos.

## UNMEASURED

- **`apm outdated` after a migrating tag.** The sandbox redirect
  (`GIT_CONFIG_KEY_*`) is honoured by the install path but not by
  `outdated`'s remote check, which reached the real `github.com` and returned
  the documented `unverified` shape instead (`captures/outdated-root-oldpin-after-move.txt`:
  `Latest -`, `Status unknown`, empty Source, exit 0). So the claim "outdated
  will report v0.3.0 and Maestro will then fail to install it" rests on E2
  plus the already-recorded repo-level tag listing, **not** on a fresh
  measurement of the row.
- **A real GitHub remote.** Everything here ran against local bare repos
  behind a `url.<base>.insteadOf` rewrite. apm's GitHub-API preflight probe
  was skipped in every install ("GitHub API rate limit hit … letting the
  download step confirm the package", or "resolved via git credential
  fallback"). A shape difference that lives only in that API probe would not
  show up. Creating a throwaway public GitHub repo would settle it; that is
  an outward-facing action and was not taken.
- **Hooks and MCP end-to-end in either shape.** E5's hook claim is
  type-*detection* read from source. No hook or MCP deploy was run — still
  Unobserved per `docs/apm-behavior.md`.
- **`apm compile --validate` as a skills gate.** It exits 1 in both shapes,
  but for the same reason in neither case related to skills ("No APM content
  found" / "No instruction files found in .apm/ directory",
  `captures/producer-gates2.txt`). Whether the P3 ladder can validate a
  skill at all is a separate question this spike did not answer.
- **Whether `.apm/skills/` changes the `content_hash`/`deployed_file_hashes`
  contract.** The hashes differed between the two runs, but so did the file
  bodies (each SKILL.md names its own shape), so nothing was isolated.

## Consequences

### ADR-0003 (deploy via pinned git tags)

The decision survives — tags stay the unit. What changes is the grammar
sentence: "The Maestro form is `github.com/<owner>/<repo>/skills/<name>#vX.Y.Z`"
becomes shape-dependent, with `.apm/skills/<name>` as the scaffolded form and
root `skills/<name>` as the legacy one. E1 and E2 are the evidence. This
wants an amendment on ADR-0003, not a new ADR — the reference *mode* is
unchanged.

### ADR-0014 (GitHub-only origins)

Untouched. E1 shows the host gate and the 2-segment repo boundary behave the
same for both shapes, so `parseGitOrigin` needs no change and the allowlist
argument is unaffected.

### `docs/apm-behavior.md`

The Reference-grammar section currently states one Maestro form. It needs the
second, plus E2's failure text. Written up below rather than edited here.

### The board

Whichever shape wins, `connect-inventory.ts:45` and the four other sites in
E7 are a real code job, not a scaffold detail — the cockpit cannot today
connect a `.apm/`-shaped harness. That is the shape-detection work the
recommendation asks for, and it is bigger than P1's scaffold step.

## For docs/apm-behavior.md

New observations about apm 0.26.0 from this spike, for whoever owns that file
next (deliberately not edited here — another agent may be in it):

- **§ Reference grammar** — the virtual subpath is not fixed to
  `skills/<name>`. `github.com/<owner>/<repo>/.apm/skills/<name>#vX.Y.Z`
  parses to `repo_url` `<owner>/<repo>` and `virtual_path`
  `.apm/skills/<name>`; the host gate and the 2-segment repo boundary are
  unchanged. A `.apm` segment passes `validate_path_segments`, which rejects
  only `.` and `..`.
- **§ Install signals** — a subpath absent from the pinned tree fails
  loudly: `Failed to download dependency <owner>/<repo>: Subdirectory
  '<path>' not found in repository`, then `Installation failed with 1
  error(s)`, exit 1, and `Removed apm.yml created by the failed install` —
  a clean rollback, no partial state. Worth a fixture; there is none for
  this failure mode yet.
- **§ Lockfile** — the shape is invisible to the deploy path: both shapes
  write `package_type: claude_skill` and deploy to `.claude/skills/<name>/`.
  Only `virtual_path`, `owners[]` and `active_owner` carry the ref's
  subpath.
- **New, for the producer side** — `apm plugin init` warns when
  plugin-native sources sit at the project root: `Found plugin-native
  sources at the project root: skills/. They remain included by apm pack.
  Move publishable files under .apm/ when you want apm pack to source from
  that directory.` It does not warn on `.apm/skills/`. `apm pack` output is
  identical for both shapes (`build/<name>-<version>/skills/<name>/SKILL.md`).
- **Discovery, per type, for a dependency (source)** — instructions, agents
  and context are scanned only under `dep/.apm/` and `dep/.github/`
  (`primitives/discovery.py:459-470`); prompts under the package root or
  `.apm/prompts/` (`integration/prompt_integrator.py:21-33`); hooks under
  either `hooks/` or `.apm/hooks/` (`models/format_detection.py:181-187`);
  `SKILL_BUNDLE` detection reads root `skills/` only
  (`models/format_detection.py:169-178`).

## Method

The captures live in the throwaway sandbox, not in the repo — they are
reproducible from the scripts below and were not promoted to
`tests/fixtures/` because no test consumes them yet (`tests/fixtures/README.md`
is the home for any that later does).

Sandbox at `<scratchpad>/apm344`, scripts:

| Script | What it does |
|---|---|
| `setup-producers.sh` | two producer repos differing only in where `skills/tdd/SKILL.md` sits; each tagged `v0.1.0`, `v0.2.0`; bare clones as "remotes" |
| `add-migration-tag.sh` | moves `harness-root`'s `skills/` under `.apm/` and tags `v0.3.0` — the agent-harness migration in miniature |
| `parse-refs.py` / `run-parse-refs.sh` | apm's own `DependencyReference.parse` over six ref shapes, offline |
| `install-case.sh <case> <ref>` | fresh consumer repo, `apm install <ref> -t claude`, then dumps the tree, `apm.yml`, `apm.lock.yaml` and `apm_modules/` |
| `outdated-case.sh <case>` | `apm outdated` in an installed consumer |
| `producer-gates.sh`, `producer-gates2.sh` | `apm plugin init`, `compile --validate`, `compile --dry-run`, `targets --json` in both shapes |
| `pack-gates.sh` | `apm pack` in both shapes |

Every script redirects `HOME` into the sandbox, unsets `GITHUB_TOKEN` /
`GITHUB_APM_PAT` / `GH_TOKEN`, and exports:

```
GIT_CONFIG_COUNT=4
GIT_CONFIG_KEY_0=url.file://<sandbox>/remotes/harness-root.insteadOf
GIT_CONFIG_VALUE_0=https://github.com/sandbox/harness-root
…
```

That rewrite is what makes a `github.com/...` ref resolvable offline. It works
because apm's clone env is `{**os.environ, **self.git_env}`
(`deps/github_downloader.py:1100-1102`) and `git_env` pins only
`GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1`
(`deps/git_auth_env.py:40-78`) — it never clears the indexed
`GIT_CONFIG_KEY_*` channel. Useful for any future offline apm spike; also
worth knowing as a security note, since it is a config-injection path apm's
isolation does not close.
