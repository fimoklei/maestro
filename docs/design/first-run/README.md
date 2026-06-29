# First-run design reference (snapshot)

Static snapshot of the "First run story flow" design (Control Room) that drives
roadmap `01.6` / PRD [#93](https://github.com/fimoklei/maestro/issues/93). Kept in
the repo so an implementing agent has a version-controlled layout reference
without needing the auth-gated design tool.

- **Snapshot date:** 2026-06-29.
- **Source of truth on conflict:** the live design (claude.ai/design project
  "Maestro", file `First run story flow.dc.html`). This snapshot can drift —
  if it disagrees with the live design, refresh it; the live design wins.
- **This is a reference, not runnable code.** `story-screens.jsx` composes a
  design-system runtime (`window.MaestroDesignSystem_382d1f`) that is **not** in
  this repo. Do not import it. The real components live in
  `packages/web/src/ui/` (Button, Chip, Card, NavItem, Logo, StatusDot, TypeTag,
  SectionHeader) — build against those. The JSX shows **layout, copy, and which
  component goes where**, nothing more.

## The design is input, not a spec

The PRD is the contract. These held lines override the picture (see PRD #93 +
ADR-0009):

- **`f1-connect` (git repo variant) is OUT** — git connect/sync is a Future job.
  Build the **`f1-connect-path`** (local-path) variant only.
- **No ⧉ Compose nav item** — the `Shell` component draws three nav items
  (Inventory / Deploy-state / Compose); ship only ⇶ Deploy-state, ▤ Inventory,
  ⚙ source. No dead nav.
- **No "synced 2m ago" timestamp** — faux state in an offline read-on-demand
  model. Show "connected · N primitives" + a re-read instead.
- **The `browse…` button IS in scope** — the one design element pulled forward
  (ADR-0009), bounded to the home-root.

## Frame → PRD-step map

| Design screen (in `story-screens.jsx`) | First-run step | Notes |
|---|---|---|
| `f1-empty` | Welcome / inert cockpit | Full shell, nav dimmed, targets "none yet", 3-step bar, single CTA. |
| `f1-connect-path` | Step 1 — connect (local path) | The variant to build. Path field + `browse…` + "N primitives found · read-only". |
| `f1-connect` | — (OUT) | Git-URL variant; deferred Future job. Reference only. |
| `f1-repos` | Step 2 — register repos | Reuses register endpoint; add a "skip" affordance (not drawn). |
| `f1-landing` | Land on Deploy-state | Configured + empty; existing cold-start nudge. |
| `inv-source` / `inv-source-path` | ⚙ Inventory source (connected) | "connected · N primitives" + re-read + change source. Use the `-path` one. |
| `src-change` / `src-change-path` | ⚙ change source (re-point) | Same shared form as step 1. Use the `-path` one. |
| `f2-*`, `branches` | — (other flows) | Daily-use / compose; not `01.6`. Reference only. |

## Files

- `story-screens.jsx` — the screen compositions (high-value: exact layout/copy).
- `first-run-story-flow.dc.html` — the storyboard that arranges the `f1-*`
  frames in order, with the designer's flow annotations.
