---
name: verify-in-smoke
description: Verify a `pnpm smoke` run, screenshot, or dev-server observation before treating it as proof of correctness — checks for a stale sandbox, a squatted port from a sibling worktree, leaked browser state, the sandbox `HOME`, and full-suite flakiness. Use before declaring a screenshot, first-run behavior, or a `pnpm test` result verified, or when `pnpm smoke` behaves unexpectedly (a connect gate that never shows, a refused port, a failing fetch, stale state after a restart, unrelated test failures).
---

# Verify in smoke

Five things make a `pnpm smoke` run, screenshot, or test result lie to you. Check the one that matches what you're looking at before calling it evidence.

## Wrong environment: `pnpm dev` instead of `pnpm smoke`

`pnpm dev` reads the real `~/.maestro`, which usually already holds config — first-run behavior (the connect gate) never renders there. → Use `pnpm smoke` for anything first-run; it wipes `.maestro-sandbox` on start (ADR-0010).

## Wrong address: the port belongs to the worktree

Each worktree serves on its own pair of ports, derived from its path — there is no fixed 5173. A URL copied from a doc, another session, or an open tab points at whatever worktree owns that port. → Ask this worktree: `pnpm cockpit:url`, or read the line `pnpm dev`/`pnpm smoke` prints on start. Screenshot only that address, against a cockpit you started here.

Under `pnpm smoke`, vite listens on `[::1]` only. → Open the `localhost` URL `pnpm cockpit:url` prints; `127.0.0.1:<web port>` is refused while the stack is up.

Owning it at start does not settle it. → Run `pnpm smoke:check` before each screenshot; it re-asks who holds *this* worktree's two ports — including the one the browser renders from — and seeds nothing, so it is safe to repeat. It also measures every table screen at several panel widths, with a detail pane open, and names each table wider than its scroll container.

## Wrong session: leaked browser state

`localStorage` is scoped to the origin, so a worktree keeps its own — but a value left by an earlier run of *this* worktree survives a restart and reads as a product bug. → Clear it before trusting: `agent-browser eval "localStorage.clear(); location.reload()"`.

The default `agent-browser` session is shared by every worktree; another session can move its tab. → Drive this worktree's own session, `agent-browser --session maestro-<worktree folder>`. `pnpm cockpit:snapshot "<selector>" [path]` reads that session as trimmed text and prints its name and URL.

## Wrong home: the sandbox `HOME`

`--smoke` redirects `HOME`, so git runs without a credential helper. A private https fetch then fails `could not read Username`, while the same fetch works by hand. → Point the sandbox clone at a local bare mirror with `url.<mirror>.insteadOf <origin url>`, as `scripts/fixture-harness.mjs` does for the fixture harness. Judge the fetch path only from a run that reaches its origin.

The redirected `HOME` also gives corepack a cold cache: a hang, or `getaddrinfo ENOTFOUND registry.npmjs.org`. → A script that redirects `HOME` carries `COREPACK_HOME` over and sets `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, as `scripts/dev.mjs` does.

## Wrong signal: chained commands flake

`pnpm test` run standalone is honest; chained behind `lint`/`typecheck` in one invocation has shown failures in files the diff never touched. → When `pnpm test` fails in untouched files, re-run it alone before calling it a regression. Don't chain `lint`/`typecheck`/`test` in one invocation when the result is about to become a green/red claim.

## When done

Stop the stack with `pnpm smoke:stop`. A running stack slows every other worktree's test run.
