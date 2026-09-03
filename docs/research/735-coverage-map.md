# Coverage map: which code never runs

Measured 2026-09-03 on `fimoklei/walrus` at `dea0284`, with vitest 4.1.11 and
`@vitest/coverage-v8` 4.1.11 (v8 provider, AST-remapped). Ticket: #735.

This is a map, not a target. No threshold was configured and none is proposed.

## How to re-run it

```sh
pnpm test:coverage        # full suite + coverage; report in coverage/
```

The config block lives in `vitest.config.ts`. `coverage.include` is the part
that matters: without it a run reports only the files a test imported, which
answers "how well is the tested code tested" rather than "what never runs".

**A single lane cannot be measured with `--project`.** That flag narrows the
coverage root to the lane's own root (`tests/integration`, `packages/core`), so
the repo-root globs in `coverage.include` match nothing and the report comes
back empty — no warning, no error. Per-lane numbers below were taken with a
throwaway root config declaring one project.

## Headline

| | |
|---|---|
| Source files in the report | 215 of 215 on disk |
| Lines | 96.32% (3827/3973) |
| Statements | 96.14% (3941/4099) |
| Branches | 93.77% (2923/3117) |
| Functions | 96.30% (1043/1083) |

Excluded from the map: `*.test.*`, `*.stories.tsx`, `packages/web/src/main.tsx`.

## Files at 0%

One, in the whole repo: **`packages/server/src/server.ts`** (lines 7–11) — the
`serve()` bootstrap that binds 127.0.0.1. Nothing else is dark.

## Per package

| Package | Files | Lines | Branches | Functions |
|---|---|---|---|---|
| `core` | 77 | 96.0% (1925/2006) | 92.4% (1152/1247) | 97.3% |
| `server` | 5 | 88.6% (265/299) | 88.7% (110/124) | 67.3% |
| `web` | 133 | 98.1% (1637/1668) | 95.1% (1661/1746) | 98.3% |

## Is `packages/server` genuinely covered, or only apparently?

Genuinely. `server` has zero sibling tests, and the integration lane run alone
produces **exactly** the full run's server numbers (88.6% lines, 67.3%
functions) — so every line of server coverage comes from that lane, and no
other lane contributes any. The web lane stubs `fetch` and cannot reach it.

What the 34 uncovered server lines are, precisely:

- `app.ts` lines 948–1161 are `realDeps()`, the production composition root.
  Its body runs on import, but its **lazy callbacks** do not: the
  `resolveCentralInventoryPath`, `resolvePath`, `prepareGlobalCwd`,
  `harnessRoot`, `homeRoot` and `replan` closures are only invoked by the
  production wiring. Tests construct `createApp` with fake deps, so those 17
  functions never fire. That is the whole of the 67.3% function figure.
- `origin-host-guard.ts` lines 19 and 37.
- `server.ts` entirely (above).

Every HTTP route in `createApp` is exercised. The gap is the wiring, not the
behaviour.

## What each lane contributes

The lanes are not redundant, and the integration lane is not optional cover:

| Measured against `packages/core` | Lines |
|---|---|
| `core` lane alone | 67.2% (1348/2006) |
| `integration` lane alone | 87.5% (1755/2006) |
| Both | 96.0% (1925/2006) |

**15 `core` files are at 0% without the integration lane** — every one of them
an adapter, which is what `.claude/rules/testing.md` prescribes:

```
deploy/deployed-cleanup.ts        deploy/deployed-content.ts
deploy/git-origin-url.ts          deploy/inventory-git.ts
filesystem/copy-skill-folder.ts   filesystem/copy-tree-fs.ts
git/non-interactive.ts            harness/harness-git.ts
inventory/clone-repository.ts     inventory/default-branch.ts
inventory/harness-scaffold-git.ts inventory/head-commit.ts
inventory/repository-root.ts      registry/node-file-system.ts
tools/tool-presence.ts
```

## What coverage costs

Same machine, same session, back to back:

| Run | Wall time |
|---|---|
| `vitest run` | 64.4s |
| `vitest run --coverage` | 82.5s |

About **+18s, roughly +28%**. Far too slow for the coding loop; fine on demand.
(The map's 51.8s baseline was measured on an idle machine; the 64.4s figure
here is the fair comparison for the 82.5s.)

## What this map does not tell you

- **Whether the tests would notice if the code were wrong.** Coverage counts
  execution, not assertion. That is #739's question.
- **Anything about the real-apm canaries.** All four are gated behind
  `MAESTRO_REAL_APM=1`, which was not set, so the real `ApmCliDriver` paths in
  the numbers above are covered by fakes only.
- **Branch coverage below the file level.** 194 uncovered branches are spread
  thin across otherwise well-covered files; no cluster stands out.
