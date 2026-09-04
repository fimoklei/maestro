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
- Repeat the mutation audit only after a bug reaches `main` that the suite should have caught; `docs/research/739-mutation-audit.md` records how to run it.
- A composition root (`main.tsx`, `server.ts`) is covered as far as it is reachable without a subprocess; the remainder is deliberately uncovered and `pnpm smoke` is its proof (ADR-0010), so `packages/server`'s function coverage is a decision, not an oversight.

## The four lanes

- **Pure (unit)** (`pnpm test:core`) — sibling file next to source, no fs/git/network. Default in the `/tdd` loop; most tests live here.
- **Web component** (`pnpm test:web`) — sibling `.test.tsx` in `packages/web`, **jsdom** + Testing Library (own `packages/web/vitest.config.ts`); `fetch` stubbed. Browser end-to-end (Playwright) stays deferred.
- **Integration** (`pnpm test:integration`) — `tests/integration/`, a journey across modules with real I/O. Anything that drives APM or reads real lockfiles is integration.
- **Git** (`pnpm test:git`) — `tests/git/`. Choose it on one checkable fact: does this test create a real repository? If yes, it lands here and stays out of the coding loop.

`pnpm test:loop` is the coding loop — the three cheap lanes; `pnpm test` runs all four.

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

## File size

- No line limit on a test file: the 800-line ceiling lives in the operator's global `code-standards.md`, which exempts test files, so the rule here is grouping, not counting. Nothing enforces it mechanically — Biome has no `max-lines`.
- Split when the tests fall into groups that do not share setup: one file per group, named for the group (`browse-dialog-keyboard.test.tsx`), never one file per `describe`.
- Repeated setup is the signal, not length. Before a third test builds the same fixture inline, extract one shared helper.

## Naming

- Files: `foo.test.<ext>` (pure), `tests/integration/<scenario>.test.<ext>`, `tests/git/<scenario>.test.ts`.
- Descriptions state behavior without "should": `"rejects primitive with missing description"`.
