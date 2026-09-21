# ADR-0004 — Adopt Tailwind v4 + shadcn/ui for a custom design system

- **Status:** Accepted — component layer and level-3-from-scratch scope
  **superseded in part by ADR-0008** (2026-06-19). Tailwind v4 `@theme` for
  tokens, capability-before-UI, and the single UI pass still stand. ADR-0008 was
  itself superseded by ADR-0033 (2026-09-21), which takes components from
  shadcn/ui first.
- **Date:** 2026-06-13

## Context

Through MVP1's tracer ships (roadmap 01.1–01.2), the `web` package was
deliberately left **unstyled**: `frontend.md` stated *"No design system,
component library, or theming — the tracer is functional, not polished"* and
*"Browser end-to-end stays deferred until the UI earns it."* That was the right
call while the bet was *prove the architecture end-to-end*; correctness over
polish.

Two things changed. The owner designed a full design system out-of-band (via a
design tool) and wants to **realize** it, and that design **changes the app's
structure** — navigation and multiple views, not just a skin over the current
three flat panels. So the question is no longer *whether* to style, but *when*
and *into what component layer*.

The honest trade-off was named during the decision: a full level-3 system
(design tokens **plus** a Storybook catalogue, theme-switching, and an
exhaustive component variant set) pays off at multi-app / team scale — which
`CONTEXT.md` marks explicitly as *future, not MVP1*. For a solo, effectively
one-screen cockpit, the scale infrastructure is YAGNI today. The owner
**overrode that argument deliberately**: dogfooding, a near-term demo, and
learning a modern 2026 component stack are real, stated drivers, and the
learning value is itself a goal. This ADR records that the override was
conscious, not naive — so a future reader does not "fix" it as accidental
over-engineering.

## Decision

**Adopt Tailwind v4 + shadcn/ui as the web package's styling and component
layer, and realize the owner's custom design system on top of it.**

- **Tokens via Tailwind v4 `@theme`** — the design system's tokens (colour,
  spacing, type) live as CSS variables, the single source of truth for styling.
- **shadcn/ui for components** — components are **copied into the repo and
  owned**, then restyled to our tokens. We do not depend on a ready-made,
  externally-themed component library; the point is to express *our* design, not
  fight someone else's.
- **Scope: full level-3 now**, as a deliberate learning/dogfood/demo
  investment — tokens, the component variants, a Storybook-style catalogue, and
  theming — accepted despite the solo / one-screen scale. Internally framed as
  *"learning a 2026 component stack"*, not *"MVP1 requires this"*.
- **Sequencing (binding):** the drift + update capability (roadmap 01.3 + 01.4)
  is built at the **core/server/integration level first**; then **one UI pass**
  (roadmap `01.5`, the closing design pass) realizes the new structure and
  surfaces the complete, working product —
  registry, deploy-state, inventory, drift badges, update actions — at once.
  Rationale: a demo or dogfood of a styled shell with a dead update button is
  worse than the raw version that works; the integration lane runs against the
  server API (not the browser, per `testing.md`), so MVP1's capability completes
  without any styled UI, and no throwaway UI is built into a layout about to be
  replaced.

This reverses the `frontend.md` "no design system / no component library /
no theming" rule; `frontend.md` is rewritten alongside this ADR.

## Consequences

- **Largest single chunk of web work in the project so far** — a full level-3
  system for a one-screen app is, by the owner's own acknowledgement, bigger than
  01.3 and 01.4 combined.
- **Unused-component maintenance without coverage** — variants and themes that no
  current screen exercises carry maintenance cost and no test pressure. Watch for
  rot; prune what never earns its place.
- **The UI pass is gated behind 01.3 + 01.4** — by the sequencing decision, no
  styled UI lands until the drift/update capability is real.
- **Browser end-to-end (Playwright) may now earn its place** — once the styled,
  structured UI exists, the `frontend.md` deferral of browser e2e can be
  revisited.
- The dev-port/`@theme` and shadcn picks are individually reversible; the
  **binding parts are the component-layer adoption and the capability-before-UI
  sequencing.**

## Rejected alternatives

- **Ready-made component library (MUI / Mantine / Chakra).** Ships opinionated
  styling that fights a custom design system; restyling it to our tokens is more
  friction than owning copied shadcn components from the start.
- **CSS-only / vanilla-extract / hand-rolled components.** More manual work to
  reach the same place; loses the accessible Radix primitives shadcn builds on.
- **Defer the design system to team/multi-app scale (the YAGNI-correct option).**
  Explicitly overridden: dogfooding, a near-term demo, and the learning goal are
  real present-day value for the owner, even though the scale infrastructure is
  not yet needed.
- **Build the UI pass before the drift/update capability.** Rejected: it would
  demo a façade with dead controls and risk throwaway UI in a soon-replaced
  layout.
