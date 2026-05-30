# Testing principles (project-specific for Maestro)

Why and when to test. The runner is fixed (**Vitest**, see ADR-0002); exact paths get pinned down when the cockpit code lands. These principles stand on their own.

## Hard rules

- TDD via the `/tdd` skill. No Edit/Write to code without RED first.
- Test behavior, not implementation. Refactors must not turn tests red as long as behavior is unchanged.
- One concept per test. When it fails, the cause is unambiguous.
- Tests are independent. No ordering dependencies, no shared state.
- Deterministic. No clock, no network, no reliance on key-ordering.

## Anti-patterns

- Permutation explosions (cartesian product of inputs).
- Re-testing language/compiler guarantees (null-check on a typed param, type shape).
- Implementation details (private functions, internal state, exact log strings).
- Snapshot tests unless the output is deliberately stable and large.
- Coverage as a target. Coverage is a report, not a threshold.

## The three lanes

One runner for all of them: **Vitest**. One tool, one config, one mental model.

- **Pure (unit)** = sibling file next to source. No fs/git/network. Goal: millisecond-fast, default in the `/tdd` loop. The workhorse; most tests live here.
- **Integration** = a dedicated `tests/integration/` tree. Tests a journey across multiple modules with real I/O. Goal: regression safety net, runs in CI.
- **Acceptance (BDD)** = Gherkin `.feature` files, **one per MVP1 subjob** (`J01`–`J09`), written in Given/When/Then. Goal: prove the cockpit does its jobs, traceable to the job map, and readable by a non-engineer without reading code. Runs end-to-end against the server API (not the browser) under Vitest. Browser end-to-end (Playwright) is deferred until the UI earns it.

Heuristic for "is this integration?": if it touches the real filesystem, git, or network → integration. For Maestro specifically, anything that drives APM or reads real lockfiles is integration. An acceptance scenario uses real I/O too, but is organised by subjob and written to read like the job map.

Set up all three lanes at bootstrap with one example each, then fill them as features land — never a batch of tests before the first feature.

## When to write which test

- New pure function or module with clear input/output → pure test, sibling.
- New multi-module behavior (a deploy flow, a deploy-state read) → integration test.
- A subjob becomes deliverable end-to-end → acceptance `.feature` for that `Jxx`.
- Bug fix → reproduce first, in the layer where the bug lives. When in doubt: pure.

## Mocking

- Preference: in-memory data structures (real arrays/objects/Maps).
- Mocks only for external deps (fs/git/network, and APM) that would otherwise force the file into integration.
- Mocks often just test that you wrote the mock correctly — avoid where possible.

## Test naming

- File: `foo.test.<ext>` (pure), `tests/integration/<scenario>.test.<ext>`, or `tests/acceptance/<jNN>-<slug>.feature` (BDD).
- Description: behavior statement without "should". Example: `"rejects primitive with missing description"`, not `"should return false when description is missing"`.
- Gherkin scenario: phrase from the subjob's intent. Example: `Scenario: I see every primitive available centrally` for `J01`.
