# The most efficient test setup for a solo developer, 2026

Measured 2026-09-24 on `main` at `e2371dc9`, macOS 26.6.2 (8 cores), vitest
4.1.11, Node 24.21.0. No issue number: the question came from the operator.
Builds on `736-2026-testing-practice.md`, `735-coverage-map.md`,
`739-mutation-audit.md`, `1093-git-lane-cost.md`, `1095-vitest-worker-cap.md`
and `1096-web-lane-setup-cost.md`. What they settle is cited, not repeated.

## Question

For one non-engineer operator whose code is written by agents under a blocking
TDD rule: which test setup catches the most bugs per minute of wall time and
per unit of upkeep, with fast feedback for the agent?

## Verdict

Ranked by payoff for this repo.

1. **CI has not run since 2026-09-21. Decide on purpose whether that is OK.**
   Every CI job since then stops in 2 s with "The job was not started because
   recent account payments have failed or your spending limit needs to be
   increased" (measured, check-run annotation on run 36040302332). The real
   gate still holds: `workflow-ship` runs `pnpm verify` before merge and merges
   without waiting for CI. What is lost is the clean Linux install. The cheapest
   fix is a small Actions budget until the repo goes public. After that,
   standard runners are free and twice as large.
2. **`test:affected` and the commit gate miss fixture-only changes.** A change
   to a fixture that tests read through `fs` selects zero tests and exits 0
   (measured). One `forceRerunTriggers` entry closes the gap.
3. **Keep the happy-dom lane and the agent-browser check. Do not add Browser
   Mode yet.** Both Vitest Browser Mode and Playwright component testing are
   now stable. Their cost here is unmeasured, and screenshot comparison needs
   one fixed machine, which the dark CI cannot provide.
4. **Upgrade to Vitest 5 for the free speed and the stricter assertions, but
   plan for Stryker to break.** On Vitest 5, Stryker's vitest-runner reports
   every covered mutant as survived (open bug). The mutation audit only runs
   when a bug reaches `main`, so that cost is acceptable.
5. **Keep the test pyramid as it is.** Anthropic's current guidance asks for a
   check the agent can run, a gate it cannot skip, and a review in a fresh
   context. This repo already has all three. A standing mutation score stays
   rejected.

## Findings

### 1. CI economics

- GitHub Free includes 2,000 Actions minutes a month for private repositories.
  "If your account does not have a valid payment method on file, usage is
  blocked once you use up your quota"
  ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
  "The use of standard GitHub-hosted runners is free" in public repositories
  (same page).
- Linux costs $0.006 a minute, and "GitHub rounds the minutes and partial
  minutes each job uses up to the nearest whole minute"
  ([runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)).
- `ubuntu-latest` has 2 CPUs and 8 GB for private repositories, and 4 CPUs and
  16 GB for public ones
  ([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
  Going public doubles the CI test machine at no cost.
- **Measured (`gh run list`, 2026-09-01 to 2026-09-24):** 249 green CI runs,
  about 1,180 run-minutes, plus 96 failed runs (349 min) and 39 Windows
  bootstrap runs. Of those, 116 green runs took 3.6 to 5.9 min. The test step
  accounts for 167 s of a 3.6-min run. Install, lint, typecheck and both builds
  together take about 40 s (step timings, last green run). The last green run
  was 2026-09-21T20:37Z.
- **Not reconciled:** the sum above is under 2,000 minutes. The billing API
  needs the `user` scope, which the CLI token lacks, so the exact overrun is
  unverified. The Windows minute multiplier the workflow comment cites (2×) is
  not on the current pricing page, which lists prices per minute instead.
- The run's annotation also reports that `ubuntu-latest` moves to Ubuntu 26
  from 2026-10-19.

### 2. Affected-test selection

- `vitest related` runs "only tests that cover a list of source files". It
  follows static imports, not `import(filepath)`
  ([CLI](https://vitest.dev/guide/cli)). `pnpm test:affected` builds on it
  (`scripts/run-tests.mjs:19-27`).
- **Measured.** `vitest related` on `tests/fixtures/apm.lock.global-two-tool.yaml`
  returns "No test files found, exiting with code 0". Yet
  `deploy-state-reader.test.ts:21` and three integration tests read that file
  through a `URL` or path. `related` on `deploy-state-reader.ts` selects 35
  files and 376 tests in 5.2 s.
- `forceRerunTriggers` is a "Glob pattern of file paths that will trigger the
  whole suite rerun". Its default is `**/package.json`, `**/vitest.config.*`
  and `**/vite.config.*`
  ([config](https://vitest.dev/config/forcereruntriggers)). **Measured:**
  `related package.json` ran the whole `core` lane (75 files), so the trigger
  also works through `related`. `related vitest.config.ts` selected nothing,
  even though it matches the default glob. That is unexplained.

### 3. Browser Mode, Playwright components, happy-dom

- Vitest's position: jsdom and happy-dom "only simulate a browser environment",
  which "may result in some discrepancies". Browser Mode "requires spinning up
  the provider and the browser… longer initialization times"
  ([why Browser Mode](https://vitest.dev/guide/browser/why)). CI needs
  `playwright` or `webdriverio`. Node and browser projects can live in one
  config ([browser guide](https://vitest.dev/guide/browser/)).
- Vitest 5 reports Browser Mode (Chromium) 16–18% faster and adds a trace view
  ([Vitest 5 blog](https://vitest.dev/blog/vitest-5)).
  `@vitest/browser-playwright` 5.0.1 has vitest 5.0.1 as a peer dependency
  (npm), so it needs the upgrade first.
- Playwright 1.62 made component testing stable on a "stories and galleries"
  model with `fixtures.mount()`. The experimental `ct-*` packages are no
  longer updated. Props must be "plain serializable data — callbacks belong
  inside the story"
  ([release notes](https://playwright.dev/docs/release-notes),
  [components](https://playwright.dev/docs/test-components)). This repo
  already writes presentational Storybook stories with data through `args`
  (`frontend.md`), which is the shape that model wants.
- Visual comparison "references generated on one machine will often fail on
  another". The docs say "Start with the CI workflow"
  ([visual regression](https://vitest.dev/guide/browser/visual-regression-testing)).
  Without CI this option falls away.
- The web lane is 25 s wall time on happy-dom after #1096. jsdom and the nwsapi
  pin are gone from `packages/web`. nwsapi #171, #172 and #177 are all closed
  (checked 2026-09-24), so 736 §2's worry is settled.
- **Not measured:** the wall time of this repo's 1,809 web tests in Browser
  Mode. The docs name the cost and give no number.

### 4. Vitest 5

- Released 2026-09-03; 5.0.1 on 2026-09-15 (npm). It needs Vite ≥ 6.4 (this
  repo has 8) and Node 22.12+ or 24 (this repo has 24.21) (npm `peerDependencies`
  / `engines`).
- Changes that pay here: inline projects "inherit the root config by default"
  and share one Vite server when they do not change it. File-system module
  caching persists transformed modules across runs. Unawaited async assertions
  now fail the test ([Vitest 5 blog](https://vitest.dev/blog/vitest-5)). The
  last change catches a common agent mistake for free. The first removes the
  three repeated `testTimeout` lines in `vitest.config.ts`.
- `fsModuleCache` "stores the results on disk so repeated runs skip them"
  ([experimental config](https://vitest.dev/config/experimental)). The last full
  run summed 72.8 s of import and 16.4 s of transform (`.logs/test.log`). That
  is the pool the cache aims at. **Not measured.**
- Hazard: `-t`/`testNamePattern` now joins the chain with `>`.
  [stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)
  (open) shows that on Vitest 5 the runner "runs zero tests against every
  mutant that has per-test coverage": one project's score fell from 47.36 to
  2.96. [#6004](https://github.com/stryker-mutator/stryker-js/issues/6004)
  (incremental, multi-project) and
  [#6111](https://github.com/stryker-mutator/stryker-js/issues/6111)
  (TypeScript 7 tsconfig preprocessing) are also still open.

### 5. Pool, isolation, sharding

- Already settled here: one shared pool of `availableParallelism() - 1`
  (1095). `threads` on web (1096). `--no-isolate` breaks 415 web tests (1096).
  Vitest's own advice is the same: isolation off only "for projects without
  side effects", and `threads` "may improve performance in larger suites"
  ([improving performance](https://vitest.dev/guide/improving-performance)).
- Sharding splits "test *files*, not individual test cases" (same page). With
  per-job minute rounding and about 40 s of setup per job, sharding costs
  minutes on a private repo. After going public it is free: a second job for
  the git lane would take it off the critical path. Worth doing only if
  someone ever waits on CI, and `workflow-ship` does not.

### 6. Agent-written code

- Anthropic's current guidance: "Give Claude a check it can run". A Stop hook
  is the "deterministic gate", and "Claude Code overrides the hook and ends the
  turn after 8 consecutive blocks". A verification subagent means "the agent
  doing the work isn't the one grading it". "You can do something similar with
  tests: have one Claude write tests, then another write code to pass them"
  ([best practices](https://code.claude.com/docs/en/best-practices)).
- The old engineering post's TDD passage (write tests, confirm they fail, do
  not modify them) now redirects to that page, and the page no longer contains
  it. Cite the current wording only.
- Beck's observation that agents delete assertions (736 §5) is now the
  "Preserve behavioural claims" rule in `testing.md`. The one mutation audit
  measured 89.2% killed on covered `core` code (739). That is evidence that the
  agent-written tests do assert, not a reason for a standing score.

## What this repo already does right

- Lanes split by cost, not only by kind. The git lane stays out of the loop
  (ADR-0002, #780). `test:affected` is the loop, and `pnpm verify` reuses a
  green run.
- Output goes to disk (`.logs/`), so an agent never reruns with a narrower
  filter. The last log shows only the summary block, which is what Vitest 4.1's
  agent reporter produces (736 §1).
- Zero `vi.mock` (736 §5). Fakes behind ports, real I/O in integration.
- Coverage is an on-demand map with no threshold (735). Mutation testing is a
  one-off with a written trigger (739).
- Visual proof comes from a real browser (`design.md`), not happy-dom.

## Recommended changes

| # | Change | Effort | Payoff |
|---|---|---|---|
| 1 | Set a small Actions budget (for example $10/month) until the repo goes public, or accept dark CI and say so in `docs/operating-model.md`. At $0.006/min, September's 1,180 green minutes would cost about $7. | 5 min, operator only (billing settings) | Restores the clean-install Linux check. It is the only check that is not the author's own machine. |
| 2 | Add `tests/fixtures/**` to `forceRerunTriggers` in `vitest.config.ts`, keeping the defaults. Check with `vitest related --run tests/fixtures/<file>`. | 15 min, TDD via a test in `scripts/` or config | Fixture edits (captured `apm` and `gh` output, the product's grounding) get tested at commit time instead of passing with 0 tests. |
| 3 | Upgrade to Vitest 5.0.x. Drop the repeated `testTimeout`. Turn on `fsModuleCache` and measure loop wall time before and after. Leave Stryker unused until #6210 closes. | 1–2 h | 8–25% speed claimed by the vendor, not measured here. Catches unawaited assertions for free. |
| 4 | After going public: split the git lane into its own CI job. | 30 min | CI wall time roughly halves (167 s test step on 2 CPUs; 4 CPUs after). Free minutes. Low priority, because nobody waits on CI. |
| 5 | Revisit Browser Mode only when a layout bug reaches `main` that agent-browser missed. Then measure one `layout` project on `@vitest/browser-playwright` against the happy-dom lane. | Measuring: half a day | Unknown until measured. It would turn the manual layout proof in `design.md` into a repeatable test. |

Rejected: standing mutation score (739, and #6210), sharding on a private repo,
`isolate: false`, a coverage threshold (735).

## Open questions

- Why does the September run sum (about 1,600 Linux-equivalent minutes) fall
  short of the 2,000-minute quota? The billing API needs `gh auth refresh -s user`.
- Why does `vitest related vitest.config.ts` select nothing when the default
  `forceRerunTriggers` includes `**/vitest.config.*`?
- What does the web lane cost in Browser Mode, and do its happy-dom-only tests
  (for example the `fetch` guard in `network-guard.test.ts`) carry over?
- Does the commit-gate hook (deployed from `agent-harness`) use this repo's
  `vitest.config.ts` with `related`? If so, change 2 fixes it too. It was not
  read here.
