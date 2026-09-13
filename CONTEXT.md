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
The collection of primitives in the latest published release of the connected **Harness**.
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
_Avoid_: skill group, category, tag, profile, bundle in APM's sense (there it names the whole selectable package a target depends on — that is the **Harness**, ADR-0031).

**Deploy**:
The act of adding a primitive to a target's **Selection** so APM reproduces it from the central inventory at the **Target release** (ADR-0031). A deployed copy is also where an improvement may start: an edited copy of a skill this Harness deployed travels back through **Import skill…** → **Update skill** → **Pending proposal** → **Propose change** → **Release** (ADR-0026).
_Avoid_: install (that is APM's verb for the mechanism), copy, sync.

**Unsupported deployment**:
A deployed APM lockfile entry whose package type Maestro cannot manage as the requested **Primitive**, even though APM materialized files in the **Target**.
_Avoid_: skipped entry (reader mechanics), failed deploy, successful deploy.

**Remove**:
The act of undoing a **Deploy**: the primitive disappears from each target and from that target's lockfile bookkeeping, via APM. Scoped to one or more targets — one action can retire a primitive from every target it is deployed to, walking them one at a time and reporting per target what happened. Scoped to targets either way: removing a deploy never touches the central inventory copy. A global remove covers the full set of detected tools, mirroring how a global deploy targets them as one set.
_Avoid_: undeploy (constructed jargon), uninstall (APM's verb for the mechanism), delete (ambiguous with deleting from the central inventory).

**Skill restoration**:
Recovery of a locally deleted skill folder in the Working Harness from the last local commit, without changing its proposal.
_Avoid_: undo deletion, which implies recovering the exact pre-deletion state.

**Proposal**:
One skill's change offered for review: the branch **Propose change** pushed, and the pull request opened over it. A proposal ends when its pull request is merged; the branch itself may outlive it, and a later change to that skill on the default branch never revives it. Without a pull-request check, Maestro cannot see the end and reads the branch as before (#890).
_Avoid_: promotion (the mechanism), branch (the carrier, not the offer).

**Skill content**:
Everything inside a skill folder that the team means to share. Repository internals (`.git`) and files the operating system drops into a folder (`.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`) are not skill content: Import leaves them behind and the Harness ignores them (#890).
_Avoid_: files, tree (the mechanism that measures it).

**Target**:
Where a deploy lands. Two kinds: **local** (a consuming repo) or **global** (the user-level config of a present tool). A global deploy resolves to one target per detected tool, so "global" can be several targets on a two-tool machine and one on a single-tool machine (ADR-0011).
_Avoid_: destination, environment.

**Target release**:
The one Harness release every skill in a target's **Selection** is deployed from; a target has exactly one, except while a stopped Update leaves it in **Mixed releases** (ADR-0031).
_Avoid_: pin (APM's mechanism), adopted release (a second name for the same thing), version (that is the tag's number, not the release).

**Selection**:
The skills a target follows from its **Target release**. Only **Deploy skill** and **Remove skill** change it; **Update target** moves it to a newer release and never changes it (ADR-0031). On screen: *selected skills*.
_Avoid_: subset (APM's word for the mechanism), bundle, skill list.

**Pending release**:
The release a target chose for an **Update target** that the deployment record does not show yet. Maestro remembers it from the moment the Update starts until the record names that release, so **Mixed releases** and **Retry update** survive a restart (ADR-0031).
_Avoid_: chosen tag (the mechanism), in-flight release.

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
A target whose **Target release** lags the latest tag on the **Released harness**. Detectable via `apm outdated`; the cockpit shows it as the **deployed → latest version pair** (e.g. `2.1.0 → 2.3.1`), read straight from `apm outdated`'s output — not a binary flag, and not a "versions behind" distance (ADR-0007). A release moves the tag for the whole Harness, so each selected skill has its own reading: a **changed skill**, whose tree differs between the two releases, and an **unchanged skill**, whose tree is identical at both. Only changed skills count on the target's Release head (ADR-0027, amended by ADR-0031).
_Avoid_: outdated (that is APM's word for the mechanism), behind skill (a skill has no release of its own; the target does).

**Content drift**:
A deployed primitive whose materialized files have diverged from the pinned tag's tree (edited or added locally). `apm outdated` does **not** detect it; deploy-time and remove-time refusal do (tree-diff, ADR-0003; a removal refuses it because apm 0.29.0 aborts part-way on such a copy, #775). A copy whose folder equals the skill at the chosen release exactly is not content drift for an Update, whatever the old record says (#931).
_Avoid_: local edit, dirty.

**Shadow skill** _(future-relevance)_:
Any AI-instruction artifact in use outside the central inventory — personal dotfiles, ad-hoc rules, copied prompts. The anti-pattern the team/org-scale version of Maestro exists to eliminate. Not an MVP1 concern (solo has no shadow problem yet).
_Avoid_: unofficial skill, rogue rule.

**Required / Optional primitive** _(future)_:
A required primitive deploys to everyone in scope without opt-in; an optional one is opted into by repo, role, or context. A governance concept that activates when Maestro serves a team, not a solo user.
_Avoid_: mandatory, default, extra.

## Screen names

The domain language above remains canonical in code and documentation. The
cockpit uses the fixed screen names below; one concept never gains different
names on different surfaces. Grammatical variants are allowed, and technical
details may name the exact APM mechanism or file.

| Domain term | Screen name | Rule |
|---|---|---|
| Harness | **Harness** | Use **Working Harness** or **Released Harness** when the state matters. |
| Central inventory | **Inventory** | Reserve **Inventory** for the collection and its screen. |
| Inventory source | **Harness location** | Do not use *source* for the configured Harness location. The controls on that screen are **Re-read Inventory**, **Change Harness location** and **Set Harness location**. |
| Drift | **Behind** | A target's reading, stated on its **Release head**; never a skill's. Use *an update is available* as explanation, not as a second status name. The `?` marker reads **Update check did not run**; *drift* never reaches the screen. **Behind** claims a newer release exists and nothing more (ADR-0027); the changed count beside it carries the content fact. *Older tag* is retired (ADR-0031). |
| Changed / unchanged skill | **Changed** / **Unchanged** | The two sections of the **Update target** preview, and the count on the Release head (`2 of 5 skills changed`). Explain *unchanged* as *identical at both releases*; never *same content*, which is **Content drift**'s territory. |
| Version drift, skill absent | **No longer released** | The row reading for a selected skill whose name is absent from the latest release; the **Update target** preview lists it under **Removed by this release**. Never use *Deprecated*, which claims an intent the Harness does not record. |
| Target | **Target** | Prefer the concrete repository or tool name after the concept is established. |
| Deploy | **Deploy** / **Deployed** | *Deploy* is the action and *deployed* is the state; *install* is APM's mechanism. |
| Skill | **Skill** | Use `SKILL.md` only when the file itself matters. |
| Primitive | — | Name **skills, hooks, and MCP servers**; use **items** only for a generic count. |
| Source (generic) | — | Name the concrete thing: **Harness location**, **original folder**, or **latest release**. |
| APM lockfile | **Deployment record** | Show `apm.lock.yaml` only in technical details. |
| Pinned version | **Deployed version** | Do not introduce *pin* as a user action or state. |
| Promote | **Propose change** / **proposed change** | *Propose change* is the action and the row button; the noun is a **proposed change**. Pushing alone does not mean a pull request exists or review has started. |
| Proposal recovery actions | **Update proposal** / **Create pull request** / **Reopen proposal** / **Withdraw proposal** | The row menu's four presses beside *Propose change* and *Open pull request*. *Update proposal* sends new content to the existing proposal; *Create pull request* opens the request a prepared branch has none of; *Withdraw proposal* closes the request and keeps both the local files and the branch. |
| Local work awaiting proposal | **Pending proposal** | Local skill content differs from the current open or prepared proposal, otherwise from the Harness default branch. |
| Open proposal | **Pending review** | A matching open pull request into the Harness default branch exists. Its status is **Draft**, **Waiting for review**, **Changes requested**, or **Approved, awaiting merge**, according to the verified facts. |
| Reviewer asked for changes | **Changes requested** | GitHub's review verdict on an open proposal. It survives an update to the proposal; only GitHub clears it. **Draft** outranks it when both apply. |
| Unreleased skill change | **Pending release** | This skill differs between the Harness default branch and the latest release. Explain as *Merged, not yet released*; approval alone is not a merge. |
| Harness skill deletion | **Delete** / **Deletion** / **Deleted** | *Delete* is the verb, *deletion* is the noun, and *deleted* is the state. Use these forms throughout the Harness journey, including proposed deletions; never *remove* for this concept. The confirmation reads *Delete {skill}* and confirms with **Delete skill**. *Delete* covers two roads: proposing a deletion when the skill exists elsewhere, and removing the folder from the Working Harness when it does not. |
| Skill restoration | **Restore skill** / **Restore {skill}** | The action and confirmation button read **Restore skill**; the dialog title reads **Restore {skill}**. Never **Undo deletion**. |
| Proposal without a pull request | **Pull request missing** | A prepared proposal has no matching pull request, confirmed by a complete check. It is not Pending review. |
| Merged proposal, default branch not yet read | **Proposal merged** | GitHub merged the pull request and the Harness default branch has not been read since. It is the normal end of a review, so it carries no amber marking; the row leaves Pending review on the next read. Never **Pull request missing**, which claims no request ever existed. |
| Closed unmerged proposal | **Proposal closed** | A closed proposal still holds work not incorporated into the default branch. Keep it visible outside Pending review. |
| Ambiguous open proposal | **Multiple pull requests** | Several matching open pull requests remain; show their links without choosing one. |
| Stale Harness status | **Status out of date** | Previously verified information whose refresh failed; never present it as current. |
| Unknown Harness status | **Status unknown** / **Review status unknown** | No verified status is available; use the review-specific name when only review status is unknown. Unknown is not empty. |
| Unavailable review status | **Review status unavailable** | The pull-request check is unavailable; do not infer whether a proposal exists. |
| Harness freshness reading | **Read** | The one word for reading the Harness, on every surface: *Read 4 min ago*, *Read from GitHub 4 min ago*, *Not read yet*, *Read failed — never read*. While a read runs, the strip's Status reads *Reading GitHub…*. *Fetch* and *fetched* are retired from user-facing copy; they survive only as the wire field `lastFetchedAt` and the `fetched` / `fetch-failed` outcome values. |
| Harness re-read | **Retry check** | The one re-read control on the Harness view: the strip's control and the single action in every failed-read notice. *Refresh* is retired — never on a control, never in a sentence. **Re-read Inventory** stays Inventory's own control. |
| Release | **Release** / **Released** | *Release* is the action, *released* is the state, and *latest release* is the result. |
| Release dialog | **Create a release** / **Publish release for {origin}** / **Publish release** | *Create a release* opens the dialog on the Harness strip; the dialog reads *Publish release for {origin}*; *Publish release* confirms publication. References to either control use its exact label; *Plan release* is retired. Never a bare *Release* on a button or in the title. |
| Import dialog | **Import skill…** / **Import skill** | The trailing ellipsis marks the control that opens the dialog; the dialog's confirm carries no ellipsis. |
| Import dialog, replacing | **Update skill** | The dialog reads *Update a skill* and confirms with *Update skill* when it replaces a skill the Harness holds; it reads *Import a skill* and *Import skill* when it adds one. The control that opens it keeps its ellipsis either way. What an update lands sits under **Pending proposal**. The Deploy-state row once carried the same label for the other direction; that button retires for **Update target** on the target (#932). |
| Consuming repo | **Repository** | Write it out in a sentence; *repo* stays only inside the `+ repo` control label. |
| Scaffold | **Scaffold** / **Harness scaffold** | *Scaffold* is the action and *Harness scaffold* is the thing on offer; never *generate* or *initialise*. |
| Clone folder | **Clone** | The local copy of the Harness repository. Say **folder** for any other directory on disk. |
| `apm.yml` | `apm.yml` | Name the file in a `detail`, never in the sentence — the reader meets it in their own editor. |
| Bulk removal outcome | **Left alone** | A target the run did not remove, whether it refused or failed; never *skipped*. |
| Remove | **Remove** / **Removal** | *Remove* is the action, *removal* is the noun for the attempt and its outcome. These terms apply to deployed copies in targets; the Harness skill remains. Never call this *delete*. |
| Content drift | **Local edits** | The row reading and the Update preview's block for a deployed copy that differs from its record and from the chosen release; the per-skill control in that preview is **Discard local edits** (#931). An edited copy whose folder equals the chosen release is not **Local edits**, and neither is one that still equals its record. |
| Copy with no record to check it | **Unverified** | A deployed copy the record holds no hashes for, so nothing proves whether it carries work. Overwriting or removing it needs consent of its own, per skill and per tool (#952). The same word is the drift badge for a Harness the cockpit could not reach; the two are told apart by the row they sit in and by their hints, never by the word alone. |
| Consent to overwrite a copy | **receipt** | The server's proof that it read these copies, for this act, on this target, just now. Every refusal that consent can clear hands one back, and the reader's next attempt sends it. Content that changed since retires it: the act refuses again and restates the question with a fresh one (#952). Never a flag the reader sets. |
| Evidence that cannot be read | fails closed | A copy, record or release the cockpit could not read never passes as clean and never earns consent. The act refuses, and the way out is to make the thing readable (#952). |
| Release head | **Release head** | The first line of a target card: `Release vX · In sync`, or `Release vX · newer release vY: N of M skills changed`. When the changed count cannot be read, the head shows both releases and the meta line *Changes could not be read* (#932). |
| Adopt a release | **Update target** | The one control and dialog that moves a target's whole selection to the newest release; never *Update skill* on a row, which retires (#932). The preview's chip for a release that changes no selected skill is **No content changes**. |
| Half-landed Update | **Mixed releases** | A target card whose files sit partly on the chosen release after an Update stopped; its notice is **Update incomplete** and its control **Retry update**, which runs the **Pending release** again. Never a target that still holds per-skill dependencies, which reads **Pinned per skill**. |
| Per-skill dependencies | **Pinned per skill** | The status of a target whose skills were deployed one at a time, before it followed one release: head `Pinned per skill · 3 skills at v0.3.1`, meta line **Release not adopted**. It has no **Update target**; the way to one release is **Remove skill** for each skill, then **Deploy skill**. Deploy refuses such a target with `Left alone — pinned per skill` (#933). |
| Add to a selection | **Deploy skill** | From the Inventory, adds a skill to a target's selection at the target's release; an empty target pins the latest release. On a behind target it opens **Update target** with the section **Added by this deploy** — a second entrance to the same Update, never a second flow (#937). Bulk deploy never moves a release. |
| Manifest shape Maestro cannot edit | **Manifest not recognised** | The notice when the consumer's `apm.yml` holds anything other than one dependency on the connected Harness with a `skills:` list; nothing installs until the reader fixes it by hand (ADR-0031). |
| Files outside the selection | **Extra files deployed** | The notice on a target card when the deployment record holds files that belong to no selected skill; a fact to know, not an action to take (ADR-0031). |
| An operation that never finished | **Unfinished operation** | The durable record of what a Deploy, Remove or Update set out to do — target, Harness, operation, chosen release, previous and desired **Selection**, affected tools — written before the first mutation and cleared only once disk, the manifest and the deployment record agree with it. A matching tag alone never clears it, and it survives a restart. Its notices are **Deploy incomplete** with **Retry deploy**, **Removal incomplete** with **Retry removal** and **Update incomplete** with **Retry update**; a retry re-runs the saved release and Selection, and asks for local-copy consent afresh (ADR-0031, #951). |
| The last skill leaving a target | named uninstall | Removing the last selected skill empties the target through a named `apm uninstall` of the Harness dependency, never an empty `skills:` list, which apm refuses. Every other dependency and every hand-placed file survives it (#957). |
| Concurrent operation | **Target busy** | The notice when a deploy, removal or update is still running on the target; nothing runs until it finishes (#932). |
| Overwrite a protected copy | **Deploy again** | The one label for overwriting a deployed copy that has local edits or is **Unverified**; never *Reinstall fresh* or *Re-deploy*. It sends the receipt the refusal handed back, never a force flag. Retires from the Deploy-state row once **Update target** ships: discarding is **Discard local edits** inside the preview (#932). |
| Up-to-date | **Up to date** | One skill's drift status. Never hyphenated on screen. |
| Target roll-up | **In sync** | A whole target's state, on its card header. A single skill is **Up to date**, never *in sync*. |
| Browse dialog title | a noun phrase | Name what the dialog picks — **Inventory folder**, **Skill folder**, **Folder to clone into**, **Repositories to register** — never an imperative. |
| Read failure | **Not read** | Any read that failed says `{the thing} not read` — never *not loaded*. On a deploy-state read the way out is always *Reload the page*. |
| Registration outcome | **Registered** / **Skipped** | A repository the run did not register is **skipped**; *left alone* stays the bulk-removal word. |
| Browser reload | **Page** | Say *Reload the page*; never *screen* or *reload the view* for the same act. |
| Symbolic link | **Link** | A linked skill directory is a **linked skill folder**; *symlink* never reaches the screen. |
| Directory | **Folder** | One word for the concept, on every surface. |
| Skill detail pane | **{name} detail** | The pane is named after the skill it shows; its close control is **Close {name} detail**. |
| Bulk staging | **Bulk deploy** | The checkbox stages a skill **for bulk deploy**; the strip above the table is **Staged for bulk deploy**. |

The three Harness stages have no additional group name. One skill may appear in
all three when each row represents different work; ordinary explanation may say
*your changes*. Independent stage memberships are ADR-0021 point 10; the review
facts behind them are read through `gh` (ADR-0029). Implementation belongs to
the author journey spec.

### Jargon the screen keeps

An inherited tooling term the reader already types stays in the sentence; a
Maestro invention is explained on first use.
Decided so far:

| Word | Call |
|---|---|
| `frontmatter` · `working tree` · `default branch` · `origin` · `partial clone` · `symbolic link` · `hard link` · `MiB` | Kept. Git and packaging terms the reader reads in their own tools. |
| `SKILL.md` · `apm.yml` · `apm.lock.yaml` | Kept where the instruction acts on the file; otherwise **deployment record**. |
| `slug` | Dropped. Write the rule instead: *lowercase letters, digits and single hyphens, like code-review*. |
| `tag` | Kept, but only inside a `detail`. |

## Relationships

- The **central inventory** (the `agent-harness` repo) contains many **Primitives** (skills, hooks, MCP servers).
- A **Bundle** is composed from primitives in the central inventory; a primitive belongs to zero or more bundles.
- **Maestro** (the product, the `maestro` repo) is separate from the central inventory it conducts; one Maestro can conduct any inventory.
- A **Target** — either **local** (a consuming repo) or **global** (a tool config) — follows one **Target release** with one **Selection**. A **Deploy** adds to the selection, a **Remove** takes from it, and **Update target** moves the whole selection to a newer release. The mechanism is **APM**.
- **Deploy-state** is the aggregate of every target's release and selection across consuming repos and global targets; **Drift** is a target lagging the central inventory.

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
