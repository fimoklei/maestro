# Architecture boundaries (project-specific for Maestro)

Where each kind of code lives. Read before adding code to `core`, `server`, or `web`, or before adding a dependency to any of them. The package shape is fixed by ADR-0002. pnpm's workspace graph blocks any import a package has no dependency on; everything past that — including the type-only limit on `web` → `core` below — is convention this file states and review upholds, not something tooling catches.

## The three layers

- **`core` — the brains.** Domain model, drift, ports, and the adapters that implement them. May use Node built-ins (`node:fs`, `node:child_process`) behind a port. No React, no Hono, no HTTP, no JSX. Product behavior lives here.
- **`server` — the plumbing.** Transport only: Hono routes, Zod at the edge, delegate to `core`. No domain logic, no drift math, no business rules.
- **`web` — the screen.** UI only: React, talks to `server` over HTTP. Never touches the filesystem, never shells out.

Direction: `web` → HTTP → `server` → `core`. Never the reverse. `core` depends on nothing else in this repo.

**`web` may import types from `core`, and only types.** A wire shape that `core` produces and `web` renders has one source of truth in `core`; `web` re-exports it rather than hand-copying it (issue #156). The import must be `import type` — `verbatimModuleSyntax` then erases it, so no `core` runtime code (and no Node built-in behind it) can reach the browser bundle. Importing a *value* from `core` into `web` is still forbidden: it would put domain logic on the screen and drag `node:fs` into Vite's graph. Reaching `core`'s behavior from `web` stays an HTTP call to `server`. Nothing enforces this — `web` carries `@maestro/core` as a **devDependency** to say the reliance is build-time only, so a runtime import is at least visible as a mislabelled dependency, but only review catches it. `web` imports the shared wire types from `use-browse-filesystem.ts`, which re-exports them, so there is one place to look when the rule needs revisiting.

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
