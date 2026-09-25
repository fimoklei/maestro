# Code comments (project-specific for Maestro)

- Default: no comment. A clear name and signature beat a comment.
- A doc comment (`/** */`) states what an export is, in one line, only when its
  name and signature do not already say it.
- A `why` or warning comment only where a reader would otherwise break the
  code. Keep it short; cite a public issue (`#1528`) when the history matters.
- Never cite a document in a comment: no ADR, no research note, no local file.
- Reasoning goes in the PR body under `## What changed`, `## Why`, `## Verified`.
  Decisions that are hard to reverse get an ADR; the code does not point at it.
- Update a doc comment when the behaviour it describes changes.
- Never a TODO without a linked issue.
