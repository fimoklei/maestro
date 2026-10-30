---
paths:
  - "packages/web/**"
---

# Frontend conventions (project-specific for Maestro)

React 19, TypeScript, Vite, **Tailwind v4 + shadcn/ui**. The layer boundary lives in `architecture.md`.

## Server-state vs UI-state — the core split

- **Server-state** (inventory, deploy-state, registry) is owned by **TanStack Query**, never `useState`. After any mutation, invalidate the affected query — that is how panels update without a manual reload.
- **UI-state** (field text, selection, panel open) is plain `useState`. Never in a query, never pushed to the server.
- Never fetch server-state with `fetch` inside `useEffect`.
- Never override the query client's `retry: false`.
- Re-read unasked only on open, plus Deploy-state's rows on tab return.
- Show no status before the server confirms it. Lock only what the server
  locks.
- Announce a write's success through the shared write action
  (`ui/use-write-action.ts`); never call the toast directly.

## Data-fetching

- One thin HTTP module wraps `fetch`, returns typed data, throws on non-2xx.
- Define each server resource once with `queryOptions` in a per-feature
  factory: key and `queryFn` together. Pass that object to `useQuery`,
  `prefetchQuery` and `invalidateQueries`. Components never call `fetch`.
- Write a custom hook only when it adds logic beyond the options.
- Build query keys as arrays in a hierarchy from the factory
  (`["deploy-state", repoPath]`), never concatenated strings. Mutations
  invalidate the queries they affect, a group by its broader key.

## Components & hooks

- Components PascalCase, one component per file.
- Small and focused; extract when a component outgrows its one job.
- A shape a second feature needs moves to `ui/` with its story, before the
  second feature uses it.
- Custom hooks hold data and logic; components stay mostly presentational.
- Before writing a `useEffect`, rule out: deriving the value during render,
  resetting state with a `key`, doing the work in the event handler, and
  `useSyncExternalStore` for a subscription. An Effect only syncs with a
  system outside React.
- Add `useMemo`, `useCallback` or `memo` only for a measured cost, or for a
  reference that a dependency array or a memoized child needs.
- Co-locate a component's pure helpers and its sibling unit test.

## Styling & components

- **Tokens are the source of truth** (CSS variables via Tailwind v4 `@theme`). Never hard-coded values.
- **shadcn/ui components are owned:** copied into the repo and restyled to our tokens. No externally-themed component library (MUI/Mantine).
- New components land with a Storybook story.
- Styled UI lands in one pass *after* working behaviour — do not style ahead.

## Stories (Storybook)

A story is documentation, not a test (behaviour → `.test.tsx`, see `testing.md`). CI verifies the catalogue via `build-storybook`.

- **Presentational only.** No data-fetching, no Query, no live hooks; server data comes through `args`. No `QueryClientProvider`.
- **Tokens apply in stories too.** No hard-coded colours. Inline `style` only for layout scaffolding.
- No play/interaction tests; don't duplicate the sibling test.
- One story per meaningful state, not per prop permutation.
- CSF3 (`satisfies Meta<typeof X>`, `StoryObj`); no legacy `storiesOf`.
- Title is `Group/Component`; reuse existing groups.

## Copy implementation

- Keep user-facing text in `packages/web`, centralised per feature. Author a
  notice's heading, sentence, `detail` and action label together, keyed by error
  code. The server sends codes and HTTP statuses; its request-shape
  messages remain the exception.
- Keep every busy label and done sentence in the shared `busy-copy.ts`, with
  its sibling test. It is the one exception to copy per feature.
- Share a string when its meaning and behaviour match. Write dynamic sentences
  whole and check zero, one, many and long names.

## Out of scope

- No global client-state library (Redux/Zustand). Routing is `react-router`; add no second router.
