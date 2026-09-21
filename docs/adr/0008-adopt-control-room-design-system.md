# ADR-0008 — Adopt the "Control Room" design system (amends ADR-0004)

- **Status:** Superseded by ADR-0033 (2026-09-21). Was: Accepted — amends ADR-0004 (Tailwind v4 `@theme` stays; the
  shadcn-catalogue-from-scratch scope is dropped)
- **Date:** 2026-06-19
- **Amended 2026-08-03** by ADR-0022 — the motion rule gains one exception, the
  connect gate's welcome screen. Everything else stands.

## Context

ADR-0004 committed the web package to Tailwind v4 + shadcn/ui and to building a
**full level-3 system from scratch** — token set, an exhaustive shadcn component
catalogue, and theming — explicitly as a learning/dogfood investment.

Since then the owner built a complete design system out-of-band ("Control Room":
a dark, dense, monospace developer cockpit) in a design tool. It already ships
the tokens, a working component set (Button, Chip, TypeTag, StatusDot, Card,
NavItem, Logo), a specimen catalogue, and dark/light theming from one token set.
The owner has decided this **is** the project's design system.

The Control Room components are simple and presentational; none need the
interactive Radix primitives shadcn exists to provide (no menus, dialogs, or
comboboxes in MVP1). The catalogue and theming ADR-0004 planned to build now
already exist in the imported system.

## Decision

Adopt Control Room as the web package's design system.

- **Tokens** are imported as the single source of truth via Tailwind v4
  `@theme` — Tailwind stays.
- **Components are owned** — port the Control Room components into the web
  package and refine them as token-styled owned components.
- **shadcn/ui is used only where a genuinely interactive primitive earns it**
  (rare in MVP1), not as a catalogue built from scratch.
- The specimen **catalogue and theming are imported**, not rebuilt.

Components stay **type-aware** (skill / hook / mcp / bundle via `TypeTag`) even
though MVP1 renders skills only, so future primitive types slot in additively
(roadmap 01.5 scope note).

## Consequences

- ADR-0004's **binding** parts hold unchanged: capability-before-UI, the single
  UI pass (roadmap 01.5), and Tailwind `@theme` for tokens.
- What changes: "build a full shadcn catalogue from scratch" is dropped; the
  learning goal shifts from "shadcn from scratch" to "Tailwind v4 + owning an
  imported design system."
- ADR-0004 is **superseded in part** — the component layer and the
  level-3-from-scratch scope; everything else in it stands.

## Rejected alternatives

- **Keep ADR-0004 as-is** (rebuild every Control Room component as a shadcn/Radix
  component from scratch). Rebuilds finished, simple components for a learning
  goal a complete system already satisfies; the biggest chunk of web work for the
  least marginal value.
- **Drop Tailwind entirely** (ship Control Room's plain CSS). Fastest, but throws
  away the Tailwind `@theme` token workflow ADR-0004 keeps and the owner wants to
  learn.
