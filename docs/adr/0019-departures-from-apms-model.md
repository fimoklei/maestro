# ADR-0019 — Where the authoring route departs from APM's model

- **Status:** Accepted
- **Date:** 2026-07-30 (issue #400, on the authoring-side map #343)
- **Amended in place.** This ADR is a register, not a snapshot — see
  *Consequences*.

## Context

Michiel's standing constraint, 2026-07-28: the producer side follows APM's
mental model (<https://microsoft.github.io/apm/quickstart/>), and **when
something deviates, the first move is to go back and read what APM says.**

That constraint had no home. Departures accumulated inside separate ADRs and
wayfinder tickets, where nobody read them as a set, and a session that met one
in isolation re-derived APM's model from the docs to judge it.

This file records what Maestro **decided**. What apm *does* is
`docs/apm-behavior.md`; what an agent *must do* when driving apm is
`.claude/rules/apm-driver.md`.

## Decision

Six entries. Each names what APM says, what this route does, and the verdict:
**deliberate**, **drift**, or **not a departure**.

### 1. The version lives on a git tag, not in the package manifest — deliberate

- **APM:** a package carries its version in `apm.yml`'s `version:`; a consumer
  installs the package at that version.
- **This route:** the git tag is the only version number. `apm.yml`'s
  `version:` is inert. A consumer pins one skill by subpath at a tag.
- **Why:** the marketplace was ruled out 2026-07-27 and measured unreachable by
  #354, so no package-install route exists to carry a manifest version.
  Maestro's consumer side deploys skills selectively. Banked in #350;
  ADR-0003, ADR-0014.

### 2. The producer ladder is not APM's ladder — deliberate

- **APM:** author under `.apm/` → `apm compile` → `apm preview` / `apm view` →
  `apm pack` → `apm publish`. *"There is no separate build pipeline — the CLI
  is the build pipeline."*
- **This route:** author outside Maestro → **promote** (commit + push) → merge
  on GitHub → **release** (git tag). None of APM's five steps run. Maestro
  drives four subcommands only — `install`, `uninstall`, `outdated`, `view`
  (`packages/core/src/deploy/apm-cli-driver.ts`, read 2026-07-30).
- **Why `compile` is not run**, three reasons, any one sufficient:
  - It is not needed. A consumer's `apm install` reads the ref's subpath in
    the source tree; a ref's subpath is literal, with no discovery fallback
    (`docs/apm-behavior.md` → Producer). `agent-harness` holds no compiled
    output at all — its `.claude/` contains only `worktrees/` and
    `settings.local.json` (checked 2026-07-30) — and the consumer route
    installs from it.
  - It is destructive here. `apm compile` rewrites `AGENTS.md` and
    `CLAUDE.md`, both hand-owned in this repo (#346).
  - It would break #349's rule that Maestro commits only the diff its own
    operation caused: compile emits a generated tree that `promote` would then
    carry into a commit.
- **Why `pack` / `publish` are not run:** both lead to the marketplace, ruled
  out 2026-07-27 and measured by #354.

### 3. A skill from outside is copied in, never depended on — deliberate

- **APM:** reuse is a dependency — declare it in `apm.yml`'s
  `dependencies.apm`, pin a version, update later.
- **This route:** import copies the folder into the working tree and the skill
  becomes the team's. `dependencies.apm` stays empty (`agent-harness/apm.yml`
  reads `apm: []`).
- **Why:** #351; Michiel, 2026-07-28. The dependency model is still alive
  downstream — a consuming repo depends on the harness. The harness itself
  depends on nothing.
- **Accepted cost:** when the original author improves the skill, nobody here
  hears about it. A provenance receipt was proposed against this cost and
  rejected on #351 — a receipt notifies nobody.

### 4. "Harness" means something else here than in APM — drift

- **APM:** a harness is the **agent platform** — Copilot, Claude, Cursor —
  detected from `.github/`, `.claude/` (quickstart glossary). It is where
  primitives *arrive*.
- **This route:** "harness" is the central inventory repo — where primitives
  *depart from* — and #347 banked **Harness** as the authoring view's name.
- **Drift, not a decision.** Nobody chose to reuse APM's word for the opposite
  end of the pipe; it arrived with the repo name `agent-harness` and reached
  the screen from there. `CONTEXT.md` already lists `harness` under *Avoid*
  ("that is the inventory repo, not the product") and the view was named it
  anyway.
- **Consequence:** a newcomer who reads APM first learns *harness = my tool*,
  then opens a Harness view whose subject is the team's shared repo.
- **Not corrected here.** Naming the published and working states is #352's
  job — its *Record* list already owns the `CONTEXT.md` terms and the *Avoid*
  list. This entry is an input to it.

### 5. `.apm/skills/` is APM's shape; root `skills/` is legacy — resolved drift

- **APM:** primitives live under `.apm/` of a package.
- **This route:** `.apm/skills/`, banked by #355 and measured in #344 — so the
  target shape is APM's, and only the legacy departs: `agent-harness` holds
  root `skills/`.
- **Resolved by #360:** `agent-harness` is retired rather than migrated, so no
  repo carries both shapes and the subpath stays a constant. A harness is
  recognised by `apm.yml` in the repo root — APM's own marker.
- Root `skills/` is still hard-coded in `core` (`deployed-ref.ts`,
  `inventory-git.ts`, `package-ref.ts`, the registry readers) and in two
  `packages/server/src/app.ts` messages. Those travel with the spec; no
  decision is left.

### 6. Review is Maestro's concept, not APM's — not a departure

- **APM:** says nothing at all about review, approval, or who may publish.
- **This route:** step 3 of the five is "committed and reviewed", and review
  means **merged on `main`** (#365; Michiel, 2026-07-28). Maestro gates
  nothing and reads no GitHub API.
- **A gap APM leaves open, filled deliberately** — not a deviation to correct.
  Recorded here so it is never mistaken for an APM rule.
- Noted, not reopened: the Harness view's middle table is named **Pending
  review** (#347) while review itself is dark to Maestro. What Maestro
  measures is *pushed, and the commit is not yet an ancestor of
  `origin/main`*. The name matches this team's definition of review; it is not
  a check.

## Consequences

- **This register is amended in place**, never superseded by a later ADR. That
  breaks the usual one-decision-one-ADR shape on purpose: the value of this
  file is reading the departures as one set, and splitting them across
  ADR-0019 / 0023 / 0027 rebuilds the exact problem #400 was opened to fix.
- `.claude/rules/apm-driver.md` points here from its *Grounding* section, so an
  agent about to depart meets the accepted list before re-deriving APM's model
  from the docs.
- Nothing in this register is user-visible. The release dialog shows the delta
  since the last tag with the author per change (#347) — showing, not telling.

## Rejected alternatives

- **A section in `docs/apm-behavior.md`.** That file records what apm *does*,
  states in its own header that decisions live in ADRs, and is rewritten
  section by section on every apm upgrade. Departures from APM's *model* do
  not change when apm bumps a version, so an upgrade would churn them for the
  wrong reason.
- **One ADR per departure.** Restores the scattering #400 exists to end.
- **Telling the user that Maestro checks nothing.** A warning that changes no
  behaviour is noise, and it makes the product sound defensive; the release
  dialog already shows what goes out and who wrote it. Michiel, 2026-07-30.
