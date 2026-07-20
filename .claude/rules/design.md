# Design source (project-specific for Maestro)

## Sources

- **Design system** — `.impeccable/design.json`, managed via `/impeccable`.
  Chain: `design.json` → `packages/web/src/styles/tokens.css` (ships) →
  `DESIGN.md` (regenerated, never hand-edited). On token conflict,
  `design.json` wins.
- **Flow screens** — Claude Design, via `DesignSync` (`list_projects`,
  `get_file`). Read live; no local copy. Issues link the screen and name its
  frames.

Never take design values (colour, size, spacing) from a flow screen; build
from the tokens.

## Verify before "done"

Screenshot the built UI and compare it to the design screen. The vitest/jsdom
suite renders without CSS, so only a screenshot proves visual fidelity (see
`LEARNINGS.md`).
