---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "tests/**/*.ts"
  - "scripts/**"
---

# Code comments

- Write no comments, in product code, tests and scripts alike. Say it with a
  name, a type, a smaller function or a test name.
- Tool directives (`biome-ignore`, `@ts-expect-error`) are not comments.
- When a change removes comments, run `pnpm comment-ratchet --update` and
  commit `scripts/comment-baseline.json`.
- Never raise the baseline by hand.
- A hard-to-reverse decision goes in an ADR; reasoning for one change goes in
  the PR body. The code does not point at either.
- A hack that needs an explaining comment gets a tracker issue instead.
