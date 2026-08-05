# Frontend conventions (project-specific for Maestro)

React 19, TypeScript, Vite, **Tailwind v4 + shadcn/ui** (ADR-0004). The layer boundary lives in `architecture.md`.

## Server-state vs UI-state — the core split

- **Server-state** (inventory, deploy-state, registry) is owned by **TanStack Query**, never `useState`. After any mutation, invalidate the affected query — that is how panels update without a manual reload.
- **UI-state** (field text, selection, panel open) is plain `useState`. Never in a query, never pushed to the server.
- Never fetch server-state with `fetch` inside `useEffect`.

## Data-fetching

- One thin HTTP module wraps `fetch`, returns typed data, throws on non-2xx.
- One custom hook per server resource: `useInventory()`, `useDeployState(repo)`, `useRegistry()`. Components call the hook, not `fetch`.
- Mutations invalidate the queries they affect.
- Query keys are explicit arrays (`["deploy-state", repoPath]`), never concatenated strings.

## Components & hooks

- Files kebab-case, components PascalCase, one component per file (global `code-standards.md`).
- Small and focused; extract when a component outgrows its one job.
- Custom hooks hold data and logic; components stay mostly presentational.
- Co-locate a component's pure helpers and its sibling unit test.

## Styling & components (ADR-0004)

- **Tokens are the source of truth** (CSS variables via Tailwind v4 `@theme`). Never hard-coded values.
- **shadcn/ui components are owned:** copied into the repo and restyled to our tokens. No externally-themed component library (MUI/Mantine).
- New components land with a Storybook story (ADR-0004, amended by ADR-0008).
- Styled UI lands in one pass *after* working behaviour (ADR-0004) — do not style ahead.

## Stories (Storybook)

A story is documentation, not a test (behaviour → `.test.tsx`, see `testing.md`). CI verifies the catalogue via `build-storybook`.

- **Presentational only.** No data-fetching, no Query, no live hooks; server data comes through `args`. No `QueryClientProvider`.
- **Tokens apply in stories too.** No hard-coded colours. Inline `style` only for layout scaffolding.
- No play/interaction tests; don't duplicate the sibling test.
- One story per meaningful state, not per prop permutation.
- CSF3 (`satisfies Meta<typeof X>`, `StoryObj`); no legacy `storiesOf`.
- Title is `Group/Component`; reuse existing groups.

## Not in this step

- No global client-state library (Redux/Zustand). A client-side router arrives with the multi-view structure (ADR-0004).
