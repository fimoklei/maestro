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
The single curated, production-ready collection of primitives, held in the `agent-harness` Git repository. The source you deploy *from*. "Central" means curated and ready to deploy — not a draft scratchpad.
_Avoid_: skills repo, library, catalog (a catalog is passive; the inventory is the governed source).

**Curated / Production-ready**:
The quality bar for anything in the **central inventory**: reviewed and deemed safe to deploy. In MVP1 the curator is one person (the owner). The path from contribution to curated is the future governed lifecycle.
_Avoid_: published, approved (those name the future lifecycle step, not the state).

**Bundle**:
A named set of primitives composed from the central inventory for scoped deployment (e.g. `frontend`, `engineering-stack`). The convenient unit to deploy together.
_Avoid_: skill group, category, tag, profile.

**Deploy**:
The act of reproducing a primitive or bundle from the central inventory into a target, via APM. The deployed copy is generated, never hand-edited.
_Avoid_: install (that is APM's verb for the mechanism), copy, sync.

**Target**:
Where a deploy lands. Two kinds: **local** (a consuming repo) or **global** (a tool's user-level config).
_Avoid_: destination, environment.

**Local deploy**:
A deploy scoped to one **consuming repo** — the primitive becomes available only inside that project.
_Avoid_: repo install, project-level.

**Global deploy**:
A deploy scoped to a tool at the user level (e.g. Claude Code and Codex on this machine) — the primitive becomes available across all of that user's work in that tool.
_Avoid_: system-wide, machine install.

**Consuming repo**:
A project that receives locally-deployed primitives from the central inventory.
_Avoid_: target repo (ambiguous with "target"), client repo.

**Deploy-state**:
The answer to "what is deployed where, and at which version" — across consuming repos and across global tool configs. The view that restores the mental model APM scatters across lockfiles.
_Avoid_: status, adoption (adoption is the future team-scale framing of the same idea).

**Drift**:
A deployed primitive whose version lags the central inventory, or whose deployed config has diverged from what was declared. Surfaced by the deploy-state view.
_Avoid_: staleness, out-of-sync.

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

## Open design questions

Named but not yet specified (surface, don't bury):

- **Bundle nesting** — flat for now; revisit if a real need surfaces.
- **How Maestro discovers consuming repos** for the deploy-state view (registry vs directory scan) — a roadmap/how question.
- **Whether APM supports global deploy** natively, or Maestro adds it — verify in the roadmap grill; "global" is in-scope conceptually regardless.
- **Bundle-level metadata** (description, owner, ordering) — reserved, not built yet.
