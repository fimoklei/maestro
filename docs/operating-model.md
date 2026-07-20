# Operating Model — Maestro

How this product is run: **one board, one loop, five terms.** This page is the
shape and the why; the transition mechanics live in the board's Legend
(`docs/jobs.md`), executed by the `jobs` skill.

## The idea

Jobs are the product spine. A job describes progress a user wants to make
("see what is deployed where"), never a feature ("build a table component").
Features exist only as part of a job, and work happens **one job at a time**.

## The board — `docs/jobs.md`

The single steering document, one page:

- **Header** — the product bet and its kill question. The one honesty check:
  if the owner still opens lockfiles or runs `apm` by hand, the product is
  failing — no matter how many jobs are done.
- **NOW** — exactly one job, the one currently in the loop.
- **NEXT** — one job, with one line why it is next.
- **LATER** — names only; detail lives in tracker issues.
- **DONE** — shipped jobs, one line each.
- **Out of scope** — jobs deliberately not being done; binding.

## The loop (per job)

```text
pick job (NEXT → NOW, at grill start)
→ grill (one altitude: design the whole job)
→ /to-spec: one spec issue, sliced into sub-issues (the tracker takes over)
→ TDD implementation
→ ship: the PR that closes the spec issue moves the job to DONE in the same diff
→ pick the new NEXT (one line why)
```

**1 job = 1 spec issue.** If one grill cannot design the job into one spec, the
job is too big — split it on the board. That one rule replaces roadmaps,
sub-steps, and grill altitudes.

## Two kinds of work

- **Job work** — new capabilities, anything spec-sized. Through the board.
- **Small work** — bug fixes, polish, chores. A tracker issue is enough.

## Where things live

- **Board** (`docs/jobs.md`) — steering and status. The only planning doc.
- **Tracker** (GitHub Issues) — everything volatile: spec issues, sub-issues,
  ideas. New ideas become issues, never board rows.
- **`docs/brief.md`** — why the product exists.
- **`CONTEXT.md`** — the glossary.
- **`docs/adr/`** — binding decisions.
- **`.claude/rules/`** — how agents work in this repo.
- **`PRODUCT.md`** / **`DESIGN.md`** — the design-facing summaries agents read
  before building UI. Summaries only; see the conflict rule.

## Conflict rule

When documents disagree: `docs/jobs.md` (what now) → accepted ADRs (what was
decided) → `CONTEXT.md` (what words mean) → `docs/brief.md` (why) → `PRODUCT.md`
and `DESIGN.md` (the design-facing summaries). Unresolvable conflict → stop and
flag, do not guess.

`PRODUCT.md` restates `docs/brief.md`; `DESIGN.md` restates the Control Room
system, which is designed in Claude Design and shipped as
`packages/web/src/styles/tokens.css`. Both rank below their source, so a stale
summary never overrules the original.

## The five terms

- **Job** — progress a user wants to make; the unit of work and of scope.
- **Board** — `docs/jobs.md`: NOW / NEXT / LATER / DONE.
- **Loop** — one job's path from grill to DONE.
- **Grill** — the interview that designs a job before anything is built.
- **Spec issue** — the grill's output: one tracker issue (`/to-spec`) sliced
  into sub-issues.
