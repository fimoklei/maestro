# Maestro

Glossary for Maestro's domain language. The canonical reference when other docs talk about primitives, deployment, and the cockpit. One sentence per term. Implementation details belong in specs, not here. When a doc disagrees with this file on a term, this file wins.

## Language

**Maestro**:
The product — a visual cockpit to see and steer your AI agent setup across repositories and tools. Maestro sits on top of [APM](https://microsoft.github.io/apm/) and does not replace it.
_Avoid_: harness (that is the inventory repo, not the product), package manager, prompt library.

**Cockpit**:
Maestro's core surface: the place where you see what you have, see what is deployed where, and deploy or update from one location. The thing APM lacks.
_Avoid_: dashboard (acceptable casually, but "cockpit" implies steering, not just viewing), UI, console.

**APM**:
The Agent Package Manager (`microsoft/apm`) — the engine underneath Maestro. Owns retrieval, install, sync/update, version pinning, the lockfile, multi-tool targeting, and install-time policy. Maestro drives APM; it never reimplements it (see ADR-0001).
_Avoid_: installer (too narrow), backend.

**Primitive**:
An umbrella term for the reusable agent-capability units Maestro manages: **Skill**, **Hook**, and **MCP server**. The unit you see in the inventory and choose to deploy.
_Avoid_: artifact (too generic), capability (too abstract), asset.

**Skill**:
A directory containing a `SKILL.md` file (YAML frontmatter + Markdown body) that teaches an AI coding assistant how to perform a specific task according to your standards. Conforms to the open skill surface.
_Avoid_: prompt, rule, instruction.

**Hook**:
A primitive that runs a script at a defined point in the assistant's lifecycle (e.g. a code-quality check). Packaged with its config and scripts.
_Avoid_: trigger, plugin (a hook is one packaged thing, not the whole plugin concept).

**MCP server**:
A Model Context Protocol server declared as a primitive so it can be deployed into a target's tool config.
_Avoid_: integration, connector.

**Central inventory**:
The single curated, production-ready collection of primitives, held in the **Harness** Git repository. The source you deploy *from*. "Central" means curated and ready to deploy — not a draft scratchpad, because a consumer only ever sees the **Released harness**.
_Avoid_: skills repo, library, catalog (a catalog is passive; the inventory is the governed source).

**Harness**:
The Git repository the team writes primitives into — the same repository the **Central inventory** names, seen from the author's side instead of the consumer's. Skills live at `.apm/skills/<name>`, and a repository counts as a harness when `apm.yml` sits in its root (ADR-0021).
_Avoid_: harness in APM's sense (there it means the agent platform — Claude, Copilot, Cursor — the end primitives *arrive* at, not depart from), skills repo.

**Working harness**:
The harness as it stands right now, uncommitted edits included. The only state Maestro writes into, and the one that carries no quality promise (ADR-0021).
_Avoid_: draft, scratchpad, local inventory.

**Released harness**:
The harness at its latest published tag. The only state consumers deploy from, and the only one the **Curated / Production-ready** bar applies to (ADR-0021, ADR-0003).
_Avoid_: published inventory, catalogue, main (a merge is not a release).

**Inventory source**:
The connection that points Maestro at the Central inventory: an existing local Harness clone, a GitHub repository to clone, or an empty GitHub repository to scaffold; a parseable git origin and resolvable default branch are required before the connection is accepted (#553–#556). Found and joined sources land in Inventory; a scaffolded source lands in Harness. Deploys never write back to the source, while joining and scaffolding write (ADR-0015).
_Avoid_: inventory path (too narrow — names only today's local-path form), connection.

**Connect gate**:
The single mandatory first-run moment — a welcome and the connect form — where the **Inventory source** is set; found and joined sources land in Inventory, while a scaffolded source lands in Harness, and the gate is unreachable once configured (ADR-0015, #557). Registering targets and deploying are cockpit work, not part of the gate.
_Avoid_: wizard (the retired multi-step shape), onboarding flow, setup flow.

**Curated / Production-ready**:
The quality bar for anything in the **Released harness**: structurally valid, not repo-specific, and admitted through the loop at the moment it was needed — one primitive per promote, checked by the curator at **promote** (#623). The **Working harness** carries no such promise — a tag is where the promise is made (ADR-0021). In MVP1 the curator is one person (the owner) and the bar is written in the harness's own `CONTRIBUTING.md`. The path from contribution to curated is the future governed lifecycle.
_Avoid_: published, approved (those name the future lifecycle step, not the state).

**Bundle**:
A named set of primitives composed from the central inventory for scoped deployment (e.g. `frontend`, `engineering-stack`). The convenient unit to deploy together.
_Avoid_: skill group, category, tag, profile.

**Deploy**:
The act of reproducing a primitive or bundle from the central inventory into a target, via APM. The deployed copy is generated, never hand-edited.
_Avoid_: install (that is APM's verb for the mechanism), copy, sync.

**Unsupported deployment**:
A deployed APM lockfile entry whose package type Maestro cannot manage as the requested **Primitive**, even though APM materialized files in the **Target**.
_Avoid_: skipped entry (reader mechanics), failed deploy, successful deploy.

**Remove**:
The act of undoing a **Deploy**: the primitive disappears from each target and from that target's lockfile bookkeeping, via APM. Scoped to one or more targets — one action can retire a primitive from every target it is deployed to, walking them one at a time and reporting per target what happened. Scoped to targets either way: removing a deploy never touches the central inventory copy. A global remove covers the full set of detected tools, mirroring how a global deploy targets them as one set.
_Avoid_: undeploy (constructed jargon), uninstall (APM's verb for the mechanism), delete (ambiguous with deleting from the central inventory).

**Target**:
Where a deploy lands. Two kinds: **local** (a consuming repo) or **global** (the user-level config of a present tool). A global deploy resolves to one target per detected tool, so "global" can be several targets on a two-tool machine and one on a single-tool machine (ADR-0011).
_Avoid_: destination, environment.

**Empty target**:
A target with nothing deployed to it yet — its deploy-state read cleanly and found zero primitives. Its own state, distinct from **Drift**'s "unknown" (a check that could not run) and from "in sync" (deployed primitives that all match the central inventory): an empty target has nothing to be behind, so a confirmed-empty deploy-state overrides the drift check. The first reading a freshly-registered consuming repo shows.
_Avoid_: unknown, uninitialized.

**Local deploy**:
A deploy scoped to one **consuming repo** — the primitive becomes available only inside that project.
_Avoid_: repo install, project-level.

**Global deploy**:
A deploy scoped to the user-level config of the AI coding tools the user actually has — the primitive becomes available across all of that user's work in those tools. The tools are **detected live** (ADR-0011): a machine with both Claude Code and Codex targets both; a Claude-only machine targets only Claude Code, and no `.agents` copy is written. "Global" is the set of present tools, not a single opaque destination.
_Avoid_: system-wide, machine install, "always both tools" (the reversed pre-ADR-0011 rule).

**Consuming repo**:
A project that receives locally-deployed primitives from the central inventory.
_Avoid_: target repo (ambiguous with "target"), client repo.

**Consuming-repo registry**:
The explicit list of consuming-repo paths Maestro tracks to build the per-repo deploy-state view. User-maintained — Maestro adds nothing by scanning the disk. Resolves the "registry vs directory scan" question in favour of an explicit list.
_Avoid_: scan list, project index, workspace.

**Deploy-state**:
The answer to "what is deployed where, and at which version" — across consuming repos and across global tool configs. The view that restores the mental model APM scatters across lockfiles.
_Avoid_: status, adoption (adoption is the future team-scale framing of the same idea).

**Drift**:
The umbrella term for a deployed primitive that no longer matches the **Released harness**. Has two facets, surfaced by the deploy-state view: **Version drift** and **Content drift**. When unqualified, "drift" means the union; in a feature that only covers one facet, qualify it. Drift never measures against the **Working harness**: work that is merged but not tagged is not drift, it is the *Pending release* table on the Harness view (ADR-0021).
_Avoid_: staleness, out-of-sync.

**Version drift**:
A deployed primitive whose pinned version lags the latest tag on the **Released harness**. Detectable via `apm outdated`; the cockpit shows it as the **deployed → latest version pair** (e.g. `2.1.0 → 2.3.1`), read straight from `apm outdated`'s output — not a binary flag, and not a "versions behind" distance (ADR-0007). This is the facet MVP1 surfaces.
_Avoid_: outdated (that is APM's word for the mechanism).

**Content drift**:
A deployed primitive whose materialized files have diverged from the pinned tag's tree (edited or added locally). `apm outdated` does **not** detect it; deploy-time refusal does (tree-diff, ADR-0003). Not surfaced by the deploy-state view yet (see "See local divergence from central" on the board, `docs/jobs.md`).
_Avoid_: local edit, dirty.

**Shadow skill** _(future-relevance)_:
Any AI-instruction artifact in use outside the central inventory — personal dotfiles, ad-hoc rules, copied prompts. The anti-pattern the team/org-scale version of Maestro exists to eliminate. Not an MVP1 concern (solo has no shadow problem yet).
_Avoid_: unofficial skill, rogue rule.

**Required / Optional primitive** _(future)_:
A required primitive deploys to everyone in scope without opt-in; an optional one is opted into by repo, role, or context. A governance concept that activates when Maestro serves a team, not a solo user.
_Avoid_: mandatory, default, extra.

## Relationships

- The **central inventory** (the `agent-harness` repo) contains many **Primitives** (skills, hooks, MCP servers).
- A **Bundle** is composed from primitives in the central inventory; a primitive belongs to zero or more bundles.
- **Maestro** (the product, the `maestro` repo) is separate from the central inventory it conducts; one Maestro can conduct any inventory.
- A **Deploy** reproduces a primitive or bundle from the central inventory into a **Target**, which is either **local** (a consuming repo) or **global** (a tool config). The mechanism is **APM**.
- **Deploy-state** is the aggregate of every deploy across consuming repos and global targets; **Drift** is a deploy-state entry lagging the central inventory.

## Flagged ambiguities

- "Skill" is overloaded across vendors. Maestro's canonical primitive set targets Claude Code and Codex; qualify the term when talking to other ecosystems.
- "Central" means *curated/production-ready*, not merely "stored in one place." A draft is not central until curated.
- "Deploy" (Maestro's verb, intent-level) vs "install" (APM's verb, mechanism-level) are deliberately distinct. Don't collapse them.
- "Dashboard" vs "cockpit": prefer **cockpit** in docs because the value is steering, not only viewing.
- "Where Maestro runs" (the cockpit's own host — your laptop in MVP1, possibly a VPS later) is **not** a **Target**. A Target is where a *primitive* is deployed (a consuming repo or a tool config); Maestro's hosting is about the product itself. Don't conflate them. See ADR-0002.

## Open design questions

Named but not yet specified (surface, don't bury):

- **Bundle nesting** — flat for now; revisit if a real need surfaces.
- **Bundle-level metadata** (description, owner, ordering) — reserved, not built yet.

Resolved (kept for traceability):

- **How Maestro discovers consuming repos** — resolved during roadmap 01 (2026-06): an explicit **Consuming-repo registry**, not a directory scan.
- **Whether APM supports global deploy** — resolved: native via user scope `~/.apm/` (own `apm.lock.yaml`; `-g` flag on `install`/`outdated`). Maestro drives it, does not add it.
- **Which tools a global deploy targets** — resolved during roadmap 01 (01.2, 2026-06) as "always both Claude Code and Codex", then **revised by ADR-0011**: a global deploy targets the tools **detected present** on the machine (both, or just one), still with no manual per-tool choice. The "always both" rule is superseded; single-tool machines no longer get a dead `.agents` copy. Local (per-repo) deploys are unaffected.
