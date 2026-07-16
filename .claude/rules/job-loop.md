# Job loop (project-specific for Maestro)

The board and the loop that run this product. Read when starting a grill,
picking the next job, or creating/closing a spec issue. The why and the shape
live in `docs/operating-model.md`; this file is the mechanics an agent must
execute at each moment.

## The board — `docs/jobs.md`

- Four lanes: **NOW** (exactly one job), **NEXT** (one job + one line why),
  **LATER** (names only), **DONE** (one line each).
- WIP limit: NOW holds exactly one job. An empty NOW is honest — it means no
  loop is running.
- The header carries the product bet and its kill question. The *Out of scope*
  table at the bottom is binding.

## The loop (per job)

```text
grill → spec issue (/to-spec) + sub-issues → TDD implementation → ship
→ board update (NOW → DONE) → pick the new NEXT
```

One grill altitude. If one grill cannot design the job into **one** spec issue,
the job is too big: split it on the board and keep the first slice in NOW.

## Moment rules

- **Grill start** — put the job in NOW by name (`<job> — in grill`). It may
  come from NEXT, LATER, or be brand new; remove it from its old lane. Pick a
  new NEXT (one line why), with a glance at LATER and open tracker issues.
- **Spec issue created** — write its number on the NOW line
  (`<job> · #NNN`). A job whose spec already exists enters NOW with its number.
- **Ship** — the PR that closes the issue named in NOW moves the job to DONE
  (one line) **in the same diff**. Never merge that PR without the board edit.
- **Loop stopped** — move the job back to LATER or drop it, one line why.

## Two kinds of work

- **Job work** — new capabilities and anything spec-sized (it needs
  `/to-spec`). Goes through the board.
- **Small work** — bug fixes, polish, chores. A tracker issue is enough; it
  never appears on the board. If it turns out to need a spec, it is a job:
  stop and put it on the board.

## Self-healing

If the board disagrees with reality — a closed spec issue still in NOW, work
clearly running that the board does not show — fix the board in passing and
mention it.
