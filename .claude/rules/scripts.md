---
paths:
  - "scripts/**"
---

# Scripts (project-specific for Maestro)

- `scripts/` holds plain ES-module JavaScript (`.mjs`), run by `node` without a build step. Write new scripts as `.mjs`.
- A script that a TypeScript test imports gets a hand-written sibling `.d.mts`.
- A guard exports its check. Its test calls that function per case and runs the command once, for the exit code and the printed lines.
