# 1096 — What the web lane pays per file

Measured 2026-09-24 on macOS 26.6.2 (8 cores), vitest 4.1.11, Node 24.18.0,
jsdom 30.0.1, happy-dom 20.14.5. 131 files, 1809 tests. Other sessions shared
the machine (load 5–16), so the configurations ran interleaved, three rounds.

## Finding

Environment setup and imports are about half the lane's CPU time, but they do
not set its wall time. With jsdom the reporter sums 73 s of environment, 22 s
of import and 14 s of setup against 80 s of tests; the lane takes 190 s of CPU.
Wall time stays near 30 s because one file, `harness/harness-flow.test.tsx`
(105 tests), runs 26 s on its own and the other 130 files fit beside it on the
remaining six workers.

The issue's 340 s of environment and 256 s of import were not reproduced: its
run is not on disk. Summed per-file figures grow with worker contention (the
same git-lane file averaged 1.4 s per test alone and 6.6 s in a full run,
`1093-git-lane-cost.md`), and runs before #1093 had the heaviest contention.
This lane alone, under load 5–16, never summed more than 85 s of environment.

So a per-file lever cuts CPU, which is what two worktrees running suites at once
compete for, and moves wall time only a little. Splitting `harness-flow.test.tsx`
is the wall-time lever; it was not tried here.

## Change

The web lane runs in happy-dom on the `threads` pool
(`packages/web/vitest.config.ts`). CPU drops 190 s → 102 s, wall 30 s → 25 s,
every test green. Both keep vitest's per-file isolation: each file gets a
fresh worker context and a fresh DOM.

happy-dom resolves a relative `fetch` against `http://localhost:3000` and
connects. jsdom's `fetch` refused a relative URL outright, so a query that
refetches after `vi.unstubAllGlobals()` and before Testing Library's cleanup
(`remove-skill-row.test.tsx`) was harmless there and made real connections
here. `vitest.setup.ts` now assigns a `fetch` that always rejects;
`unstubAllGlobals` restores that, not the network. `src/network-guard.test.ts`
guards it. jsdom is removed from `packages/web`; happy-dom 20.14.5 was published
2026-09-12 (`npm view happy-dom time.modified`).

## Numbers

Median of three interleaved rounds. CPU is user + sys of the vitest process;
it varied under 4% between rounds, wall time up to 7%. The last three columns
are vitest's summed per-file figures.

| Environment, pool | Wall | CPU | Environment | Import | Tests | Green | Kept |
|---|---|---|---|---|---|---|---|
| jsdom, forks (before) | 30.4 s | 190 s | 73 s | 22 s | 80 s | yes | — |
| jsdom, threads | 27.6 s | 174 s | 66 s | 17 s | 79 s | yes | no |
| jsdom, vmThreads | 26.3 s | 78 s | 5 s | 12 s | 68 s | yes | no |
| happy-dom, forks | 26.2 s | 116 s | 31 s | 19 s | 57 s | yes | no |
| happy-dom, threads | 25.3 s | 102 s | 26 s | 14 s | 55 s | yes | **yes** |
| happy-dom, vmThreads | 25.7 s | — | 2 s | 12 s | 66 s | 1 fails | no |
| jsdom, forks, `--no-isolate` | 73.7 s | — | 75 s | 6 s | 452 s | 415 fail | no |
| jsdom, forks, `deps.optimizer.client` | ≈ before | ≈ before | — | — | — | yes | no |

Rejected:

- **`vmThreads`** — the cheapest CPU, but a vm context shares Node's native
  modules within a worker and caches ES modules for the worker's life (vitest
  docs, `config/pool`). Under happy-dom that leaked a toast between tests:
  `ui/toast.test.tsx` "keeps each success on its own line" found the same
  toast twice.
- **`--no-isolate`** — breaks isolation by design; 415 tests fail.
- **`deps.optimizer.client`** — import time unchanged, interleaved on/off runs
  within noise. The CLI rejects `--deps.*`; it was set in the config.
- **`--environment=happy-dom` on the CLI** — does not override a project's
  `environment`; the lane stayed on jsdom. Set it in the project config.

## Commands

```sh
# one cell; the lane config read BENCH_ENV for `environment` while measuring
BENCH_ENV=<jsdom|happy-dom> /usr/bin/time -p \
  ./node_modules/.bin/vitest run --project web --pool=<forks|threads|vmThreads>
# the "Duration … (transform, setup, import, tests, environment)" line gives the sums
./node_modules/.bin/vitest run --project web --reporter=json --outputFile=<out>.json
node -e 'const r=require(process.argv[1]);for(const f of r.testResults)
  console.log((f.endTime-f.startTime)/1000,f.name)' <out>.json | sort -rn | head
```
