# Operating Model — Maestro

How this product is run: **one board, one loop, five terms.** This page is the
shape and the why; the rules live in the Legend of `docs/jobs.md`, executed by
the `jobs` skill.

## The idea

Jobs are the product spine. A job describes progress a user wants to make
("see what is deployed where"), never a feature ("build a table component").
Features exist only as part of a job, and work happens **one job at a time**.

## The board — job issues

The board is the set of GitHub issues labelled `job`; `docs/jobs.md` holds the
need they serve:

- **The bet** — the product bet and its kill question. The one honesty check:
  if the owner still opens lockfiles or runs `apm` by hand, the product is
  failing — no matter how many jobs are done.
- **Themes** — the `theme:*` labels every job carries.
- **Out of scope** — jobs deliberately not being done; binding.
- **Lanes** — `job:now` (exactly one job, the one in the loop), `job:next`
  (optional), LATER (open, no lane label), DONE (closed).

## The loop (per job)

```text
pick job (job:now, at grill start)
→ grill (one altitude: design one spec)
→ /to-spec: a spec issue under the job, sliced into sub-issues
→ TDD implementation
→ ship: the PR closes the spec issue
→ all specs closed: the operator confirms the need is met, the job closes
```

**One grill = one spec issue.** A job may hold several specs; if one grill
cannot design a spec, the spec is too big — split it. That one rule replaces
roadmaps, sub-steps, and grill altitudes.

## Two kinds of work

- **Job work** — a new capability. Its spec hangs under a job.
- **Small work** — improving what already exists: bug fixes, polish, redesigning
  a screen, chores. A tracker issue is enough, however many sub-issues it grows.

## Where things live

- **`docs/jobs.md`** — the bet, the themes and out of scope. The only planning
  doc.
- **Tracker** (GitHub Issues) — everything volatile: jobs and their lanes, spec
  issues, sub-issues, ideas.
- **`docs/brief.md`** — why the product exists.
- **`CONTEXT.md`** — the glossary.
- **`docs/adr/`** — binding decisions.
- **`.claude/rules/`** — how agents work in this repo.
- **`PRODUCT.md`** / **`DESIGN.md`** — the design-facing summaries agents read
  before building UI. Summaries only; see the conflict rule.

## Conflict rule

When documents disagree: `docs/jobs.md` (what we bet on) → accepted ADRs (what was
decided) → `CONTEXT.md` (what words mean) → `docs/brief.md` (why) → `PRODUCT.md`
and `DESIGN.md` (the design-facing summaries). Unresolvable conflict → stop and
flag, do not guess.

`PRODUCT.md` restates `docs/brief.md`; `DESIGN.md` restates the design
system in `.impeccable/design.json`, shipped as
`packages/web/src/styles/tokens.css` (ADR-0033). Both rank below their source, so a stale
summary never overrules the original.

## The five terms

- **Job** — progress a user wants to make; the unit of work and of scope.
- **Board** — the `job` issues and their lanes: NOW / NEXT / LATER / DONE.
- **Loop** — one spec's path from grill to ship; a job closes when its need is met.
- **Grill** — the interview that designs one spec of a job before anything is
  built.
- **Spec issue** — the grill's output: one tracker issue (`/to-spec`) sliced
  into sub-issues.
