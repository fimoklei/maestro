# Frontend conventions (project-specific for Maestro)

How the `web` package is built. Read before adding or changing a React component
or any client-side data access. The layer boundary (UI only, HTTP only, never
filesystem/`apm`) lives in `architecture.md` and is not repeated here. React 19,
TypeScript, Vite.

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

## Accessibility (baseline, not polish)

- Semantic HTML: real `<button>`, `<form>`, `<label htmlFor>`. Never a clickable
  `<div>`.
- Every input has an associated label; errors are readable text tied to the
  field.
- This baseline holds even though the tracer is unstyled. Design comes later;
  correctness does not.

## What this step does NOT add

- No design system, component library, or theming — the tracer is functional,
  not polished.
- No client-side router until there is more than one screen.
- No global client-state library (Redux/Zustand): server-state is Query's,
  UI-state is local. Revisit only if genuinely shared UI-state appears.
