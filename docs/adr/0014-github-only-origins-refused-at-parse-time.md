# ADR-0014 — Deployable origins are GitHub-only, refused at parse time

- **Status:** Accepted
- **Date:** 2026-07-20 (decision made in issues #152/#185; recorded here when
  the apm rules file was split by lifecycle)

## Context

A skill is a *virtual package*: `owner/repo` plus a `skills/<name>` subpath.
The #152 spike (run against apm's own reference parser,
`DependencyReference.parse`, so repeatable offline)
established that apm's ref grammar leaves no safe room for non-GitHub
origins — the observed grammar is in `docs/apm-behavior.md` → "Reference
grammar":

- Transport forms (`ssh://`, `http://`, custom ports) cannot carry a
  subpath: apm rejects "A subpath cannot be embedded in a git URL".
- The shorthand form is host-gated: only `github.com` and `dev.azure.com`
  parse a trailing `skills/<name>` as a virtual package. On any other host
  the subpath **silently** becomes part of the repo name — a ref naming a
  repo that does not exist, with no error to catch.
- apm's escape hatch (the apm.yml `git:` + `path:` key pair) is not
  reachable from the CLI, and Maestro drives `install` by argument, never by
  hand-writing apm.yml.

Issue #185 later found the port observations partly stale (apm PRs
#2210/#2211 reworked port handling). That does not move this decision: it
rests on ADR-0003's model — Maestro deploys from the central inventory's
GitHub remote — not on what apm's parser happens to accept in any version.

## Decision

**`parseGitOrigin` allowlists `github.com` as the one deployable host and
returns null for any origin carrying transport apm's skill grammar cannot
express — at parse time, not at install time.**

- Refused: a non-default port, and `http:`/`file:`/`git:` schemes (the
  latter two were already refused).
- **"Non-default" is load-bearing for the port check.** JS `URL` blanks a
  default port only for schemes it knows, and `ssh:` is not one — so
  `ssh://host:22/o/r` keeps `port === "22"` where `https://host:443/o/r`
  yields `""`. A bare `port.length > 0` test would refuse an ordinary SSH
  remote; the check compares against the scheme's default instead.
- Connect and deploy share the one function, so both refuse consistently and
  the user hears it at connect time instead of at the first failing
  `apm install`.
- `DeploySkill` passes only `origin.ownerRepo` to `resolveLatestTag`,
  dropping the host — tag resolution always runs against GitHub.

## Consequences

- A non-GitHub or transport-carrying origin fails fast with a clear signal
  at connect, never as a confusing apm error (or worse, a silent mis-parse)
  mid-deploy.
- Supporting another host would take a new ADR plus a re-spike of apm's ref
  grammar for that host — including the post-#2210/#2211 port behavior,
  which is currently unobserved (`docs/apm-behavior.md` → "Unobserved").
- Implementation and its tests: `packages/core/src/deploy/git-origin.ts`.

## Rejected alternatives

- **Representing transport (ports/schemes) in deploy refs.** The observed
  grammar rules it out: no input form carries both a transport and a skill
  subpath. Rejected on measurement, not preference.
- **Relying on apm's own errors.** On unknown hosts there is no error — the
  subpath is silently swallowed into the repo name. Parse-time refusal is
  the only place the mistake is visible.
- **Hand-writing apm.yml (`git:` + `path:`).** An unspiked surface, and it
  abandons the drive-by-argument model (`security.md`) for the one case
  ADR-0003 already excludes.
