# ADR-0012 — `web` imports `core`'s wire types, and only its types (amends ADR-0002)

- **Status:** Accepted — amends ADR-0002 (the three-package shape stands; `web`
  gains a build-time edge to `core`). The browse types it cites as the example
  were removed in #1080 (ADR-0032); the rule stands.
- **Date:** 2026-07-18

## Context

ADR-0002 fixed the three packages and the direction between them: `web` → HTTP
→ `server` → `core`. It said nothing about the **shapes** that travel over that
HTTP boundary, because at the time each screen declared its own.

That silence cost something. `BrowseEntry` and `BrowseEntryFacts` — what the
browse endpoint returns — were written out twice: once in
`packages/core/src/filesystem/browse-filesystem.ts`, which produces them, and
once in `packages/web/src/shell/use-browse-filesystem.ts`, which renders them.
Nothing kept the two in step. Adding a fact meant editing both and finding out
at runtime if you forgot (issue #156, deferred from #150's review).

A type-only import fixes it, but `web` had no dependency on `core` at all, and
that absence was itself a guard: with no edge in the workspace graph, pnpm
refused any import, so `web` could not reach domain logic even by accident.
Opening the edge for types opens it for values too.

## Decision

**`web` declares `@maestro/core` as a `devDependency` and imports types from it
with `import type`. Values stay forbidden.**

- The wire shape lives in `core`, which produces it. `web` re-exports it from
  `use-browse-filesystem.ts`, so every component in `web` still imports it from
  its own package and there is one place to look when this decision is
  revisited.
- `verbatimModuleSyntax` (set repo-wide in `tsconfig.base.json`) erases an
  `import type`, so no `core` runtime — and no Node built-in behind it — can
  reach the browser bundle. Verified: after the change, `vite build` emitted a
  byte-identical bundle, and a grep for `core` symbols and `node:fs` in it
  returns nothing.
- **`devDependency`, not `dependency`,** because the reliance is build-time
  only. A value import would then show up as a mislabelled dependency — a weak
  signal, but the only one available.

## Consequences

- A new fact field is edited once, in `core`.
- **Nothing enforces the type-only limit.** pnpm blocks an import between
  packages that declare no dependency; past that, `import { BrowseFilesystem }`
  in `web` now typechecks and bundles. Only review catches it. This is the
  price of the cheap option and the reason to revisit.
- **Revisit when a second module in `web` imports from `core`.** One import is
  reviewable by eye; several are not. At that point add a lint boundary rule
  (Biome or an ESLint import plugin) that permits `import type` from `core` and
  rejects value imports, and this ADR becomes enforced rather than agreed.
- `.claude/rules/architecture.md` carries the instruction and stands alone: an
  agent following the rule never has to open this file. The reasoning, the
  rejected options, and the revisit trigger live only here.

## Rejected alternatives

- **A dedicated `packages/wire` holding types only.** The cleanest boundary:
  `core` and `web` both depend on it, and no value can leak because none exists.
  Rejected as overbuilt — a package, a tsconfig, and workspace wiring for three
  types with one consumer. Reconsider if a second package needs the same shapes,
  or if the lint boundary above proves awkward.
- **Keep the duplication and add a test asserting the two shapes match.** Turns
  a silent drift into a loud one but still needs both edits, and a structural
  test over TypeScript types is more machinery than the copy it guards.
- **Generate the web types from the server's Zod schemas.** Real single-sourcing
  and a fit if the API surface grows, but it buys a build step and a generator
  to maintain for one endpoint. Not now.
