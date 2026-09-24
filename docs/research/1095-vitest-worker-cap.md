# 1095 — Does a vitest worker cap speed up the suite?

Measured 2026-09-23 on macOS 26.6.2 (8 cores: 4 performance, 4 efficiency),
vitest 4.1.11, Node 24.18.0, after #1093's git-lane fix.

## Finding

No. Every cap below the default made a lone suite slower, and no cap made two
concurrent suites meaningfully faster. `vitest.config.ts` keeps the default.

The premise was that the four lanes each start a worker pool and together
oversubscribe the CPU. They do not: vitest 4.1 runs all projects in one pool
of `availableParallelism() - 1` workers (7 here), unless a project sets its
own `maxWorkers` (`resolveMaxWorkers` in `vitest/dist/chunks/cli-api.*.js`).
A root `maxWorkers` would apply to every lane.

`pnpm smoke` is no load: its Vite and Hono servers sit idle. The slow runs the
issue cites came from sibling worktrees running suites at the same time.

## Numbers

Full suite wall time, 3718 tests, all green in every run. One run per cell;
the machine also served other sessions, so treat differences under ~10% as
noise. A `—` cell was not run: the trend was already clear.

| Condition | default (7) | 6 | 4 | 3 | 2 |
|---|---|---|---|---|---|
| Idle | 117 s | 142 s | 201 s | 190 s | 387 s |
| `pnpm smoke` running | 73 s | 103 s | 110 s | 119 s | — |
| Two suites at once, each | 182 s | — | 175 s | 217 s | — |

The slowest single test stayed at or under 4.9 s in every run, including two
concurrent suites at the default. That is close enough to vitest's 5 s default
that the lanes' raised `testTimeout` stays.

## Commands

```sh
# one cell: <label> is the condition, <w> the cap or "default"
./node_modules/.bin/vitest run --maxWorkers=<w> \
  --reporter=json --outputFile=<label>-<w>.json   # wall time: shell clock around it
# under smoke: `pnpm smoke` in another shell first
# two at once: start the same command twice in parallel, then `wait`
node -e 'const r=require(process.argv[1]);let m=0;for(const f of r.testResults)
  for(const t of f.assertionResults)m=Math.max(m,t.duration);console.log(m/1000)' <out>.json
```
