# Architecture boundaries (project-specific for Maestro)

Where each kind of code lives. Package shape fixed by ADR-0002.

## The three layers

- **`core` — the brains.** Domain model, drift, ports, and the adapters that implement them. Node built-ins (`node:fs`, `node:child_process`) only behind a port. No React, no Hono, no HTTP, no JSX. Product behavior lives here.
- **`server` — the plumbing.** Transport only: Hono routes, Zod at the edge, delegate to `core`. No domain logic, no drift math, no business rules.
- **`web` — the screen.** UI only: React, talks to `server` over HTTP. Never touches the filesystem, never shells out.

Direction: `web` → HTTP → `server` → `core`. Never the reverse. `core` depends on nothing else in this repo.

**`web` may import types from `core` — types only.** Write `import type`; never copy a `core` type into `web`. Importing a *value* is forbidden: call `server` instead.

## Ports & adapters

- Outside-world access (filesystem, `apm` CLI, git) sits behind a **port** (an interface) in `core`.
- Pure logic depends on the port, not the concrete adapter.
- Adapters live in `core`, not `server` (ADR-0002).
- Test split (`testing.md`): pure logic → sibling unit tests; adapters → `tests/integration/`.

## Validation

- Validate where data crosses a trust boundary: HTTP requests in `server`, and any parse of external data (lockfiles, `apm.yml`, `apm` output).
- Order: normalize → validate with Zod → pass typed data inward.
- Inside `core`, data is trusted; the boundary already checked it.
- Untrusted-input specifics → `security.md`.
