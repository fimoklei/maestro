---
name: verify-in-smoke
description: Verify a `pnpm smoke` run, screenshot, or dev-server observation before treating it as proof of correctness — checks for a stale sandbox, a squatted port from a sibling worktree, leaked browser state, and full-suite flakiness. Use before declaring a screenshot, first-run behavior, or a `pnpm test` result verified, or when `pnpm smoke` behaves unexpectedly (empty picker, blocked path, stale warning, unrelated test failures).
---

# Verify in smoke

Five things make a `pnpm smoke` run, screenshot, or test result lie to you. Check the one that matches what you're looking at before calling it evidence.

## Wrong environment: `pnpm dev` instead of `pnpm smoke`

`pnpm dev` reads the real `~/.maestro`, which usually already holds config — first-run behavior (the connect gate) never renders there. → Use `pnpm smoke` for anything first-run; it wipes `.maestro-sandbox` on start (ADR-0010).

## Wrong worktree: a sibling is squatting the port

Every worktree defaults to the same ports (3000/5173). A dev server left running in a sibling worktree can keep holding the port, so your screenshot shows the wrong branch. → Start the cockpit from *this* worktree: `pnpm smoke` kills whatever holds those ports first, and refuses to start (naming the process and its directory) when a holder survives. Screenshot only against a cockpit you started here.

## Wrong path: the browse ceiling is HOME

The filesystem-browse endpoint's root ceiling is `os.homedir()` (ADR-0009). Under `pnpm smoke` that's `.maestro-sandbox/home` — a seeded repo placed beside it, not under it, makes the picker look empty. → When a browse flow looks empty, check the path sits under sandbox `HOME`, not beside it.

## Wrong session: leaked browser state

`localStorage` is scoped to the origin, and every worktree serves on the same `localhost:5173` — a remembered value (e.g. the last browsed folder) survives from one worktree's session into another's, and reads as a product bug. → Clear it before trusting: `agent-browser eval "localStorage.clear(); location.reload()"`.

## Wrong signal: chained commands flake

`pnpm test` run standalone is honest; chained behind `lint`/`typecheck` in one invocation has shown failures in files the diff never touched. → When `pnpm test` fails in untouched files, re-run it alone before calling it a regression. Don't chain `lint`/`typecheck`/`test` in one invocation when the result is about to become a green/red claim.
