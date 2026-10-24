---
paths:
  - "packages/core/src/git/**"
  - "packages/core/src/**/*-git*.ts"
  - "packages/core/src/deploy/git-origin*"
  - "packages/core/src/inventory/default-branch*"
  - "tests/git/**"
  - "tests/helpers/git-fixture.ts"
  - "scripts/fixture-harness.mjs"
  - "docs/research/552-empty-repo-and-scaffold-shape.md"
---

# git driver rules (project-specific for Maestro)

Imperatives for driving `git` — rules only. Measured against git 2.50.1–2.51;
the empty-repository captures are in
`docs/research/552-empty-repo-and-scaffold-shape.md`.

## Origin URL

- Show and identify an origin by its configured URL,
  `git config --get remote.origin.url` (`readConfiguredGitOriginUrl`).
- Use `git remote get-url origin` only for where git will connect: it applies
  `insteadOf` rewrites.

## Default branch and `origin/HEAD`

- Read an empty repository's default branch from its clone,
  `git symbolic-ref HEAD`. `ls-remote --symref <url> HEAD` prints nothing on
  an empty repository and exits 0.
- Expect `origin/HEAD` to be absent on a clone of an empty repository, and
  after its first push.
- Run `remote set-head origin --auto` only straight after a fetch that
  succeeded; against an unreachable remote it blocks for a minute. Everywhere
  else, tests included, set `origin/HEAD` from local refs with `symbolic-ref`
  (`setOriginHead`).

## Test remotes

- Let a local bare remote stand in for GitHub for clone, `origin/HEAD` and a
  push to the same branch only. On a first push of another branch into an
  empty repository, GitHub makes that branch the default; a bare remote leaves
  `HEAD` dangling.
- Give a temp clone an offline `github.com` origin with
  `url.<local path>.insteadOf <github url>`.
- Redirect apm's GitHub installs offline through the
  `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` channel
  (`scripts/fixture-harness.mjs`). apm's `GIT_CONFIG_GLOBAL=/dev/null` leaves
  that channel active, so check it too before you call a run git-config
  isolated.
