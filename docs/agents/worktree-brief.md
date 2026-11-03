# Worktree sub-agent brief

Paste this block into the brief of every sub-agent that works in its own
worktree (`isolation: "worktree"`).

```
You work in an isolated git worktree. It has no node_modules and no
auto-loaded rule files, and it may not start on the branch you build on.
- First run `pnpm install --frozen-lockfile`. Then read the rule files for
  your task (CODING_STANDARDS.md → Rule files by task) and LEARNINGS.md → Active.
- To build on a branch, run `git reset --hard <branch>` as its own call.
- Run one plain command per call. The isolation guard refuses `&&` and `;`
  chains, `$VAR`, `eval`, heredocs and `python3 -`.
- `cd` only to an absolute path.
- Edit files with Edit or Write.
- Clear browser storage with `agent-browser --session <name> storage local clear`,
  then `agent-browser --session <name> reload`.
```
