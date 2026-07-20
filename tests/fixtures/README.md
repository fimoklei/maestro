# apm fixture provenance

What produced each captured file, so a future reader can re-run it instead of
trusting it. Every fixture below was captured from a real `apm` run on
**0.26.0, 2026-07-20** (issues #183 / #184), replacing the 0.16.0/0.20.0
captures. What the outputs *mean* lives in `.claude/rules/apm-driver.md`; this
file only records how they were taken.

## Why provenance lives here and not in the files

`ApmCliDriver` greps this text after whitespace-normalizing and lowercasing it,
so a `#` comment inside a `.txt` fixture is classified as apm output, not as a
comment. A header reading "…destination is a symlink" would make a fixture
match `INSTALL_SYMLINK_PHRASE` on its own. The table-shaped fixtures have the
same problem with their row parsers. So provenance goes here, and the `.txt`
fixtures the driver or a parser reads stay byte-exact captures.

The one exception is `apm-update-noop.txt`: nothing in the codebase parses it —
it exists so a reader can see why Maestro updates by re-install rather than by
`apm update` — so it opens with comment lines and the command line that produced
it. Any fixture that gains a reader loses that licence.

Phrases a fixture comment must never contain: `is a symlink`,
`installation failed`, `with <n> error(s)`, `installed <n> apm dependenc`,
`authentication failed`, `no token available`.

## Capture conditions common to all

- Non-TTY (redirected to a file), so Rich renders without colour.
- `HOME` redirected to a throwaway sandbox for every run. No `-g` command ever
  ran against the real home (`LEARNINGS.md`).
- Auth, where needed, via `GITHUB_APM_PAT` + `GITHUB_TOKEN` from `gh auth token`
  — the `HOME` redirect strips the gh credential helper.
- Skill under test: `github.com/fimoklei/agent-harness/skills/tdd`.

"Streams" records what the file holds, because the driver classifies
`stdout + "\n" + stderr` for `install`, but reads stdout alone for `view` and
`outdated`.

## Command output

| Fixture | Command | Conditions | Exit | Streams |
|---|---|---|---|---|
| `apm-install-ok.txt` | `apm install <ref>#v0.5.0 -t claude` | fresh `git init` repo | 0 | out+err |
| `apm-install-probes-failed.txt` | `apm install <ref>#v0.5.0 -t claude` | no credentials in env | 1 | out+err |
| `apm-install-symlink-refused.txt` | `apm install <ref>#v0.5.1 -g -t claude` | sandbox `~/.claude/skills/tdd` pre-created as a symlink | 1 | out+err |
| `apm-view-versions.txt` | `apm view fimoklei/agent-harness versions` | authed | 0 | out |
| `apm-view-auth-failed.txt` | `apm view fimoklei/agent-harness versions` | no credentials, `GIT_TERMINAL_PROMPT=0` | 1 | out+err |
| `apm-outdated-could-not-check.txt` | `apm outdated` | `COLUMNS=200`, repo pinned at v0.5.0, no credentials | 0 | out |
| `apm-outdated-global.txt` | `apm outdated -g` | `COLUMNS=200`, global install pinned at v0.5.0, authed | 0 | out |
| `apm-outdated-global-uptodate.txt` | `apm outdated -g` | `COLUMNS=200`, global install at the latest tag, authed | 0 | out |
| `apm-update-noop.txt` | `apm update -y -t claude,codex` | `COLUMNS=120`, repo pinned at v0.5.0 while v0.5.1 exists | 0 | out+err |
| `apm-targets-claude.json` | `apm targets --json` | repo containing `.claude/` only | 0 | out |

`COLUMNS=200` matches `WIDE_COLUMNS` in `apm-cli-driver.ts` — the width
production actually sets, so the fixture wraps the way the parser will see it.

## Lockfiles

Each is the `apm.lock.yaml` written by the install named below — copied
verbatim; the YAML body is never hand-edited. Per-repo lockfiles come from the
repo root; global ones from `<sandbox HOME>/.apm/`. One,
`apm.lock.global-single-tool.yaml`, carries an added `#` comment header, because
it is otherwise indistinguishable from its per-repo twin (below). That is safe
where it would not be in a `.txt` fixture: a lockfile is read by a YAML parser,
which drops comments, not by the raw-text greps the section above is about.
`server-global-deploy-state.test.ts` parses this file and is unaffected.

| Fixture | Install |
|---|---|
| `apm.lock.tag-pinned.yaml` | `apm install <ref>#v0.5.0 -t claude` (per-repo) |
| `apm.lock.tag-pinned-v0.5.1.yaml` | `apm install <ref>#v0.5.1 -t claude` (per-repo) |
| `apm.lock.global-two-tool.yaml` | `apm install <ref>#v0.5.1 -g -t claude,codex` |
| `apm.lock.global-single-tool.yaml` | `apm install <ref>#v0.5.1 -g -t claude` |

Two 0.26.0 facts worth knowing before reading them, both written up in
`.claude/rules/apm-driver.md` (#185): the `deployments:` rows record
`scope: project` even for a `-g` install, so `scope` does not distinguish global
from per-repo; and `apm.lock.global-single-tool.yaml` now carries the same
payload as `apm.lock.tag-pinned-v0.5.1.yaml` — identical apart from
`generated_at` and the comment header noted above — because a single-tool global
install and a single-tool per-repo install produce the same relative paths.
