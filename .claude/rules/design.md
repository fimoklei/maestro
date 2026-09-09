# Design source (project-specific for Maestro)

## Sources

- **Design system** — `.impeccable/design.json`, managed via `/impeccable`. Chain: `design.json` → `packages/web/src/styles/tokens.css` (ships) → `DESIGN.md` (regenerated, never hand-edited). On token conflict, `design.json` wins.
- **Flow screens** — Claude Design, via `DesignSync` (`list_projects`, `get_file`), read live by default. A static export under `docs/design/` is frozen; re-fetch via DesignSync for current state.

Never take design values (colour, size, spacing) from a flow screen; build from the tokens.

- **Copy** — `.claude/rules/copy.md` (ADR-0025). Every user-facing word the cockpit shows is written and reviewed against it.

## Accessible labels

- Include the visible label's words in the accessible name, in the same order
  and at the start. Name icon-only controls by their action and landmarks by
  their content. Review the name with the control or region it describes.
- Give fields visible labels; hints supplement them. Show status meaning in
  text as well as colour. Name link destinations in the link text.

## Verify before "done"

Mandatory for any change that alters what `packages/web` renders:

1. Start `pnpm smoke` in the background. It seeds the sandbox HOME and connects
   nothing (ADR-0010), so the cockpit comes up on the connect gate.
   - Verifying a first-run screen → stop here; that is the state you need.
   - Verifying anything the cockpit shows once connected → run `pnpm smoke:ready`,
     which waits for the cockpit, connects the inventory and registers one repo.
2. Screenshot the changed UI with `agent-browser`.
3. Read changed copy at a narrow width and at 200% zoom.
4. Compare against the design source; on mismatch, fix before claiming done.
5. Run the `verify-in-smoke` checks before treating the screenshot as proof.
6. Record the evidence in the commit body: the absolute screenshot path and the
   cockpit URL from `pnpm cockpit:url`.

Only a screenshot proves visual fidelity — the vitest/jsdom suite renders without CSS.
