# Testing principles (project-specific for Maestro)

Runner: **Vitest**, all lanes (ADR-0002).

## Hard rules

- TDD via the `/tdd` skill. No Edit/Write to code without RED first.
- **Preserve behavioural claims.** When an existing test fails during a change,
  restore green without reducing the behaviour it proves. Refactor the test if
  the claim stays intact. Remove or weaken the claim only when the user approves
  a requirement change, the issue or spec records that change, or another test
  already proves it. Before calling the work done, name that requirement or
  replacement test in the handoff. Deleting tests or assertions, loosening
  matchers, and adding `.skip` or conditional exclusion are never fixes for
  production code.
- **Layout is proven in a browser, not jsdom.** jsdom measures nothing — verify a CSS/layout change with an `agent-browser` measurement.
- Never chain `lint && typecheck && test` — run `pnpm verify`. The full output of the last run is on disk in `.logs/`; read it instead of re-running with a different filter.

## The three lanes

- **Pure (unit)** (`pnpm test:core`) — sibling file next to source, no fs/git/network. Default in the `/tdd` loop; most tests live here.
- **Web component** (`pnpm test:web`) — sibling `.test.tsx` in `packages/web`, **jsdom** + Testing Library (own `packages/web/vitest.config.ts`); `fetch` stubbed. Browser end-to-end (Playwright) stays deferred.
- **Integration** (`pnpm test:integration`) — `tests/integration/`, a journey across modules with real I/O. Anything that drives APM or reads real lockfiles is integration.

Storybook stories are **not** a lane: documentation, not coverage. Behaviour is tested in the sibling `.test.tsx` (`frontend.md`).

## When to write which test

- New pure function or module → pure test, sibling.
- New multi-module behavior → integration test.
- A job whose value is the chain (register then read it back, update then read
  the pin) → one integration test carrying the whole chain. Tests per step prove
  each step and nothing about the seams between them.
- Bug fix → reproduce first, in the layer where the bug lives. When in doubt: pure.

## Mocking

- Prefer in-memory data structures (real arrays/objects/Maps).
- Mock only external deps (fs/git/network, APM) that would otherwise force the file into integration.

## Naming

- Files: `foo.test.<ext>` (pure), `tests/integration/<scenario>.test.<ext>`.
- Descriptions state behavior without "should": `"rejects primitive with missing description"`.
