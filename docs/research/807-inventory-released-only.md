# How Inventory can read the Released harness instead of the working tree

Resolves Wayfinder ticket
[#807](https://github.com/fimoklei/maestro/issues/807) on map
[#805](https://github.com/fimoklei/maestro/issues/805). Measured 2026-09-05
against `main` at `6e12a7c`, git 2.51.0, apm 0.29.0, on the author's real
harness `~/harness` (v0.3.0) and the smoke source `~/Projects/agent-harness`
(v0.6.0).

Continues [345-untagged-skill-deploy.md](345-untagged-skill-deploy.md), which
established the same split from the deploy side: "Inventory lists an untagged
skill as if it were deployable… what is missing is timing, not safety."

## How big the lie is right now

`~/harness`, the harness the author's cockpit is connected to:

| | Count | Command |
|---|---|---|
| Working harness (what Inventory shows) | **9** | `ls -1 ~/harness/.apm/skills` |
| Released harness at `v0.3.0` | **4** | `git -C ~/harness ls-tree -d v0.3.0:.apm/skills` |

Released: `domain-modeling`, `grilling`, `workflow-commit`, `workflow-ship`.
Not released but on screen: `agent-native-cli`, `app-creator`, `code-review`,
`simple-tasks`, `xcode-makefiles`.

**Five of the nine rows on the Inventory screen are things no consumer can
deploy.** Each one is a dead end: the row offers Deploy, and
`deploy-skill.ts:258` refuses it with `no-published-tag`.

The smoke source is not affected today — `~/Projects/agent-harness` has 36
skills on disk and 36 at `v0.6.0`. That is luck, not a guarantee.

## 1. How to read the skills at a release tag

`apm` cannot answer this. `apm view <owner>/<repo> versions` lists a repo's
tags over the network (`docs/apm-behavior.md:257-265`) and nothing lists the
contents of a tag. Inventory's contract is "the local clone, never the
network" (`inventory-reader.ts:1`), so git plumbing is the only option.

Measured on `~/Projects/agent-harness` at `v0.6.0` (36 skills), 3 runs each,
warm cache:

| Approach | Processes | Cost | Verdict |
|---|---|---|---|
| A — `ls-tree <tag>:.apm/skills` then one `git show` per skill | N+1 (37) | **482 ms** | What the code would reach for. Cost is linear in skills. |
| B — `ls-tree -r <tag>` then one `cat-file --batch` fed the blob SHAs | 2 | **24 ms** | Fastest per skill, but a second parser to own. |
| C — `git archive <tag> .apm/skills` and untar | 1 | **25 ms** | Streams a tarball; needs a tar reader Maestro does not have. |

On `~/harness` (4 skills): A 190 ms, B 45 ms, C 37 ms. The fixed process cost
dominates below ~10 skills; above that, A degrades linearly and B/C do not.

**A is what to build**, because the two calls it needs already exist and are
already tested:

- `HarnessGitAdapter.readSkillTrees(root, ref)` —
  `harness-git.ts:684-728`. One `ls-tree -z <ref>:.apm/skills`, returns
  `{name, treeHash}[]`, `-z` so a non-ASCII name is never git-quoted.
- `HarnessGitAdapter.readSkillManifests(root, ref, names)` —
  `harness-git.ts:757-772`. One `git show <ref>:<subpath>/SKILL.md` per name,
  raw stdout, frontmatter parsed in core.

Together those are exactly `{name, description}` at a ref — Inventory's whole
payload. 480 ms for a 36-skill harness on a cached query is acceptable; the
`ponytail:` upgrade path is B, and it should not be built before a harness
makes A measurably slow.

### Failure modes

Measured exit codes:

| Case | `ls-tree` | `git show` |
|---|---|---|
| Tag not in the clone | 128 | 128 |
| Path missing at a tag that exists | 128 | 128 |

**Exit 128 does not distinguish "the tag is unknown" from "the tag has no
skills".** That ambiguity is already solved: `readSkillTrees` follows the
failure with `rev-parse --verify --quiet <ref>^{tree}` and returns `[]` only
when the ref resolves, `null` otherwise (`harness-git.ts:695-708`).

One trap: `readSkillTreesAtTag` reads `refs/maestro/tags/<tag>`
(`harness-git.ts:673-678`), the namespace Maestro's own fetch writes
(`TAG_REFSPEC`, `harness-git.ts:49`) — deliberately, so an unpushed local tag
never answers. Measured:

- `~/harness` — `refs/maestro/tags/{v0.1.0,v0.2.0,v0.3.0}` present.
- `~/Projects/agent-harness` (the smoke source) — **zero refs under
  `refs/maestro/tags`**, though `refs/tags` holds v0.1.0…v0.6.0.

So Inventory reusing that namespace shows nothing until `ReadHarnessState` has
fetched at least once. Reading `refs/tags` instead would show a local tag
nobody pushed. Both are defensible; the choice must be made deliberately and
written down, not inherited.

## 2. A clone that never fetched, or where no tag is known

`read-harness-state.ts` states the rule twice:

- `:77-78` — "`tags: null` is a namespace that could not be read at all —
  never a harness with no releases. An empty list is only ever 'looked, found
  none'."
- `:100-103` — `readSkillTrees` returns "Null … a ref that could not be read
  at all — never an empty harness."
- `:60` — "`unreadable` is fail-closed: an unasked question is not a clean
  answer."

Measured on a `git clone --no-tags --depth 1` of `~/harness`:

| Question | Answer |
|---|---|
| `git tag --list` | 0 tags |
| `ls-tree v0.3.0:.apm/skills` | exit 128 |
| `rev-parse --verify --quiet refs/tags/v0.3.0^{tree}` | exit 1 |
| `for-each-ref refs/maestro/tags` | 0 refs |
| Skills on disk | 4 |

So the clone holds four skills and Maestro cannot say whether any is released.

**Inventory must therefore carry three outcomes, not two.** Today
`InventoryResult` has one failure, `not-configured`
(`inventory-reader.ts:12-15`). It needs a third state for "the released
harness could not be read": no tag namespace, no tag, or a tag that does not
resolve. Rendering that as an empty list is the exact failure the rule
forbids, and it is worse than today's lie — it tells the author their harness
is empty when it is not.

Distinguish two honest zeroes, because their copy differs:

- **Never released** — tags readable, none matches `RELEASE_TAG_PATTERN`. A
  scaffolded harness is always here. Honest empty state; points at Harness.
- **Unreadable** — tag namespace or ref could not be read. Not an empty state;
  a notice naming the fetch.

## 3. Reusing `highestReleaseTag`

`highestReleaseTag(tags: HarnessTag[]): HarnessTag | null` lives at
`packages/core/src/harness/release-tag.ts:12-24`. It is pure: a filter on
`RELEASE_TAG_PATTERN` plus a `localeCompare(…, {numeric: true})` reduce. Its
only import is `import type { HarnessTag }` — a type, erased at build.

`.claude/rules/architecture.md` constrains `web → server → core` and says
`core` depends on nothing else in this repo. It says nothing about
module-to-module imports inside `core`, and the codebase already crosses that
seam in both directions:

- `harness-git.ts:6` (harness) imports `harnessSkillSubpath` from
  `inventory/harness-layout`.
- `deploy/inventory-git.ts:6` (deploy) imports the same.
- `inventory/inventory-reader.ts:6` (inventory) imports `parseGitOrigin` from
  `deploy/git-origin`.

**So `inventory` importing `highestReleaseTag` from `harness` breaks no rule
and sets no precedent.** Copying it would be worse: two semver comparators
that can disagree is the exact fault its own header warns against ("One
pattern for both … so the two cannot disagree").

The real coupling question is not the function but the **tag oracle**. There
are two in the codebase and they disagree:

| Consumer | Oracle | Where |
|---|---|---|
| Harness view | local refs → `highestReleaseTag` | `read-harness-state.ts:339,398` |
| Deploy | `apm view` over the network | `deploy-skill.ts:246` |

If Inventory picks the local oracle and deploy keeps the remote one, a skill
can be listed and still refused, or refused and still listed, whenever the
clone is behind. Inventory should use the local oracle — it is offline, and it
is the one the Harness view already shows the author — and the residual gap
should be named, not papered over. `syncBeforeDeploy` (`inventory-git.ts:31`)
already narrows it at the deploy moment.

## 4. Everything that assumes Inventory equals the disk

Enumerated across `packages/`, `tests/`, `scripts/`. Absolute paths are
relative to the repo root.

### The reader and its seam

- `packages/core/src/inventory/inventory-reader.ts:91-116` — `read()` lists
  the working tree through `FileSystemPort`; no git call in the file.
- `packages/core/src/inventory/inventory-reader.ts:12-15` — `InventoryResult`
  has one failure; no "released harness unreadable".
- `packages/core/src/index.ts:153-155` — public re-export.

### Server

- `packages/server/src/app.ts:213-216` — `countPrimitives()`, the number
  connect success reports.
- `packages/server/src/app.ts:544-551` — `GET /api/inventory/primitives`.
- `packages/server/src/app.ts:723-727` — `POST /api/inventory/connect` returns
  `primitiveCount`.
- `packages/server/src/app.ts:749-753` — `POST /api/harness/scaffold` returns
  `primitiveCount`.
- `packages/server/src/app.ts:978-983` — the one production construction:
  `{ fs, resolvePath, originUrl }`, no git dep.
- `packages/server/src/app.ts:1037-1039` — `InventoryGitAdapter` already wired
  on the same root; the git access Inventory needs is one line away.
- `packages/server/src/app.ts:1108` — the same reader handed to `DeploySkill`.
- `packages/server/src/app.ts:253` — `inventory-not-configured` → 409.

### Deploy

- `packages/core/src/deploy/deploy-skill.ts:218-224` — re-reads the inventory
  inside the lock; absence from the **working tree** is `unknown-skill`.
- `packages/core/src/deploy/deploy-skill.ts:257-260` — `skillExistsAtTag` →
  `no-published-tag`. **Becomes redundant** once Inventory is released-only,
  but must stay: it is the TOCTOU guard between listing and installing.
- `packages/core/src/deploy/deploy-skill.ts:261-263` — `skillDivergesFromTag`
  → `local-diverged-from-tag`. Still needed; a released skill can still be
  dirty on disk.
- `packages/core/src/deploy/bulk-deploy-skills.ts:34,46` — loops names from
  the Inventory list into `DeploySkill`.
- `packages/core/src/deploy/inventory-git.ts:45-59` — `skillExistsAtTag`; the
  existing precedent for a tag-scoped read, with the same "a stale clone
  surfaces as an error instead of masquerading as 'not published'" rule.

### Connect gate

- `packages/core/src/inventory/connect-inventory.ts:200-219` — connect judges
  "is a harness" on `apm.yml` and a resolvable default branch. Never a tag.
- `packages/web/src/connect-gate/connect-view.tsx:50-56` — routes
  `scaffolded` → `/harness`, everything else → `/inventory`.
- `packages/web/src/connect-gate/connect-success-view.tsx:26-37` — `found` /
  `joined` copy is "N found" plus "Continue to Inventory". **A joined harness
  with no tag lands on an empty Inventory** — a dead end #805 forbids.
- `packages/web/src/connect-gate/connect-success-view.tsx:38-44` —
  `scaffolded` already says "The Harness is empty" and continues to Harness.
  That is the shape `found`/`joined` need when the released count is zero.
- `packages/web/src/inventory/use-connect-inventory.ts:10-14,32-33`.

### Scaffold

- `packages/core/src/inventory/scaffold-harness.ts:1-3` — the header states a
  scaffold writes no tag.
- `packages/core/src/inventory/harness-scaffold-files.ts:21-22,44` — creates
  `.apm/skills/.gitkeep` only.
- `packages/server/src/app.ts:733-753` — scaffold route returns
  `primitiveCount` 0.
- `packages/web/src/inventory/use-scaffold-harness.ts:16-24` — invalidates
  `INVENTORY_KEY`, assuming the fresh tree is what Inventory shows.

The scaffold path is the one flow already honest under the new rule: 0 on disk
and 0 released agree.

### Smoke

- `package.json:12-14` — `smoke`, `smoke:ready`, `smoke:check`.
- `scripts/dev.mjs:216` — `inventorySource: ~/Projects/agent-harness`.
- `scripts/seed-sandbox.mjs:92-94` — `cpSync` of the whole clone, `.git`
  included, so `refs/tags` survives but `refs/maestro/tags` is copied only if
  the source already had it. **Measured: the source has none.**
- `scripts/smoke-ready.mjs:80-86` — **throws** when `primitiveCount === 0`,
  with a message naming `.apm/skills/<name>/SKILL.md`. This is the hardest
  breakage: if Inventory reads `refs/maestro/tags`, the seeded sandbox reports
  0 and `pnpm smoke:ready` fails outright — which takes
  `.claude/rules/design.md` "Verify before done" with it.
- `scripts/smoke-ready.mjs:255-263` — prints `N primitives`.

### Web surfaces showing the count

- `packages/web/src/inventory/use-inventory.ts:10,14-19,28-35` — the two query
  keys.
- `packages/web/src/shell/use-reread-inventory.ts:12-13` — "Re-read Inventory"
  invalidates both.
- `packages/web/src/inventory/inventory-panel.tsx:37,46,57`.
- `packages/web/src/inventory/inventory-list.tsx:88-95` — the empty state
  reads **"No skills in the Inventory. Add a skill to the Harness, then select
  Re-read."** That sentence becomes false: adding is no longer enough, you
  must release. Fault F5 (unperformable instruction) under
  `.claude/rules/copy.md`.
- `packages/web/src/shell/status-bar.tsx:78,85`.
- `packages/web/src/shell/inventory-source-view.tsx:33,40-41`.
- `packages/web/src/shell/primitive-count-label.ts:3-5`.
- `packages/web/src/inventory/deploy-skill-action.tsx:61-64`,
  `packages/web/src/inventory/bulk-selection.ts`,
  `packages/web/src/inventory/plan-bulk-deploy.ts`.

### Missing invalidations — new bugs the change creates

Today an import or a promotion changes Inventory immediately and the disk read
picks it up. Once Inventory is tag-derived, **only a release changes it**, and
nothing invalidates `INVENTORY_KEY` on release:

- `packages/web/src/harness/use-harness.ts:96-105` — `usePublishRelease`
  invalidates `HARNESS_KEY` and `RELEASE_PLAN_KEY` only. **A release would not
  refresh Inventory.**
- `packages/web/src/harness/use-harness.ts:218` — `useImportSkill`,
  `HARNESS_KEY` only. Correct after the change (an import must *not* appear).
- `packages/web/src/harness/use-harness.ts:239,256,272` — promote, promote
  deletion, refresh: `HARNESS_KEY` only.
- `packages/web/src/inventory/use-deploy-skill.ts:28-29` — invalidates
  deploy-state and drift, never `INVENTORY_KEY`. Unchanged.

### Tests that build a harness on disk and assert Inventory sees it

Pure (`packages/core`):
`inventory-reader.test.ts:18,28-31,36,56-65,85-91,101-114,125-133,145,160,172`;
`deploy/deploy-skill.test.ts:33,574,586-590,618-633,648-656,684,794,815,838,1032`;
`inventory/scaffold-harness.test.ts:111,125,342`;
`inventory/harness-scaffold-files.test.ts:14,46-49,63-64,170-171`.

Integration (`tests/integration/`):
`server-inventory.test.ts:40-48,56,82-99,103-120,129,138-166`;
`production-wiring.test.ts:92-94,128,138-145`;
`tracer-journey.test.ts:55-58,75,155-160,185`;
`server-deploy.test.ts:44-46,103`;
`server-bulk-deploy.test.ts:59-61,83`;
`apm-output-boundary.test.ts:104,225`;
`bulk-remove-journey.test.ts:142,206-209`;
`update-destination-guard.test.ts:18,90-95`;
`smoke-ready.test.ts:121,158,192-213,221,238`;
`tests/helpers/stub-deploy.ts:6,11,18,31,39`.
Construct a reader and must still compile once the constructor gains a git
dep: `server-drift.test.ts:58`, `server-registry.test.ts:43`,
`server-body-parsing.test.ts:53`, `server-filesystem.test.ts:56`,
`server-remove-deploy-state.test.ts:145`, `server-deploy-state.test.ts:38`,
`server-security.test.ts:40`, `server-bulk-remove.test.ts:80`,
`server-global-deploy-state.test.ts:74`, `server-remove.test.ts:85`.

Git lane (`tests/git/`) — real repos that commit skills and **never tag**;
these are the assertions that flip red:
`server-inventory-connect.test.ts:62-64,86,152,310-320,346-352,439-459`;
`connect-clone-journey.test.ts:78-81,122,174,201,293`;
`scaffold-harness-journey.test.ts:55,121,213` (`:213` asserts 0 and survives);
`server-harness.test.ts:66-68,109,297,332-334`;
`server-harness-release.test.ts:54-56,77`;
`server-harness-promote.test.ts:48-50,89`;
`server-harness-import.test.ts:55,74,130,143,278,378`;
`inventory-git.test.ts:20-22,76,90,130-132,191` — the closest prior art;
`tests/helpers/git-fixture.ts` — the shared builder that would gain a
`tag()` step.

Web (contract-level stubs, cheap to update):
`inventory-panel.test.tsx:25,34-36,89-104,132,160,183,200`;
`inventory-list.test.tsx:29,41,51-58,87,100-106,120-123`;
`inventory-source-view.test.tsx:43-49,93,194-197,…,576-579`;
`status-bar.test.tsx:28-33,70,183-210`;
`connect-gate-flow.test.tsx:26,104,114,151-226,252,342,396,433,446`;
`connect-success-view.test.tsx:13,21,26,44,77`.

Stories: `inventory/inventory-list.stories.tsx:8-36,59`;
`connect-gate/connect-success-view.stories.tsx:9-10,23,27`;
`shell/status-bar.stories.tsx:29,42`; `ui/logo.stories.tsx:19`;
`inventory/skill-detail-pane.stories.tsx`.

## 5. `InventoryReader` or one layer up

**In `InventoryReader`.**

Every consumer already routes through it: the primitives route
(`app.ts:544`), the connect and scaffold counts (`app.ts:213`), and
`DeploySkill` (`app.ts:1108`, `deploy-skill.ts:218`). One change at that seam
fixes all four. There is exactly one production construction
(`app.ts:978`), so the new dependency is wired once.

Filtering one layer up fails on both sides:

- **In `server`** — `DeploySkill` lives in `core` and reads the reader
  directly, so a server-side filter would leave deploy on the disk listing.
  It would also put "what counts as released" in the transport layer, which
  `.claude/rules/architecture.md` forbids ("no domain logic, no business
  rules").
- **In `web`** — `web` never touches the filesystem or git and would need a
  second endpoint to ask what is released. It would also leave the server's
  own `primitiveCount` lying.

The shape:

- `InventoryReader` gains one port — the released-skills question, an
  interface in `core/src/inventory` implemented by an adapter that delegates
  to the two `HarnessGitAdapter` methods above. Same pattern as
  `InventoryGitPort` (`deploy-skill.ts:59-65`), which already asks a
  tag-scoped git question from a use case.
- `InventoryResult` gains the third outcome from §2. Every `!inventory.ok`
  branch must be revisited — notably `deploy-skill.ts:219-221`, which today
  collapses any failure to `inventory-not-configured` and would mislabel an
  unreadable release as an unconfigured harness.
- `read()` keeps returning `{name, description}`; nothing downstream changes
  shape.

`configuredPath()` and `configuredLocation()` are untouched — they answer
about the connection, not its contents.

### What must move with it, not after it

1. `packages/web/src/inventory/inventory-list.tsx:88-95` — the empty-state
   sentence is false the moment the reader changes.
2. `packages/web/src/harness/use-harness.ts:96-105` — `usePublishRelease` must
   invalidate `INVENTORY_KEY`, or a release never reaches the screen.
3. `packages/web/src/connect-gate/connect-success-view.tsx:26-37` —
   `found`/`joined` with zero released skills needs the `scaffolded` treatment:
   say the harness has no release, and continue to Harness.
4. `scripts/smoke-ready.mjs:80-86` and `tests/helpers/git-fixture.ts` — the
   fixtures must tag, or the gate must accept a released count of zero.

### One decision is missing from the record

`.claude/rules/apm-driver.md` and ADR-0003 pin deploys to tags, and ADR-0021
§2 makes the Released harness the only state consumers deploy from. But
ADR-0021's own Consequences say: "**ADR-0016 is untouched. It governs
Inventory, and nothing here does (#347).**" And ADR-0016 is presentation-only
— it never states which harness state Inventory reads.

So "Inventory shows the working tree" was never decided; it is an unstated
default. Changing it needs a written decision: an amendment to ADR-0021's
Consequences, or a new ADR. This should be settled before the spec, not
inside it.

## Open questions for the spec

- Which tag namespace Inventory reads — `refs/maestro/tags` (fetched-only,
  measured empty in the smoke source) or `refs/tags` (would show an unpushed
  local tag). §1.
- Whether Inventory keeps the local tag oracle while deploy keeps the remote
  one, and how the residual disagreement is stated. §3.
- Where "your import landed" is confirmed now that Inventory no longer gives
  it — already on #805's *Not yet specified* list.

## How to re-measure

```sh
# The lie, on any harness
ls -1 ~/harness/.apm/skills | wc -l
git -C ~/harness ls-tree --name-only -d v0.3.0:.apm/skills | wc -l

# The two tag namespaces
git -C ~/harness for-each-ref refs/tags --format='%(refname)'
git -C ~/harness for-each-ref refs/maestro/tags --format='%(refname)'

# The never-fetched clone
git clone --no-tags --depth 1 file://$HOME/harness /tmp/notags
git -C /tmp/notags ls-tree --name-only v0.3.0:.apm/skills; echo "exit=$?"
git -C /tmp/notags rev-parse --verify --quiet 'refs/tags/v0.3.0^{tree}'; echo "exit=$?"
```
