# Design source (project-specific for Maestro)

Where the UI design lives and how to build against it. Read before building a
component or screen to a design.

## Read the design from the live source

The design lives in Claude Design projects, read through the `DesignSync` MCP
tool (`list_projects` to find them, `get_file` to read one):

- **Design system** — tokens, component contracts, guidelines. Mirrored under
  `docs/design/control-room/` and owned in the app's Tailwind theme (ADR-0008).
  Port from these; don't import them.
- **Flow screens** — the per-feature layout and copy (for example, the "First
  run story flow"). No local copy exists; read them live. An issue that needs a
  screen links to it and names its frames.

On any conflict, the live design wins over the ported copy.

## Verify before "done"

Screenshot the built UI and compare it to the design screen. The vitest/jsdom
suite renders without CSS, so its tests pass whether or not the styling matches
— only a screenshot proves visual fidelity (see `LEARNINGS.md`).
