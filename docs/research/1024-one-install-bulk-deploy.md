# Spike: one install carrying a whole bulk deploy (issue #1024)

Date: 2026-09-20. apm 0.29.0, sandbox `HOME` (`realpath`ed), `GITHUB_TOKEN`
and `GITHUB_APM_PAT` from `gh auth token`, no rate-limit line in any capture.
Asks whether the 125 s a 34-skill bulk deploy took
([#896](https://github.com/fimoklei/maestro/issues/896)) is apm's cost or the
cost of `BulkDeploySkills` running one full deploy per name.

Ref: `github.com/fimoklei/agent-harness#v0.6.0` (36 skills; the first 34 by
name). Each run starts from an empty `git init` folder, or an empty home for
`-g`, so every install is a first install.

```sh
apm install <ref> --skill <name> -t claude,codex                  # 1 skill
apm install <ref> --skill <n1> … --skill <n34> -t claude,codex    # 34 skills
apm install <ref> --skill <n1> … --skill <n34> -g -t claude,codex # from a neutral cwd
```

| Run | Wall time | Result |
|---|---|---|
| repo, 1 skill (#1) | 4.14 s | success marker, exit 0 |
| repo, 34 skills (#1) | 3.07 s | success marker, 34 dirs under `.claude/skills` |
| repo, 1 skill (#2) | 3.18 s | success marker, exit 0 |
| repo, 34 skills (#2) | 3.32 s | success marker, 34 dirs |
| global, 34 skills | 3.88 s | success marker, 34 dirs under `~/.claude/skills` |

## Reading

- An install's time does not grow with the number of skills: 34 cost what one
  costs. The time is the fetch of the package, not the copies.
- The 125 s is therefore 34 installs in sequence, each re-installing the whole
  Selection so far. One install with every name does the same work in 3–4 s.
- Not measured: Maestro's own share around the install (guards over every
  copy, the `skills:` write, the read-back). A single deploy through the route
  took 1.7–6.3 s in #896 with all of that included, so one install for the
  batch stays under the 10 s line.
- Not measured: a refusal inside a batch. Today one refused skill leaves the
  others to deploy; with one install the guards have to sort the names before
  apm runs, and an install failure fails every name at once.
