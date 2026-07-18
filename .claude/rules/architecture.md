# Architecture boundaries (project-specific for Maestro)

Where each kind of code lives. Read before adding code to `core`, `server`, or `web`, or before adding a dependency to any of them. The package shape is fixed by ADR-0002. pnpm blocks an import between packages that declare no dependency on each other; the rest of this file is convention, and only review upholds it.

## The three layers

- **`core` — the brains.** Domain model, drift, ports, and the adapters that implement them. May use Node built-ins (`node:fs`, `node:child_process`) behind a port. No React, no Hono, no HTTP, no JSX. Product behavior lives here.
- **`server` — the plumbing.** Transport only: Hono routes, Zod at the edge, delegate to `core`. No domain logic, no drift math, no business rules.
- **`web` — the screen.** UI only: React, talks to `server` over HTTP. Never touches the filesystem, never shells out.

Direction: `web` → HTTP → `server` → `core`. Never the reverse. `core` depends on nothing else in this repo.

**`web` may import types from `core` — types only.** A wire shape `core` produces and `web` renders lives in `core`; `web` re-exports it instead of copying it (issue #156, `use-browse-filesystem.ts`). Write `import type`: `verbatimModuleSyntax` erases it, so no `core` runtime reaches the browser bundle. Importing a *value* stays forbidden — it puts domain logic on the screen and drags `node:fs` into Vite's graph. Call `server` instead. `web` holds `@maestro/core` as a **devDependency**, so a runtime import shows up as a mislabelled one.

## Ports & adapters

- Outside-world access (filesystem, `apm` CLI, git) sits behind a **port** (an interface) in `core`.
- Pure logic depends on the port, not the concrete adapter.
- Adapters live in `core`, not `server` — so a future client (e.g. a CLI) can reuse them (ADR-0002).
- Test split (see `testing.md`): pure logic → sibling unit tests, no I/O; adapters → `tests/integration/`.

## Validation

- Validate where data crosses a trust boundary: HTTP requests in `server`, and any parse of external data (lockfiles, `apm.yml`, `apm` output).
- Order: normalize → validate with Zod → pass typed data inward.
- Inside `core`, data is trusted; the boundary already checked it.
- Untrusted-input specifics (shelling out, paths, parsing) → `security.md`.
