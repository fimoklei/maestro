# 1093 — Where a git-lane test spends its time

Measured 2026-09-23 on macOS 26.6.2 (8 cores), git 2.50.1 (Apple Git-155) from
the Command Line Tools, vitest 4.1.x.

## Finding

Git process spawns dominate, and most of each spawn is not git. On macOS,
`/usr/bin/git` is an xcrun launcher: it looks up the developer directory and
then starts `/Library/Developer/CommandLineTools/usr/bin/git`. The launcher
costs ~29 ms of the ~46 ms a trivial git call takes.

```sh
time (for i in {1..50}; do /usr/bin/git rev-parse HEAD >/dev/null; done)   # 2.32 s → 46 ms/call
R=$(xcrun -f git)
time (for i in {1..50}; do $R rev-parse HEAD >/dev/null; done)            # 0.86 s → 17 ms/call
```

Fixture setup is the smaller share. In `server-harness-stages.test.ts` (30
tests), one test spawns ~68 git processes: ~11 build the starting repository
(`init --bare`, `clone`, `config`, `commit`, `tag`, `push`) and ~57 come from
the code under test (`HarnessGitAdapter`: `ls-tree`, `fetch --prune`,
`remote set-head`, `rev-parse`, `write-tree`, …). Git time totalled 62.6 s of
the file's 74 s under the shim below, fixture commands 13 s of it.

The issue's ~4 s per test is contention: alone on one worker the same file
averages 1.4 s per test; inside the 8-worker lane run it averages 6.6 s.

Every call site resolves `git` through `PATH`, so the launcher tax lands on
fixture and code under test alike.

## Change

The git lane's `PATH` starts with `git --exec-path`
(`vitest.config.ts`). That directory holds a `git` that is the real binary
(Command Line Tools: a symlink to `../../bin/git`), so the same git runs,
minus the launcher. Where `git` on `PATH` is already the real binary (Linux,
Homebrew), the prefix changes nothing. `tests/git/direct-git.test.ts` guards
the wiring.

Building the starting repository once per file and copying it per test was not
done: it would remove at most the ~11 fixture spawns of ~68 per test.

## Numbers

Summed per-test durations from vitest's JSON reporter. The issue's 658 s
baseline came from an earlier full-suite run; worker contention moves the
absolute figures between runs, so each row compares two runs taken back to
back.

| Run | Before | After |
|---|---|---|
| Full suite (`vitest run`), git lane share | 706 s of 909 s | 296 s of 442 s |
| Git lane alone (`--project git`) | 1110 s, wall 3:26 | 387 s, wall 1:09 |
| `server-harness-stages.test.ts`, 1 worker | 43.2 s | 18.9 s |

```sh
./node_modules/.bin/vitest run --reporter=json --outputFile=<out>.json
./node_modules/.bin/vitest run --project git --reporter=json --outputFile=<out>.json
./node_modules/.bin/vitest run tests/git/server-harness-stages.test.ts --maxWorkers=1 \
  --reporter=json --outputFile=<out>.json
node -e 'const r=require(process.argv[1]);let s=0;for(const f of r.testResults)
  for(const t of f.assertionResults)s+=t.duration;console.log(s/1000)' <out>.json
```

Per-spawn breakdown: a timing shim first on `PATH`, grouped by subcommand.

```sh
cat > shim/git <<'EOF'
#!/bin/zsh -f
zmodload zsh/datetime
s=$EPOCHREALTIME
/usr/bin/git "$@"; rc=$?
print -r -- "$s $EPOCHREALTIME $*" >> "$GIT_SHIM_LOG"
exit $rc
EOF
GIT_SHIM_LOG=stages.log PATH=$PWD/shim:$PATH ./node_modules/.bin/vitest run \
  tests/git/server-harness-stages.test.ts --maxWorkers=1
awk '{d=$2-$1; c[$3]+=d; n[$3]++} END{for(k in c) print c[k], n[k], k}' stages.log | sort -rn
```
