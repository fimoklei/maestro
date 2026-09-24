# 1105 — Vitest 5 against the threads baseline

Measured 2026-09-24 on macOS 26.6.2 (Apple M3, 8 cores), Node 24.18.0:
vitest 4.1.11 against 5.0.1 (published 2026-09-15), with the web lane
already on happy-dom and `threads` (`1096-web-lane-setup-cost.md`). Other
sessions shared the machine (load 13–215), so the versions ran interleaved,
in alternating order, from two checkouts of the same commit.

## Finding

The suite is green with the same count under both versions: 283 files, 3724
passed, 9 skipped. Vitest 5 is faster in `core`, `integration` and `git`.

The web lane is slower. The release notes promised a gain there, for "large
isolated suites". Its median wall time rose from 25.7 s to 27.5 s (7%), and
Vitest 5 was slower in six of eight paired rounds (median pair difference
+1.4 s). CPU time is unchanged, and the phase split is the same under both
versions: tests about 42%, environment 25%, setup and import 13% each.

Whole-suite and coding-loop runs are no slower. Their medians favour 5 by
3–13 s, but the v4 runs caught the heaviest load, so that gap is not a finding.
In the one round at matching load, the whole suite took 67.6 s against 67.9 s.

The upgrade is taken on the runs anyone waits for, the whole suite and the
coding loop, not on each lane. The web lane's loss is recorded here, not
hidden.

## Change

- `vitest` and `@vitest/coverage-v8` are on `^5.0.1`.
- `testTimeout` is set once in the root `vitest.config.ts`. Since 5.0, inline
  projects inherit the root's options (`extends` defaults to on). A project
  given as a config file does not, so `packages/web/vitest.config.ts` keeps
  its own. `globalSetup` is not inherited, so it still runs once
  (vitest.dev `guide/projects`). All four lanes resolve to 20 s.
- The coverage map still lists 307 of 307 source files. `--coverage
  --project <lane>` still reports `Unknown% ( 0/0 )`, as it did on 4.1.11.

## Numbers

Median wall time, with the range. CPU is the median of user + sys of the
vitest process. Web ran eight rounds, every other row three.

| Run | Vitest 4 wall | Vitest 5 wall | Vitest 4 CPU | Vitest 5 CPU |
|---|---|---|---|---|
| `core` | 4.0 s (3.7–4.2) | 3.5 s (3.1–3.8) | 18 s | 16 s |
| `web` | 25.7 s (21.3–29.6) | 27.5 s (21.8–31.3) | 133 s | 135 s |
| `integration` | 4.8 s (4.7–5.4) | 4.5 s (4.3–4.6) | 23 s | 22 s |
| `git` | 42.6 s (40.1–44.5) | 38.1 s (37.8–40.0) | 188 s | 185 s |
| `core` + `web` + `integration` | 37.3 s (30.4–38.3) | 34.1 s (33.4–36.9) | 178 s | 175 s |
| whole suite | 85.5 s (67.6–85.9) | 72.7 s (67.9–83.4) | 355 s | 354 s |

## Commands

```sh
# per lane; one round runs 4 then 5, the next 5 then 4
/usr/bin/time -p ./node_modules/.bin/vitest run --project <core|web|integration|git>
# coding loop and whole suite, same interleaving
/usr/bin/time -p ./node_modules/.bin/vitest run --project core --project web --project integration
/usr/bin/time -p ./node_modules/.bin/vitest run
# coverage map size, per version
./node_modules/.bin/vitest run --coverage --coverage.reporter=json-summary
node -e 'const s=require("./coverage/coverage-summary.json");console.log(Object.keys(s).length-1)'
```
