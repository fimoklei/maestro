# Design source (project-specific for Maestro)

## Sources

- **Design system** — `.impeccable/design.json`, managed via `/impeccable`. Chain: `design.json` → `packages/web/src/styles/tokens.css` (ships) → `DESIGN.md` (regenerated, never hand-edited). On token conflict, `design.json` wins.
- **Flow screens** — Claude Design, via `DesignSync` (`list_projects`, `get_file`), read live by default. A static export under `docs/design/` is frozen; re-fetch via DesignSync for current state.

Never take design values (colour, size, spacing) from a flow screen; build from the tokens.

## Verify before "done"

Mandatory for any change that alters what `packages/web` renders:

1. Run the app (`pnpm dev`, or `pnpm smoke` for a sandbox).
2. Screenshot the changed UI with `agent-browser`.
3. Compare against the design source; on mismatch, fix before claiming done.
4. Run the `verify-in-smoke` checks before treating the screenshot as proof.

Only a screenshot proves visual fidelity — the vitest/jsdom suite renders without CSS.
