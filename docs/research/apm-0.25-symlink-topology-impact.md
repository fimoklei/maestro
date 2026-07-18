# Impact analysis — apm 0.20.0 → 0.25.0 and the shared skills directory

Research input for the upcoming specs: (1) honest deploy failures, (2) apm
0.25 adoption, (3) shared skills directory (one source, many tools). Every
"measured" claim below was verified on 2026-07-18 against real apm runs in
sandbox HOMEs (never the real home); "release-note claim" marks the few facts
taken from microsoft/apm release notes without a local rerun.

## Context

Maestro's apm knowledge (`.claude/rules/apm-driver.md`, fixtures, driver code)
is verified against apm 0.20.0. apm is now at 0.25.0 (2026-07-12). Separately,
the owner's machine keeps all skills in one canonical `~/.agents/skills/` tree
with `~/.claude/skills/*` as symlinks — a topology apm's skill integrator
refuses to deploy into, which broke every global deploy from the cockpit.

Both threads meet in one upstream fact: **apm has converged skills for almost
every target onto a shared `.agents/skills/` directory** (v0.22.0, "skills-path
convergence"; feature request microsoft/apm#891 closed as superseded by it).
Codex, Copilot, Cursor, Gemini, OpenCode, Windsurf, and Antigravity all deploy
skills to `.agents/skills/`; a `--legacy-skill-paths` flag (or
`APM_LEGACY_SKILL_PATHS=1`) restores per-client directories. **Claude is the
one exception** — its target profile has no `deploy_root`, so skills still go
to `.claude/skills/`, because Claude Code does not read `.agents/skills/`.

## The topology decision (grill outcome, 2026-07-18)

Replace the 57 per-skill symlinks in `~/.claude/skills/` with **one
directory-level symlink** `~/.claude/skills -> ~/.agents/skills`. Measured on
both 0.20.0 and 0.25.0:

| Probe (sandbox HOME) | apm 0.20.0 | apm 0.25.0 |
| --- | --- | --- |
| Leaf symlink (`.claude/skills/47` is a link) | refused: "is a symlink -- refusing to deploy"; output still says "Installed 1 APM dependency … with 1 error(s)" | refused, now honestly: "[x] Installation failed with 1 error(s) … No install transaction changes", exit 1 |
| Directory symlink (`.claude/skills` is a link) | **install succeeds** | **install succeeds** |
| `-t claude,codex` through the directory symlink | one physical write; apm's resolved-path dedup skips the second target | same |
| Lockfile paths recorded under the directory symlink | unresolved: `.claude/skills/47` | resolved: `.agents/skills/47` |

Why it works: apm's integrator rejects only a symlink at the *leaf* skill dir;
an ancestor symlink passes as long as the resolved path stays inside the
deploy root (HOME for `-g`), and a resolved-path dedup collapses targets that
point at the same physical directory (read from
`src/apm_cli/integration/skill_integrator.py` at v0.25.0, then confirmed by
the installs above).

## Delta 1 — driver and parser surfaces (measured against 0.25.0)

| Surface | Assumption today (0.20.0) | 0.25.0 result | Verdict |
| --- | --- | --- | --- |
| `INSTALL_SUCCESS_MARKER` (`apm-cli-driver.ts:40`) | success = `Installed \d+ APM dependenc` in output, never exit code | success output unchanged; failures no longer print the marker at all | **survives**, and gets safer: 0.20.0's trap output ("Installed … with 1 error(s)") is gone |
| Install failure signal | apm exits 0 on failed install; fail-closed marker check compensates | failed install exits **1** with "[x] Installation failed … No install transaction changes" | **survives**; exit code is now also meaningful. `apm-driver.md`'s "exits 0 even when the install fails" is **outdated** |
| Auth phrases (`apm-cli-driver.ts:34`) | `Authentication failed` / `No token available` on `apm view`, exit 1 | identical phrases, exit 1 | **survives** |
| `apm view … versions` parser (`latest-tag.ts`) | Rich table, `│ vX.Y.Z │ tag │` rows | identical table | **survives**. Caveat: v0.23.0 routes `view versions` to a registry *when a default registry is configured* — Maestro configures none |
| `apm outdated` parser (`parse-outdated.ts`) | 5-cell rows, `outdated`/`unknown` statuses, up-to-date / no-remote banners, "could not be checked" summary | identical table, banners, and no-auth `unknown` row (empty Source cell) | **survives** |
| Lockfile schema (`lockfile/lockfile.ts`) | requires `resolved_ref`, `virtual_path`, `package_type`; tolerates unknown keys | new per-entry `name` + `version` fields and a new top-level `deployments:` block (kind/target/scope/owners per deployed path); required keys unchanged | **survives** (Zod ignores unknowns). `deployments:` is new signal — see Delta 3 |

Net: **no Maestro parser breaks on 0.25.0.** The upgrade cost is fixture
refreshes and rewriting the stale claims in `apm-driver.md`, not code surgery.

## Delta 2 — what 0.25.0 makes obsolete or wrong in Maestro

- **`apm-driver.md` is stale in at least four places** (it is pinned to
  0.20.0 and says "re-verify on upgrade"): the exit-0-on-failure claim; the
  "Each target is a real copied directory, not a symlink" observation (still
  true of what apm *writes*, but the directory-symlink topology is now a
  supported-in-practice deploy path); the two-tool 14-file lockfile shape
  (under the shared directory it collapses to one deduped copy); the lockfile
  field list (missing `name`, `version`, `deployments:`).
- **The #136 guard-scoping may be double protection.** v0.25.0 "drop
  inactive-target ghost entries from lockfile deployed_files" (microsoft/apm
  PR #2114, release-note claim — verify during the upgrade spec) makes apm
  prune what Maestro's tools-scoped guard (`deployTargetSubtrees(name, tools)`,
  `scopeHashesToSubtrees`) was built to neutralize. The Maestro scoping stays
  correct either way; the reconciliation `rm` in `deployed-cleanup.ts` needs
  re-judging under the new topology (see Delta 3).
- **0.20.0-era fixtures to refresh on upgrade:** `apm-install-ok.txt`,
  `apm-install-probes-failed.txt` (failure text changed), the three lockfile
  fixtures (`apm.lock.tag-pinned*.yaml`, `apm.lock.global-*.yaml` — add the
  new fields), and re-capture of `apm-outdated-*.txt` / `apm-view-*.txt`
  (byte-identical formats observed, refresh is hygiene not necessity).

## Delta 3 — what the shared directory breaks in Maestro (topology impact)

These hold on **both** apm versions; the lockfile-path difference decides *how*
they show, not *whether*.

1. **Per-tool attribution reads the wrong story.**
   `group-primitives-by-tool.ts` attributes a lockfile entry to a tool by
   `deployed_files` path prefix (`.claude/` → claude, `.agents/` → codex).
   Under the shared directory apm records **one** prefix (0.20.0: `.claude/`;
   0.25.0: `.agents/`), so the cockpit shows the skill under exactly one tool
   and an empty card for the other — while both tools read the same physical
   copy. ADR-0011's premise "a skill can genuinely exist in one tool and not
   the other" is structurally false in this topology; the ADR needs an
   amendment and `CONTEXT.md`'s **Target** / **Global deploy** definitions
   need the "one source, many readers" case. The new `deployments:` block
   (`target: agents`) is a candidate replacement signal for prefix-sniffing.
2. **The destination drift guard loses its baseline.**
   `DeployedContentAdapter.classify` scans per-tool subtrees and scopes
   recorded `deployed_file_hashes` to the same subtrees. On 0.25.0 the hashes
   are keyed `.agents/...` only; a scan scoped to `.claude/skills/<name>`
   (which exists, through the symlink) finds files with no recorded baseline →
   `deployed-unverifiable` → legitimate redeploys refused. The guard must
   compare on **resolved** paths, or treat the symlinked subtree as an alias
   of the canonical one.
3. **Cleanup can delete the source.** `deployed-cleanup.ts` `rm -rf`s the
   untargeted tool's `~/.agents/skills/<name>` after a narrowed global
   install. Under the shared directory `.agents` is the *source* every tool
   reads, not a dead copy — losing the Codex presence marker
   (`~/.codex/config.toml`) would make Maestro delete the real tree. ADR-0011's
   "the untargeted copy is dead wood" assumption must be withdrawn for the
   shared-directory topology; cleanup must never remove a subtree that another
   tool's directory resolves into.
4. **Drift detection currently agrees by coincidence.** `scanSubtrees` follows
   symlinks, hashing the same files under two keys that happen to match the
   lockfile's two identical hashes. Correct outcome, accidental mechanism, no
   test covering the topology — the topology-aware read should make this
   deliberate.

## Delta 4 — the defect that stands regardless

The blanket `catch` in `deploy-skill.ts` (deploy use-case) flattens every apm
install failure into one generic `deploy-failed` → "The deploy could not be
completed. Check apm and try again." apm's precise reason (here: "Skill
destination … is a symlink") is discarded. This is version- and
topology-independent and is the first thing to ship. 0.25.0's meaningful exit
codes and honest failure output make the fix cleaner but are not a
prerequisite.

## Harvest — new apm capabilities, candidate job stories (not for these specs)

From the 0.21.0–0.25.0 release notes; none observed locally yet (the
`apm-driver.md` rule applies: spike before driving).

- **`apm audit` with unmanaged-artifact + drift replay** (v0.21.0 #1793,
  integrity policy keys `require_hashes` / `fail_on_drift` #1794): apm-native
  content-drift visibility — directly relevant to the board's open "See local
  divergence from central" and could replace parts of Maestro's own tree-diff
  approach.
- **Lifecycle hooks framework** (v0.23.0 #1798): a general hooks surface —
  input for the unobserved "Hook deploys" gap in `apm-driver.md`.
- **`apm config target`** (v0.22.0 #1881): a user-configurable default install
  target — interacts with ADR-0011's "presence, not choice"; worth a position
  before a user sets it underneath Maestro.
- **Registry as install source** (v0.22.0–0.23.0): default-registry routing
  for shorthands and `view versions` — a future third form of **Inventory
  source** next to local clone and git URL.
- **New first-class targets** (Windsurf, Antigravity, Kiro, Cursor, Copilot
  variants): the shared `.agents/skills/` directory means "add a tool" is
  increasingly a presence-detection + read-attribution question, not a new
  deploy path — lowers the cost of widening beyond claude/codex.
- **SBOM export + license recorder** (v0.21.0 #1820): governance/team-scale
  material, aligns with the future "Required/Optional primitive" concepts.
- **`CLAUDE_CONFIG_DIR` honored for user scope** (v0.22.0+ #1863/#2096):
  presence detection via `~/.claude.json` stays valid, but path assumptions
  about `~/.claude/` should read the env var when set.

## Recommended spec order (confirmed in the grill)

1. **Honest deploy failures** — Delta 4. Small, independent, ships first.
2. **apm 0.25 adoption** — Delta 1 + 2: upgrade, refresh fixtures, reground
   `apm-driver.md`, verify the #2114 pruning claim, re-run the real-apm
   canaries.
3. **Shared skills directory** — Delta 3 + the machine migration (57 leaf
   symlinks → one directory symlink) + ADR-0011 amendment + `CONTEXT.md`
   updates. Built against 0.25.0 behavior, hence after (2).

Side findings for the inventory repo (`agent-harness`), out of scope here:
tag v0.5.1's `skills/47/` contains a stray nested `47/SKILL.md` duplicate.
