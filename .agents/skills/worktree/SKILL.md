---
name: worktree
description: "Create and prepare a git worktree for a Maestro backlog issue, then pull the issue so the agent is ready to implement. Use in the Maestro repo when the user asks to make/set up a worktree for an issue — e.g. 'maak een worktree aan voor issue 214 te implementeren', 'worktree voor issue 214', 'start issue 214 in een worktree'. Also use for cleaning up leftover worktrees — 'welke worktrees staan er nog open', 'verwijder die worktree', 'ruim de worktrees op'. Maestro-specific: worktrees live at ~/Projects/maestro/.claude/worktrees/issue<N> on branch feature/issue<N>."
---

# Maestro worktree

Create one worktree per backlog issue, prepared and ready to implement. The convention is fixed for this repo.

**Anchor repo:** `~/Projects/maestro` (the primary checkout — run every `git` command with `-C` against it, never rely on cwd).
**Worktree path:** `~/Projects/maestro/.claude/worktrees/issue<N>` (under the repo's `.claude/worktrees/`, so `EnterWorktree` can switch this session into it — paths elsewhere are refused).
**Branch:** `feature/issue<N>`

## Steps

### 1. Get the issue number
Read `<N>` from the user's message. If no number is present, ask for it and stop — do not guess.
**Done when:** you have a single integer `<N>`.

### 2. Create the worktree from fresh main
Fetch, then add the worktree branched off origin's main:
```bash
git -C ~/Projects/maestro fetch origin
git -C ~/Projects/maestro worktree add ~/Projects/maestro/.claude/worktrees/issue<N> -b feature/issue<N> origin/main
```
Handle what already exists — check first with `git -C ~/Projects/maestro worktree list`:
- Worktree path already exists → skip creation, report it, continue to step 3.
- Branch `feature/issue<N>` already exists (but no worktree) → drop `-b origin/main`, check it out instead: `git -C ~/Projects/maestro worktree add ~/Projects/maestro/.claude/worktrees/issue<N> feature/issue<N>`.

**Done when:** `git -C ~/Projects/maestro worktree list` shows the path on branch `feature/issue<N>`.

### 3. Prepare it
A fresh worktree has no `node_modules` — install deps (the pnpm store is shared, so this is fast):
```bash
pnpm -C ~/Projects/maestro/.claude/worktrees/issue<N> install
```
**Done when:** install exits 0 with `node_modules/` present.

### 4. Pull the issue, check its blockers, and explain it for a product manager
```bash
gh issue view <N> --repo fimoklei/maestro
```
Look for a `## Blocked by` section in the body (the `to-tickets` convention — a list of blocking issues, or "None — can start immediately"). The body's own annotation can be stale, so check each referenced issue's live state instead of trusting it:
```bash
gh issue view <blocker-N> --repo fimoklei/maestro --json state,stateReason,title
```
Any blocker still `OPEN` means starting `<N>` now risks a conflict with work still in flight — this is exactly the parallel-start collision the check exists to catch. No `## Blocked by` section means treat the issue as unblocked; don't invent a dependency that isn't written down.

Explain the issue in two or three sentences a product manager can read aloud: what will change for the user, and how we will know it's done (the acceptance signal). Use plain words — spell out any technical term. If the issue names a spec, board job, or linked doc, note it.
**Done when:** you've stated the blocker status (none / all closed / open — name them) AND you have a plain-language, PM-readable explanation covering the user-facing change and the acceptance signal.

### 5. Enter the worktree and implement
If step 4 found an open blocker, stop here and ask Michiel whether to proceed anyway or wait — do not enter the worktree or hand off to implement on an unconfirmed conflict risk.

Switch this session into the worktree — no manual `cd`, no new session:
- Call **EnterWorktree** with the **absolute** path, exactly as `git -C ~/Projects/maestro worktree list` printed it
  (`/Users/<you>/Projects/maestro/.claude/worktrees/issue<N>`). EnterWorktree does not expand `~` — a literal
  tilde is joined to the cwd and fails with ENOENT. This session now runs there. (It only enters — it never removes your worktree, since you created it with `git worktree add`.)
- Confirm in Dutch: worktree path, branch, that deps are installed, the blocker status, and the one-line task summary from step 4.

Then hand off to the `implement` skill to build the issue — it runs the work through TDD at the agreed seams and keeps the repo's rules. Do not start `/tdd` directly from here.
**Done when:** the session's working directory is the worktree and the `implement` skill has taken over the issue.

## Cleaning up

Shipping a branch handles its own worktree (`workflow-ship` step 9). This is for the leftovers — a worktree
whose issue was abandoned, or whose branch was merged elsewhere.

```bash
git -C ~/Projects/maestro worktree list          # what still exists
git -C ~/Projects/maestro branch --merged main   # which of those branches are already in
```
Remove one, always from the anchor repo and never while the session stands inside it (call **ExitWorktree**
with `action: "keep"` first):
```bash
git -C ~/Projects/maestro worktree remove ~/Projects/maestro/.claude/worktrees/issue<N>
git -C ~/Projects/maestro branch -d feature/issue<N>   # -D only if the PR state says MERGED
git -C ~/Projects/maestro worktree prune
```
A worktree with uncommitted work is not leftover — report it and ask, never `--force`.
