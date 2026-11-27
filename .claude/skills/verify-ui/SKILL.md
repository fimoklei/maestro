---
name: verify-ui
description: Browser check of a cockpit change in `pnpm smoke` and Storybook — screenshots per state and theme, narrow width, 200% zoom, the primary flow. Use before calling any change to what `packages/web` renders done, or before committing it.
---

# Verify a cockpit change

Run every step for a change that alters what `packages/web` renders. The check
is done when step 8's commit-body list names every screen, state, theme, width
and zoom the change touches, and each state you could not reach.

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
   - Global behind, with local edits, a missing copy and a copy not updated
     in its folders → `--scenario global-folders`.
   - No tool detected → `--scenario no-tools`: alone it shows No targets
     yet; with a repo scenario (`no-tools,empty`) Global shows no tool beside
     that repository.
   - A state no scenario seeds, or a write's answer the dialog never asks
     for → stub the route before the action, its body always read from a
     file: `ab network route "<route glob>" --body "$(cat <file>.json)"`;
     `ab network unroute` ends it. Global's read takes
     `"**/api/deploy-state/global"`, shaped as core's
     `GlobalDeployStateResult`. A write's real answer comes from the API:
     after `--scenario global-folders`, `curl` a `POST /api/deploy/bulk` of
     `code-review` to Global (headers `content-type: application/json` and
     `origin: <cockpit URL>`) into the file, then route
     `"**/api/deploy/bulk"`: code-review comes back refused while its
     v1.1.0 copy stays in both folders. Name the state as stubbed in step 8.
   - In smoke, `gh` reads reach GitHub and its pull-request writes stop in
     the sandbox (`scripts/smoke-gh.mjs`), so a proposal opens no pull
     request.
2. Screenshot the changed UI with `agent-browser --session maestro-<worktree folder>`,
   in each theme. Repeat it through a function, `ab(){ agent-browser --session
   maestro-<worktree folder> "$@"; }`, never a variable. Switch theme with
   `ab set media dark` or `ab set media light`. Read a region as text with
   `pnpm cockpit:snapshot "<selector>" [path]`, never a bare `agent-browser snapshot`;
   the open detail pane is `'aside[aria-label$=" detail"]'`.
   Open a hover card with `pnpm cockpit:hover "<selector>"`: it hovers the
   element and prints the open card's text; screenshot after it. Screen
   paths: `/` (Deploy-state), `/repositories`, `/inventory/skills`,
   `/inventory/prompts`, `/harness`; `packages/web/src/shell/screens.tsx`
   holds the list. Sort a column with the button inside its `th`; a click on
   the header cell itself sorts nothing: `ab eval '[...document.querySelectorAll("th")].find((e) => e.textContent.trim() === "<header>").querySelector("button").click()'`.
   Scroll the detail pane with `ab eval 'document.querySelector("aside
   div.overflow-y-auto").scrollTop = <px>'`, then screenshot for the new pixel
   positions.
3. Screenshot every state the change touches (loading, empty, failure,
   disabled, selected, the longest realistic name) in the changed component's
   stories, in each theme. Add a missing state as a story (`frontend.md` →
   Stories). A state only the data-fetching screen shows: screenshot it in
   smoke, or name it as not reached. Start Storybook with `pnpm --filter @maestro/web storybook --ci
   --no-open` in the background and take the URL from its `Local:` line; open
   `<url>/iframe.html?id=<story id>&viewMode=story&globals=theme:dark` (story
   ids: `<url>/index.json`).
4. Read changed copy at a narrow width (`ab set viewport 390 844`) and at 200%
   zoom (`ab set viewport 720 450 2`: a 1440×900 window at 200%), in one theme.
5. Compare against the design source (`design.md` → Sources), then judge hierarchy, density,
   alignment and consistency. Fix each mismatch and screenshot again; done
   when a fresh screenshot shows none. Name in chat, as you see it, every
   defect a screenshot shows outside the change, with its screenshot and an
   offer to open an issue.
6. Click through the screen's primary flow once in smoke.
7. Run the `verify-in-smoke` checks before treating the screenshot as proof.
8. Save each screenshot under `~/Pictures/maestro/<branch>/`. In chat, give each as
   a full `file:///Users/…` link on its own line, without backticks. In the commit
   body, list what the check covered: each screen, state, theme, width and zoom.
   Name each state you could not reach.
9. Stop the run with `pnpm smoke:stop` and stop Storybook.
