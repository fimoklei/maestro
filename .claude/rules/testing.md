# Testing principles (project-specific for Maestro)

Why and when to test. The how/where (exact paths, runners) gets fixed when the cockpit code lands — see the roadmap/how grill. Until then these principles stand on their own.

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

## Pure vs integration

- **Pure** = sibling file next to source. No fs/git/network. Goal: millisecond-fast, default in the `/tdd` loop.
- **Integration** = a dedicated `tests/integration/` tree. Tests a journey across multiple modules with real I/O. Goal: regression safety net, runs in CI.

Heuristic for "is this integration?": if it touches the real filesystem, git, or network → integration. For Maestro specifically, anything that drives APM or reads real lockfiles is integration.

## When to write which test

- New pure function or module with clear input/output → pure test, sibling.
- New multi-module behavior (a deploy flow, a deploy-state read) → integration test.
- Bug fix → reproduce first, in the layer where the bug lives. When in doubt: pure.

## Mocking

- Preference: in-memory data structures (real arrays/objects/Maps).
- Mocks only for external deps (fs/git/network, and APM) that would otherwise force the file into integration.
- Mocks often just test that you wrote the mock correctly — avoid where possible.

## Test naming

- File: `foo.test.<ext>` (pure) or `tests/integration/<scenario>.test.<ext>`.
- Description: behavior statement without "should". Example: `"rejects primitive with missing description"`, not `"should return false when description is missing"`.
