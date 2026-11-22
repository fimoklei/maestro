---
name: delete-comment
description: Sweep the code comments out of one folder or file list of the Maestro repo — classify each one, delete it, file an issue for a hack it excused, move a real decision into an ADR — then lower the comment-ratchet baseline. Use in the Maestro repo when the user asks, in any language, to delete, sweep or burn down code comments, or names /delete-comment.
---

# Delete comments

Argument: a folder or file list (`packages/server`). Without one, pick the
folder with the most lines in `scripts/comment-baseline.json` and say which.

## 1. List

Run `node scripts/comment-ratchet.mjs` first; it must pass. List every
comment in scope with its file and line. Read the code around each one.

## 2. Classify

Give each comment one class:

| Class | Test | Action |
| --- | --- | --- |
| Tautology | Repeats what the name, type or line already says | Delete |
| Stale | Names code, a state or a behaviour that no longer exists | Delete |
| Excuse | Covers a shortcut, workaround, `for now`, or a cast the types should make unnecessary | Delete; list it for an issue |
| Warning | Tells a reader what breaks if the code changes | See step 3 |
| Decision | A hard-to-reverse choice across modules (security, port, layer, format) | Move to an ADR, then delete |

A local `why` that is no hard-to-reverse decision is a Warning or a Tautology,
never a Decision.

## 3. Warnings need a guard first

Delete a Warning only when a test fails if someone makes the change it warns
against. Find that test, or prove it: break the guarded line, run the test,
see it fail, restore the line.

- A guarding test exists → delete the comment.
- None exists → write the test (`/tdd`, RED by mutation as above), then delete.
- A test is too costly in this sweep → keep the comment and list it under
  "Kept" in the report.

Prefer turning the warning into a name or a test name over keeping it.

## 4. Decisions

Before writing an ADR, check `docs/adr/` for one that already covers it; add a
line there instead. A new ADR follows the `domain-modeling` skill. The code
does not point at the ADR.

## 5. Excuses

Draft one tracker issue per hack (`docs/agents/issue-tracker.md`): the file,
the shortcut, what a proper fix does. Show the drafts to the operator; create
them only after a yes.

## 6. Lock in

1. Delete the comments; remove a blank line left behind.
2. `pnpm format`, then `node scripts/comment-ratchet.mjs --update`.
3. `pnpm lint`, `pnpm typecheck` and `pnpm test:affected`.
4. Commit through `workflow-commit` with the baseline file.

## Report

Counts per class, comment lines removed, the Kept list with reasons, the ADRs
touched, the issue drafts.
