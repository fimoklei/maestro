# Frontend conventions (project-specific for Maestro)

How the `web` package is built. Read before adding or changing a React component
or any client-side data access. The layer boundary (UI only, HTTP only, never
filesystem/`apm`) lives in `architecture.md` and is not repeated here. React 19,
TypeScript, Vite, **Tailwind v4 + shadcn/ui** (ADR-0004).

## Server-state vs UI-state — the core split

Two kinds of state, two homes. Confusing them is the main failure mode.

- **Server-state** — data that lives on the server and is only cached on screen:
  the inventory, deploy-state, the registry. Owned by **TanStack Query**, never
  by `useState`. The screen is a view of server truth, so after any mutation
  (deploy, register) the affected query is **invalidated** and refetched — that
  is how the deploy-state panel updates itself without a manual reload.
- **UI-state** — data only the screen cares about: the text in the path field,
  which skill is selected, whether a panel is open. Plain `useState`. Never put
  this in a query; never push it to the server.

Do not fetch server-state with `fetch` inside `useEffect`. That hand-rolls
loading, error, and refetch that Query already owns, and it is where stale
screens come from.

## Data-fetching

- One thin HTTP module wraps `fetch`, returns typed data, and throws on non-2xx
  so Query sees an error.
- Each server resource gets a custom hook: `useInventory()`,
  `useDeployState(repo)`, `useRegistry()`. Components call the hook, not `fetch`.
- Mutations invalidate the queries they affect: deploy → invalidate that repo's
  deploy-state; register → invalidate the registry.
- Query keys are explicit arrays (`["deploy-state", repoPath]`), never
  concatenated strings.

## Components & hooks

- Files kebab-case, components PascalCase, one component per file (see global
  `code-standards.md`).
- Small and focused — a list, a row, a form, not a 400-line page. Extract when a
  component outgrows its one job.
- Custom hooks hold data and logic; components stay mostly presentational.
- Co-locate a component's pure helpers and its sibling unit test.

## Styling & components (ADR-0004)

- **Tokens are the source of truth.** The design system's tokens (colour,
  spacing, type) live as CSS variables via Tailwind v4 `@theme`. Style from
  tokens, never hard-coded values.
- **shadcn/ui components are owned, not imported.** They are copied into the repo
  and restyled to our tokens. Do not add a ready-made, externally-themed
  component library (MUI/Mantine) — it fights our design.
- **Catalogue.** Components are documented in a Storybook-style catalogue
  (level-3 scope, per ADR-0004). New components land with a story.
- **Sequencing.** Styled UI lands in one pass *after* the drift/update capability
  exists (ADR-0004) — do not style ahead of working behaviour.

## Accessibility (baseline, not polish)

- Semantic HTML: real `<button>`, `<form>`, `<label htmlFor>`. Never a clickable
  `<div>`. shadcn builds on Radix primitives — keep their accessibility, don't
  strip it.
- Every input has an associated label; errors are readable text tied to the
  field.

## What this step does NOT add

- No global client-state library (Redux/Zustand): server-state is Query's,
  UI-state is local. Revisit only if genuinely shared UI-state appears.
- A client-side router arrives with the multi-view structure (ADR-0004); until
  that pass lands, the app stays single-page.
