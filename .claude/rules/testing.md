# Testing principles (project-specific for Maestro)

Runner: **Vitest**, all lanes (ADR-0002).

## Hard rules

- TDD via the `/tdd` skill. No Edit/Write to code without RED first.
- Test behavior, not implementation. Refactors must not turn tests red while behavior is unchanged.
- One concept per test. Tests are independent: no ordering dependencies, no shared state.
- Deterministic: no clock, no network, no reliance on key-ordering.
- **Layout is proven in a browser, not jsdom.** jsdom measures nothing — verify a CSS/layout change with an `agent-browser` measurement.
- Never chain `lint && typecheck && test` — run `pnpm verify`. The full output of the last run is on disk in `.logs/`; read it instead of re-running with a different filter.

## Anti-patterns

- Permutation explosions (cartesian product of inputs).
- Re-testing language/compiler guarantees.
- Implementation details (private functions, internal state, exact log strings).
- Snapshot tests unless the output is deliberately stable and large.
- Coverage as a target — it is a report, not a threshold.

## The four lanes

- **Pure (unit)** (`pnpm test:core`) — sibling file next to source, no fs/git/network. Default in the `/tdd` loop; most tests live here.
- **Web component** (`pnpm test:web`) — sibling `.test.tsx` in `packages/web`, **jsdom** + Testing Library (own `packages/web/vitest.config.ts`); `fetch` stubbed. Browser end-to-end (Playwright) stays deferred.
- **Integration** (`pnpm test:integration`) — `tests/integration/`, a journey across modules with real I/O. Anything that drives APM or reads real lockfiles is integration.
- **Acceptance (BDD)** (`pnpm test:acceptance`) — Gherkin `.feature`, one per shipped job (DONE lane in `docs/jobs.md`), Given/When/Then, runs against the server API under Vitest. Existing files keep their `jNN-` prefixes; new ones are named after the job's behavior.

Storybook stories are **not** a lane: documentation, not coverage. Behaviour is tested in the sibling `.test.tsx` (`frontend.md`).

## When to write which test

- New pure function or module → pure test, sibling.
- New multi-module behavior → integration test.
- A job ships end-to-end → an acceptance `.feature` for that job.
- Bug fix → reproduce first, in the layer where the bug lives. When in doubt: pure.

## Mocking

- Prefer in-memory data structures (real arrays/objects/Maps).
- Mock only external deps (fs/git/network, APM) that would otherwise force the file into integration.

## Naming

- Files: `foo.test.<ext>` (pure), `tests/integration/<scenario>.test.<ext>`, `tests/acceptance/<job-slug>.feature`.
- Descriptions state behavior without "should": `"rejects primitive with missing description"`.
- Gherkin scenarios phrase the job's intent: `Scenario: I see every primitive available centrally`.
