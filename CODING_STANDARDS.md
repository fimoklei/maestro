# Coding standards

The standards live in `.claude/rules/`. Review a diff against every rule file
whose `paths:` frontmatter matches a changed file, and against every rule file
without `paths:`. Cite the file and the rule.

## Adding a rule

For a rule a linter, a script or a test can check, propose that check
(`scripts/comment-guard.mjs` is the model) and add it once the owner approves.
A contract test that reads source files is such a check when the rule binds
source to rendered behaviour (`dialog-contract.test.tsx` is the model); review
it as a check, not a breach.
A rule file holds only judgement calls. Scope a new rule file with `paths:`; `pnpm rules-guard` fails a pattern
that matches no file.
