---
name: worktree
description: "Create and prepare a git worktree for a Maestro backlog issue, then pull the issue so the agent is ready to implement. Use in the Maestro repo when the user asks to make/set up a worktree for an issue — e.g. 'maak een worktree aan voor issue 214 te implementeren', 'worktree voor issue 214', 'start issue 214 in een worktree'. Maestro-specific: worktrees live at ~/Projects/maestro-worktrees/issue<N> on branch feature/issue<N>."
---

# Maestro worktree

Create one worktree per backlog issue, prepared and ready to implement. The convention is fixed for this repo.

**Anchor repo:** `~/Projects/maestro` (the primary checkout — run every `git` command with `-C` against it, never rely on cwd).
**Worktree path:** `~/Projects/maestro-worktrees/issue<N>`
**Branch:** `feature/issue<N>`

## Steps

### 1. Get the issue number
Read `<N>` from the user's message. If no number is present, ask for it and stop — do not guess.
**Done when:** you have a single integer `<N>`.

### 2. Create the worktree from fresh main
Fetch, then add the worktree branched off origin's main:
```bash
git -C ~/Projects/maestro fetch origin
git -C ~/Projects/maestro worktree add ~/Projects/maestro-worktrees/issue<N> -b feature/issue<N> origin/main
```
Handle what already exists — check first with `git -C ~/Projects/maestro worktree list`:
- Worktree path already exists → skip creation, report it, continue to step 3.
- Branch `feature/issue<N>` already exists (but no worktree) → drop `-b origin/main`, check it out instead: `git -C ~/Projects/maestro worktree add ~/Projects/maestro-worktrees/issue<N> feature/issue<N>`.

**Done when:** `git -C ~/Projects/maestro worktree list` shows the path on branch `feature/issue<N>`.

### 3. Prepare it
A fresh worktree has no `node_modules` — install (the pnpm store is shared, so this is fast):
```bash
pnpm -C ~/Projects/maestro-worktrees/issue<N> install
```
**Done when:** install exits 0 and `~/Projects/maestro-worktrees/issue<N>/node_modules` exists.

### 4. Pull the issue and explain it for a product manager
```bash
gh issue view <N> --repo fimoklei/maestro
```
Explain the issue in two or three sentences a product manager can read aloud: what will change for the user, and how we will know it's done (the acceptance signal). Use plain words — spell out any technical term. If the issue names a spec, board job, or linked doc, note it.
**Done when:** you have a plain-language, PM-readable explanation of what the issue will do, covering the user-facing change and the acceptance signal.

### 5. Enter the worktree and implement
Switch this session into the worktree — no manual `cd`, no new session:
- Call **EnterWorktree** with `path: ~/Projects/maestro-worktrees/issue<N>`. This session now runs there. (It only enters — it never removes your worktree, since you created it with `git worktree add`.)
- Confirm in Dutch: worktree path, branch, that deps are installed, and the one-line task summary from step 4.

Then hand off to the `implement` skill to build the issue — it runs the work through TDD at the agreed seams and keeps the repo's rules. Do not start `/tdd` directly from here.
**Done when:** the session's working directory is the worktree and the `implement` skill has taken over the issue.
