# Acceptance → integration scenario map

Every scenario in `tests/acceptance/` against the integration test that covers
it. Written for #431, so that removing the acceptance lane (#432) is a measured
cut rather than an assumption.

**Rule applied.** A scenario counts as *covered* when an integration test
asserts the same observable outcome. It counted as *partial* when the action was
asserted but a follow-up read-back through another route was not — for example a
removal whose apm call was asserted while the deploy-state that should stop
listing the skill was never read. Partial scenarios were treated as gaps and
migrated.

Rows marked **migrated (#431)** name the test added by this ticket.

**Chained journeys.** Where a feature's value is that its steps share state —
the tracer, and the J08 update — the counterpart has to be one test carrying
the whole chain. Per-step tests in separate files prove each step and nothing
about the seams, so they do not count as covering a journey.

**Scope note.** The #431 table lists eleven features. There are twelve
`.feature` files: `j10-j01-j06-j02-tracer.feature` is the bootstrap tracer
journey and was missing from that table. It is mapped here.

57 scenarios. 40 were already covered; 17 were gaps and all 17 are migrated
here, as 14 new integration tests (the four tracer scenarios share one journey
test). Nothing was deleted — the acceptance lane still runs and still passes.
Deletion is #432.

## bulk-deploy-to-target → server-bulk-deploy.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I bulk-deploy several staged skills globally and see them in my baseline | `deploys every staged skill to the target and reports the successes` + `puts every deployed skill into the global deploy-state read` | migrated (#431) |
| A failure mid-batch does not abort the rest | `keeps going past a failure and harvests every outcome` + `leaves the failed skill out of the baseline while the rest lands` | migrated (#431) |
| A content-diverged skill is flagged for attention, never overwritten | `keeps going past a failure and harvests every outcome` (`divergedNames`) | covered |

## j01-see-inventory → server-inventory.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I see every central skill available | `GET /api/inventory/primitives lists the central skills` | covered |
| One broken skill does not hide the others | `skips a skill with no frontmatter without hiding the valid ones` | migrated (#431) |
| I am told clearly when no inventory is configured | `returns 409 with a readable error when no inventory is configured` | covered |

## j02-see-deploy-state → server-deploy-state.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I see what is deployed in a repo, at which version | `lists deployed skills with their human tag version` | covered |
| A repo with nothing deployed shows an honest empty state | `shows an empty list for a registered repo with nothing deployed` | covered |
| A repo Maestro does not know is refused before any file is read | `rejects a repo that is not registered, even when it has a lockfile` | covered |
| A broken lockfile is surfaced as an error, never a blank list | `surfaces a visible error for a malformed lockfile` | covered |

## j03-see-global-deploy-state → server-global-deploy-state.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| A single-tool machine groups its skills under only that tool | `groups a single-tool install under only the detected tool` | covered |
| A two-tool machine attributes each skill to the tool it was deployed for | `attributes a two-tool install to both detected tools` | covered |
| A detected tool with nothing deployed shows as an empty group | `lists a detected tool with nothing deployed as an empty group` | covered |
| Nothing deployed globally shows an honest empty state per tool | `shows each detected tool an empty group when nothing is deployed globally` | covered |
| A broken global lockfile is surfaced as an error, never a blank list | `surfaces a visible error for a malformed global lockfile` | covered |
| The global read uses the server's own location, not a client path | `takes no client-supplied path: a repo query cannot redirect the global read` | covered |

## j04-see-drift → server-drift.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| A skill behind the latest tag is seen with its deployed → latest pair | `returns the deployed -> latest pair for a registered repo` | covered |
| A current skill is seen as up-to-date | `reports an empty behind list when nothing is behind the latest tag` | migrated (#431) |
| A check that could not run is seen as unknown, never up-to-date | `returns 200 with ok:false when the check could not run` | covered |
| A skill apm could not reach the source for is seen as unverified | `forwards the unverified reason when apm could not reach the remote` | covered |
| A globally deployed skill behind the latest tag is seen with its pair | `returns the global behind pair without reading a client path` | covered |
| A global check that could not run is seen as unknown, never up-to-date | `returns 200 with ok:false when the global check could not run` | covered |

The #431 ticket names this feature's *unverified* scenario as the open
question. It is covered: `forwards the unverified reason when apm could not
reach the remote` asserts the same `{ ok: false, reason: "unverified" }` the
scenario describes. The real gap here is the neighbouring up-to-date case.

## j07-deploy-globally → server-deploy.test.ts, narrowed-global-deploy.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I deploy a skill globally and see it in my baseline, with no repo registered | `deploys a skill globally, with no repo registered` | covered |
| A single-tool machine deploys to only that tool, with no dead directory | `targets only the detected tool for a single-tool machine` | covered |
| Narrowing to Codex removes the dead Claude Code tree | `reconciles away the untargeted tool's exclusive copy`, `still removes the exclusive .claude tree when Claude Code is undetected` | covered |
| Narrowing to Claude Code keeps the skills directory other tools read | `leaves the shared .agents tree alone when Codex is undetected` | covered |
| A machine with no supported tool refuses the global deploy | `refuses a global deploy when no supported tool is detected` | covered |
| A global deploy is refused when my local skill has diverged from its tag | `refuses a global deploy when the local skill diverges from the tag` | covered |

## j08-update → update-destination-guard.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I update a behind skill and it is no longer behind | `updates a clean deployed copy, the guard letting it proceed` + `leaves the deploy-state reading the new tag, and drift reporting nothing behind` | migrated (#431) |

All three of the scenario's assertions are in one journey. The drift half fakes
apm's comparison but not its input: the fake reads the lockfile the update
wrote, so a regression that leaves the pin behind still shows up as behind.

## j10-j01-j06-j02-tracer → tracer-journey.test.ts

All four scenarios are one chained journey — the value is that they share
state, so isolated per-route tests would not replace them. One test carries the
whole chain through a single app: the deploy targets the path the registry's own
answer returned, and the read-back finds the lockfile that deploy wrote.

| Scenario | Integration counterpart | State |
|---|---|---|
| I register a repo I work in (J10) | `registers a repo, lists the inventory, deploys into it, and reads it back` | migrated (#431) |
| I see every primitive available centrally (J01) | same journey, step 2 | migrated (#431) |
| I deploy a skill to a registered repo with one action (J06) | same journey, step 3 | migrated (#431) |
| I see the deployed skill back at its version (J02) | same journey, step 4 | migrated (#431) |

## j10-register-repo → server-registry.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I register a repo by its path and see it listed | `POST registers a valid directory and GET then lists it` | covered |
| An invalid path is rejected with a readable error | `rejects a relative path with a readable 400` | covered |
| I register a folder of repos in one go, and a bad one does not sink the rest | `registers a picker selection one path at a time, never stopping at a refusal` | migrated (#431) |
| I register more repos from the sidebar, and re-picking one I already have changes nothing | `does not duplicate a repo the registry already holds` | migrated (#431) |
| Registration survives a restart | `still lists a registered repo through a freshly built app (a restart)`, plus `persists a registered repo across a fresh ConfigStore (a restart)` (registry-config-store.test.ts) | migrated (#431) |

## j11-connect-inventory → server-inventory-connect.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| I connect a local clone and the inventory lists its skills | `connects a valid clone and reports the canonical path`, `after a successful connect the inventory read lists the central skills` | covered |
| A directory that is not an inventory is refused | `rejects a directory without skills/ as 422 not-an-inventory` | covered |
| A folder with skills but no usable git origin is refused | `rejects a skills/ folder without a usable git origin as 422 no-usable-origin` | covered |
| I connect via a path found by browsing | `connects a clone picked out of a browse listing` | migrated (#431) — the two routes were covered apart, never the seam between them |

## remove-deployed-skill → server-remove.test.ts, server-remove-deploy-state.test.ts

The read-back tests live in their own file: `server-remove.test.ts` was already
near the 800-line ceiling (`code-standards.md`).

| Scenario | Integration counterpart | State |
|---|---|---|
| I remove a skill and the repo stops listing it | `removes a deployed skill with the ref its lockfile records` + `stops listing the removed skill while the repo keeps the rest` | migrated (#431) |
| Removing the last skill leaves an honestly empty repo | `reads an emptied repo as empty, never as an error` | migrated (#431) |
| A repo Maestro does not know is refused before anything is touched | `refuses a repo outside the registry before apm or the lockfile is touched` | covered |
| A removal apm cannot confirm is reported as a failure | `reports an unproven removal as a failure the user can read` + `still lists the skill when apm never confirmed the removal` | migrated (#431) |
| A skill I edited in place tells me what I am about to lose | `names local edits as the thing a removal would destroy` | covered |
| Having been warned, I remove the edited skill anyway | `removes a copy with local edits the user already confirmed` | covered |
| A copy with nothing to check it against says so in its own words | `keeps an unverifiable copy apart from a diverged one` | covered |
| A skill that is not there is not reported as removed | `reports a skill the repo does not carry as not found` | covered |
| I take a globally deployed skill off every tool in one action | `removes the skill with the ref the global lockfile records` + `clears a globally removed skill from every tool, sparing the rest` | migrated (#431) |
| The copy left by a tool I no longer have goes too | `reclaims the copy left for a tool this machine no longer detects, once confirmed` | covered |
| A leftover copy I never confirmed is left alone | `leaves the leftover copy alone when nothing confirmed it` | covered |
| A guessed confirmation for the leftover copy is never honored | `leaves the leftover copy alone for a token the caller merely guessed` | covered |
| A machine with no supported tool has no global scope to remove from | `refuses when the machine has no supported tool` | covered |
| The global confirmation says what a removal would cost | `names what the removal would destroy before it runs` | covered |

## wiring-smoke → server-health.test.ts

| Scenario | Integration counterpart | State |
|---|---|---|
| the cockpit server reports healthy | `reports the cockpit server as healthy` | covered |
