# Mutation audit of `packages/core`: one run, then the tooling goes

Measured 2026-09-04 on `fimoklei/maestro` at `7a8e4d4`, in a throwaway
worktree. `@stryker-mutator/core` 10.0.0, `@stryker-mutator/vitest-runner`
10.0.0, vitest 4.1.11, Node 24.18.0, TypeScript 7.0.2, M3 MacBook Air (8
cores). Ticket: #739, map #734.

This is a one-off audit, not a standing measurement. Nothing from it is
committed to `package.json`; the config below is recorded so the run can be
repeated when the trigger in `.claude/rules/testing.md` fires.

## The decision this answers

Coverage (#735) says which lines run. It cannot say whether the tests would
notice a wrong line. The research ticket (#736) rejected mutation testing as a
standing gate: a mutation score needs a reader, which is a new recurring moment.
A one-off audit hangs on no recurring moment, so it was run once, on the lane
where a score means most: `core`, pure logic, zero `vi.mock`.

## Runtime

| Run | Wall time |
|---|---|
| `npx stryker run` on `core` | **4m00s** (dry run 5s, mutation phase 3m58s, 7 runner processes) |
| `npx vitest run --project core`, right after | 2.6s |

Roughly 90× a plain run. Single sample on a loaded laptop (1-minute load
climbed to 161 during the run: Stryker's 7 workers over vitest's own pool on 8
cores). Zero timeouts, so `timeoutMS: 20000` was never the limiter. Stryker
reported that 224 static mutants (4%) took about 68% of the time.

The 4 minutes sit inside the 5-minute CI budget only if nothing else runs.
That is not the reason it stays out of CI; the reader rule is.

## Score

5144 mutants across 78 files.

| Killed | Survived | No coverage | Timeout |
|---|---|---|---|
| 3124 | 378 | 1642 | 0 |

- **89.2% on covered code.** Where the `core` lane reaches, the tests catch
  nine in ten deliberate breakages.
- **60.7% over all mutants.** The 1642 no-coverage mutants are the adapters
  the `core` lane never runs; #735 measured the same 15 files at 0% without the
  integration lane. This run excluded that lane by design, so the number says
  nothing new.

## Survivors worth a test

Of the 378 survivors, about 216 are meaningful; the rest mutate log strings,
labels and `.catch(() => null)` fallbacks. Per file, the concentrations:

| File (`packages/core/src/`) | Survivors |
|---|---|
| `harness/import-skill.ts` | 31 |
| `harness/read-harness-state.ts` | 31 |
| `filesystem/same-tree.ts` | 23 |
| `harness/promote-skill.ts` | 20 |
| `deploy/apm-cli-driver.ts` | 11 |
| `deploy/remove-consent.ts` | 11 |
| `harness/promote-deletion.ts` | 11 |

The ten that change a guard the product relies on:

1. `deploy/remove-consent.ts:164` — `a.length === b.length && timingSafeEqual(a, b)` → `true`. The consent-token comparison can be replaced by "always matches" and nothing fails.
2. `deploy/remove-consent.ts:98` — `receipt !== undefined && this.matches(...)` → `true`. A missing receipt is accepted.
3. `filesystem/browse-filesystem.ts:91` — `if (!isWithinRoot(real, realRoot))` → `false`. The realpath-escapes-root guard can be deleted (`security.md`).
4. `filesystem/browse-filesystem.ts:75` — `!isWithinRoot(normalized, realRoot) && …` → `||`. The containment check is untested on the boundary.
5. `deploy/apm-cli-driver.ts:287` — `APM_AUTH_PHRASES.some(...)` → `.every(...)`. Auth-required detection fires only when every phrase matches; no test has a single-phrase output.
6. `deploy/deploy-skill.ts:222` — `inventory.primitives.some(p => p.name === input.name)` → `.every(...)`. The "primitive exists" check is only tested with a one-primitive inventory.
7. `deploy/git-origin.ts:58` — `if (!isDefaultPort)` → `false`. A non-default port in the origin URL is never rejected.
8. `harness/import-skill.ts:225` — `source === null || !within` → `&&`. The "source outside harness home" branch is not distinguished.
9. `harness/import-skill.ts:383` — `name === null || !isValidSkillSlug(name)` → `&&`. An invalid slug with a non-null name passes.
10. `deploy/apm-cli-driver.ts:119,153,191,210` — `Date.now() - started` → `+`. `durationMs` is never asserted; low value, four identical survivors.

Items 1 to 4 are security guards (`security.md`), which the map's
"drift, deploy, apm parsing" category did not name. They are in scope for the
spec on the strength of that file, not this audit.

## How to repeat it

Three things break before Stryker runs on this repo, all worked around, none
fixed upstream at the time of writing:

1. **TypeScript 7.** Stryker's tsconfig preprocessor calls
   `ts.parseConfigFileTextToJson`, which the Go port no longer exports. Point
   `tsconfigFile` at a file that does not exist so the preprocessor skips.
2. **Dangling skill symlinks.** The sandbox copy fails with `ENOTSUP copyfile`
   on `.claude/skills/{agent-browser,agentation,worktree}`, whose targets are
   absent in a worktree. Exclude them with `ignorePatterns`; keep
   `tests/fixtures`, which core tests read.
3. **pnpm plugin resolution.** The default `@stryker-mutator/*` glob does not
   resolve through pnpm's symlinked `node_modules`. List the plugin explicitly.

`--project core` cannot select the lane (the vitest-runner has only
`configFile`, `dir`, `related`); a throwaway root config declaring the single
`core` project does, as with coverage (`LEARNINGS · coverage-project-flag-empties-the-report`).

```json
{
  "mutate": ["packages/core/src/**/*.ts", "!packages/core/src/**/*.test.ts"],
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.stryker.config.ts" },
  "reporters": ["progress", "clear-text", "json"],
  "timeoutMS": 20000,
  "tsconfigFile": "tsconfig.stryker-none.json",
  "ignorePatterns": [".claude", ".agents", ".github", ".impeccable", ".logs", ".maestro-sandbox", "docs", "scripts", "packages/web", "packages/server", "tests/integration", "**/*.md"],
  "plugins": ["@stryker-mutator/vitest-runner"]
}
```

Install with `pnpm add -D -w @stryker-mutator/core @stryker-mutator/vitest-runner`,
run `npx stryker run`, and revert `package.json` and the lockfile afterwards.
