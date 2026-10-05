# Architecture boundaries (project-specific for Maestro)

Where each kind of code lives. Package shape fixed by ADR-0002.

## The three layers

- **`core` — the brains.** Domain model, drift, ports, and the adapters that implement them. Node built-ins (`node:fs`, `node:child_process`) only behind a port. No React, no Hono, no HTTP, no JSX. Product behavior lives here.
- **`server` — the plumbing.** Transport only: Hono routes, Zod at the edge, delegate to `core`. No domain logic, no drift math, no business rules.
- **`web` — the screen.** UI only: React, talks to `server` over HTTP. Never touches the filesystem, never shells out.

Direction: `web` → HTTP → `server` → `core`. Never the reverse. `core` depends on nothing else in this repo.

**`web` imports `core` types; it never copies them.** A value comes from `server` over HTTP.

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
- Give every `as` cast a reason a reviewer can check. A cast on a copy table or
  a notice needs a test that renders its result.

## Function signatures

- Scrutinise every optional parameter. A caller that omits it gets the default silently; prefer a required parameter over backwards compatibility.

## Interface design

### Deep modules

Prefer deep modules: small interface, deep implementation. A few methods with
simple params hiding complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through
to thin implementation. When designing, ask: can I reduce the number of methods?
Can I simplify the parameters? Can I hide more complexity inside?

### Design for testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects.**
3. **Small surface area.**
