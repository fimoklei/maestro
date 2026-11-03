---
paths:
  - "packages/web/src/**/*.tsx"
  - "packages/web/src/**/*.css"
  - "packages/web/index.html"
  - ".impeccable/**"
  - "DESIGN.md"
---

# Verify a cockpit change (project-specific for Maestro)

Mandatory for any change that alters what `packages/web` renders:

1. Start `pnpm smoke` in the background: this worktree's own ports, sandbox
   config, connect gate.
   - A first-run screen → stop here.
   - A connected screen → `pnpm smoke:ready`; a deploy, Harness, Prompts or
     category state → `--scenario <name>[,<name>]` (each scenario and what it
     seeds: `pnpm smoke:ready --list`). Every scenario's Harness holds three
     released prompts, one with an Example and one in a category.
   - `smoke:ready` waits up to 60 s for the cockpit and prints its URL: run it
     straight after `pnpm smoke`, with no wait loop.
   - A newer or older release after seeding → `pnpm smoke:release <tag>`
     (`v1.0.0`, `v1.1.0`, `v2.0.0`).
2. Screenshot the changed UI with `agent-browser --session maestro-<worktree folder>`,
   in each theme. Repeat it through a function, `ab(){ agent-browser --session
   maestro-<worktree folder> "$@"; }`, never a variable. Read a region as text with
   `pnpm cockpit:snapshot "<selector>" [path]`, never a bare `agent-browser snapshot`.
3. Screenshot every state the change touches (loading, empty, failure,
   disabled, selected, the longest realistic name) in the changed component's
   stories, in each theme. Add a missing state as a story (`frontend.md` →
   Stories). A state only the data-fetching screen shows: screenshot it in
   smoke, or name it as not reached. Start Storybook with `pnpm --filter @maestro/web storybook --ci
   --no-open` in the background and take the URL from its `Local:` line; open
   `<url>/iframe.html?id=<story id>&viewMode=story&globals=theme:dark` (story
   ids: `<url>/index.json`).
4. Read changed copy at a narrow width and at 200% zoom, in one theme.
5. Compare against the design source (`design.md` → Sources), then judge hierarchy, density,
   alignment and consistency. Fix each mismatch and screenshot again; done
   when a fresh screenshot shows none.
6. Click through the screen's primary flow once in smoke.
7. Run the `verify-in-smoke` checks before treating the screenshot as proof.
8. Save each screenshot under `~/Pictures/maestro/<branch>/`. In chat, give each as
   a full `file:///Users/…` link on its own line, without backticks. In the commit
   body, list what the check covered: each screen, state, theme, width and zoom.
   Name each state you could not reach.
9. Stop the run with `pnpm smoke:stop` and stop Storybook.

Only a screenshot proves visual fidelity — the vitest/happy-dom suite renders without CSS.
