# ADR-0034 — A category is the operator's own record, one list per Harness

- **Status:** Accepted
- **Date:** 2026-10-30 (decided in #1581 and #1713; spec #1717)

## Context

Skills and Prompts list a Harness's items flat. Operators asked to sort them
into categories of their own (#1577). The category of an item must live
somewhere, and every place weighed has a cost:

- **A `category:` line in `SKILL.md` or the prompt's front matter.** A
  category gives the agent nothing, yet every edit changes the skill and puts
  every target that holds it on **Behind** (#1579, ADR-0027).
- **`.maestro/categories.yml` in the Harness**, read from the latest release.
  apm never delivers `.maestro/`, but a category change then needs a proposal,
  a review and a release before it shows (#1581).
- **The same file, read from the Working harness.** It shows at once for the
  operator who made it, but the edit sits uncommitted in the clone. One shared
  file makes that the normal case, and an uncommitted edit plus a teammate's
  merged edit stops catch-up at `local-changes` for every Harness change (#1713).
- **A shared list kept in git without that risk**: a standing
  `maestro/categories` branch, one file per item, a merge inside the cockpit, or
  a push to the default branch. Each turns sorting an item into a GitHub round
  trip, adds a proposal kind outside the per-primitive model, or needs push
  rights a protected branch refuses (ADR-0023). GitHub labels through `gh` add
  a store outside git and make `gh` required (ADR-0001, ADR-0029).

Instant and shared needs a server. Maestro is local and git is its only shared
store, so instant means personal.

## Decision

**A category is the operator's own record in Maestro's config file under
`MAESTRO_HOME`, one list per Harness. It never lives in the Harness, a
`SKILL.md` or a prompt's front matter.**

1. **One `categories` key** in the config holds a list of per-Harness entries.
   Each entry holds the Harness key, the category names and the assignments,
   each `{ type: "skill" | "prompt", name, category }`. An item is named by its
   type and its directory or file name, as Inventory names it.
2. **The Harness key** is the git origin (`host/ownerRepo`) when the Harness
   has one, else the realpath of its root. Each entry stores both the origin
   and the root it last saw. Lookup tries the origin first, then the root;
   every save writes the current origin and root onto the entry it found. A
   second clone of the same repository finds the same list, and a repository
   renamed on GitHub is found by its root and takes the new origin.
3. **Separate validation.** The config schema passes the `categories` value
   through unparsed; the category module validates it with its own schema. A
   malformed section fails every category read and write, never the rest of
   the config, and is never overwritten. The operator repairs it by hand; the
   cockpit offers no reset.
4. **Writes go through `ConfigStore.update`**, so they serialize with every
   other config write.
5. **A change shows at once.** Nothing is committed, proposed or released, and
   no target changes.

## Consequences

- Teammates never see an operator's categories. Sharing them, or carrying them
  to another computer, is a later job (#1713).
- Pointing Maestro at another Harness never mixes names; switching back finds
  the old list.
- An item renamed or deleted outside Maestro leaves a stale assignment; reads
  skip it and the next save drops it.
- Import reads a `metadata.category` line from `SKILL.md` or a prompt's front
  matter to fill its field. Nothing writes one back.

## Rejected alternatives

- **`SKILL.md` or front matter**: puts targets on **Behind** for a change the
  agent never reads.
- **`.maestro/categories.yml` in the Harness**, from the release or the Working
  harness: a GitHub round trip per change, or a clone that stops catching up.
- **The shared-list designs** (standing branch, one file per item, cockpit
  merge, push to the default branch, GitHub labels): each costs a round trip, a
  new proposal kind, push rights or a required `gh`.
