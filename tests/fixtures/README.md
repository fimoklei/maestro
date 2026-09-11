# apm fixture provenance

What produced each captured file, so a future reader can re-run it instead of
trusting it. Every fixture below reflects `apm` **0.29.0**, re-run on
**2026-09-04** (issue #772) from the 0.26.0 set of 2026-07-20 (#183/#184) and
2026-07-27 (#334). Each fixture is in one of two states — the difference matters
when you audit one:

- **Re-captured** — the command was re-run on 0.29.0 and its output overwrote
  the older file. Git shows the file changing on 2026-09-04. Every lockfile was
  overwritten even where only `generated_at` / `apm_version` moved, so its
  header names the version it came from.
- **Verified unchanged** — the command was re-run on 0.29.0 and printed exactly
  what the existing file already held, so nothing was written. Git still shows
  the older capture date. Two fixtures are in this state, marked ✓= below.

What the outputs *mean* lives in `docs/apm-behavior.md`; this file only
records how they were taken.

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
`authentication failed`, `no token available`, `uninstall complete`,
`not found in apm.yml`.

## Capture conditions common to all

- Non-TTY (redirected to a file), so Rich renders without colour.
- `HOME` redirected to a throwaway sandbox for every run, **`realpath`ed**: a
  symlink component in `HOME` makes a 0.29.0 `-g` install deploy nothing
  (`docs/apm-behavior.md` § Global scope). No `-g` command ever ran against the
  real home (`LEARNINGS.md`).
- Auth, where needed, via `GITHUB_APM_PAT` + `GITHUB_TOKEN` from `gh auth token`
  — the `HOME` redirect strips the gh credential helper. "No credentials" means
  both unset, plus `GH_TOKEN`.
- The install pre-flight probe runs **anonymously** for a public repo. When the
  machine's unauthenticated GitHub quota is spent, every install prints an
  `[i] GitHub API rate limit hit …` line and continues. Capture install fixtures
  only when that line is absent — it is an artefact of the capturing machine,
  not of apm's install path.
- Skill under test: `github.com/fimoklei/agent-harness/skills/tdd` at v0.5.0 /
  v0.5.1 — the retired demo Harness at historic tags, so these captures carry
  the old root `skills/` subpath. The canonical shape is `.apm/skills/<name>`
  (ADR-0021) and is what the v0.6.0 captures name.

"Streams" records what the file holds, because the driver classifies
`stdout + "\n" + stderr` for `install` and `uninstall`, but reads stdout alone
for `view` and `outdated`.

## Command output

| Fixture | Command | Conditions | Exit | Streams |
|---|---|---|---|---|
| `apm-install-ok.txt` | `apm install <ref>#v0.5.0 -t claude` | fresh `git init` repo | 0 | out+err |
| `apm-install-no-changes.txt` | `apm install github.com/fimoklei/agent-harness/.apm/skills/47#v0.6.0 -t claude,codex` | `COLUMNS=200`, same ref already installed and unchanged | 0 | out+err |
| `apm-install-probes-failed.txt` | `apm install <ref>#v0.5.0 -t claude` | no credentials in env | 1 | out+err |
| `apm-install-symlink-refused.txt` | `apm install <ref>#v0.5.1 -g -t claude` | sandbox `~/.claude/skills/tdd` pre-created as a symlink | 1 | out+err |
| `apm-view-versions.txt` | `apm view fimoklei/agent-harness versions` | authed | 0 | out |
| `apm-view-auth-failed.txt` | `apm view fimoklei/agent-harness versions` | no credentials, `GIT_TERMINAL_PROMPT=0` | 1 | out+err |
| `apm-outdated-could-not-check.txt` ✓= | `apm outdated` | `COLUMNS=200`, repo pinned at v0.5.0, no credentials | 0 | out |
| `apm-outdated-global.txt` | `apm outdated -g` | `COLUMNS=200`, global install pinned at v0.5.0, authed | 0 | out |
| `apm-outdated-global-uptodate.txt` ✓= | `apm outdated -g` | `COLUMNS=200`, global install of `.apm/skills/tdd` at the latest tag (v0.6.0), authed | 0 | out |
| `apm-update-noop.txt` | `apm update -y -t claude,codex` | `COLUMNS=120`, repo pinned at v0.5.0 while v0.5.1 exists | 0 | out+err |
| `apm-targets-claude.json` | `apm targets --json` | repo containing `.claude/` only | 0 | out |
| `apm-uninstall-dry-run.txt` | `apm uninstall --dry-run -v <ref>#v0.5.1` | repo holding two deps at `-t claude,codex` | 0 | out+err |
| `apm-uninstall-ok.txt` | `apm uninstall -v <ref>#v0.5.1` | same repo, removes one of the two deps | 0 | out+err |
| `apm-uninstall-not-found.txt` | `apm uninstall <ref>#v0.5.1` | same repo, package already gone | 1 | out+err |
| `apm-spike-941-step1-project.txt` | `apm install github.com/fimoklei/apm-spike-833#v2.0.0 --skill alpha --skill beta --skill gamma --skill delta --skill zeta -t claude,codex` | fresh `git init` repo, no credentials (#941) | 0 | out+err |
| `apm-spike-941-step1-global.txt` | same, `-g`, from a neutral cwd | sandbox `HOME` | 0 | out+err |
| `apm-spike-941-step2-narrow-project.txt` | `skills:` written to four, then `apm install <ref>#v2.0.0 --skill alpha --skill beta --skill gamma --skill zeta -t claude,codex` | five installed before | 0 | out+err |
| `apm-spike-941-step2-narrow-global.txt` | same, `-g` | five installed before | 0 | out+err |
| `apm-spike-941-step3-edited-drop-project.txt` | as step 2 | `.claude/skills/delta/SKILL.md` edited before the narrow | 0 | out+err |
| `apm-spike-941-step3-edited-drop-global.txt` | as step 2, `-g` | same edit under `HOME` | 0 | out+err |
| `apm-spike-941-step3b-second-install.txt` | as step 2, again | edited `delta` copy still on disk | 0 | out+err |
| `apm-spike-941-step3c-after-manual-delete.txt` | as step 2, again | edited `delta` copy deleted by hand | 0 | out+err |
| `apm-spike-941-step3d-narrow-again.txt` | as step 2 | after: kept-edited narrow, manual delete, reinstall of five | 0 | out+err |
| `apm-spike-941-step4-fail-project.txt` | as step 2 | `.claude/skills/gamma` 555, its `SKILL.md` 444 | 0 | out+err |
| `apm-spike-941-step4b-fail-project.txt` | as step 2 | `.claude/skills` 555 | 0 | out+err |
| `apm-spike-941-step4b-retry-project.txt` | as step 2 | after `chmod 755 .claude/skills` | 0 | out+err |
| `apm-spike-941-step4b-fail-global.txt` | as step 2, `-g` | `~/.claude/skills` 555 | 0 | out+err |
| `apm-spike-941-step4b-retry-global.txt` | as step 2, `-g` | after `chmod 755` | 0 | out+err |
| `apm-spike-941-step5-exact-list-v3.txt` | `skills:` written to `alpha beta gamma delta`, then `apm install <ref>#v3.0.0 --skill alpha --skill beta --skill gamma --skill delta -t claude,codex` | four at v2.0.0 before | 0 | out+err |
| `apm-spike-941-step5-control-v3-bare.txt` | `ref:` edited to `v3.0.0`, `apm install -t claude,codex` | `skills:` still names `epsilon` from a v1.0.0 install | 0 | out+err |
| `apm-spike-941-step5-control-v3-cli-stale.txt` | `apm install <ref>#v3.0.0 --skill alpha --skill beta --skill gamma --skill delta -t claude,codex` | `skills:` still names `epsilon` | 0 | out+err |
| `apm-spike-941-step6-install-cli.txt` | `apm install <ref>#v2.0.0 --skill alpha --skill beta --skill gamma -t claude,codex` | `apm.yml` = `apm.yml.spike-941-step6-after-writer.yaml` | 0 | out+err |
| `apm-spike-941-step6-install-bare.txt` | `apm install -t claude,codex` | same manifest, second (local-path) dependency present | 0 | out+err |
| `apm-uninstall-retained.txt` | `apm uninstall -v <ref>#v0.5.1` | same repo, `.claude/skills/tdd/SKILL.md` edited before the call | 1 | out+err |
| `apm-uninstall-global-ok.txt` | `apm uninstall -g -v <ref>#v0.5.1` | neutral cwd, global install at `-t claude,codex` beside an unrelated skill | 0 | out+err |

The five uninstall fixtures came from one scripted run against a throwaway
sandbox, `COLUMNS=200`, no token in the environment — uninstall needs neither
network nor credentials. Two lines in them are **not** stable across a
re-capture and nothing may key on them: `[*] Updated <path>/apm.yml` carries the
capture sandbox's absolute path, and `[i] Cleaned <n> stale files` counts what
that run deleted (`docs/apm-behavior.md` § Remove).

✓= marks a **verified unchanged** fixture (see the top of this file): re-run on
0.29.0, output identical, file untouched since its 2026-06-11 / 2026-07-20
capture.

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
| `apm.lock.spike-941-step3-kept-edited.yaml` | step 3 narrow over an edited `delta` copy (per-repo) — the kept file stays owned |
| `apm.lock.spike-941-step3d-phantom.yaml` | step 3d narrow (per-repo) — `.agents/skills/delta` rows with no file on disk |
| `apm.lock.spike-941-step4b-fail.yaml` | step 4b narrow with `.claude/skills` read-only (per-repo) — the dir row retained |

Two manifests sit beside them for #941 step 6: `apm.yml.spike-941-step6-before.yaml`
(hand-edited: a `#` line above the Harness entry, an inline comment on a list
item, a second local-path dependency) and `apm.yml.spike-941-step6-after-writer.yaml`
(the same file after the `skills:` writer prototype ran; see
`docs/research/941-narrowing-spike.md`).

Three facts worth knowing before reading them, all written up in
`docs/apm-behavior.md` § Lockfile: the `deployments:` rows record
`scope: project` even for a `-g` install, so `scope` does not distinguish global
from per-repo; `apm.lock.global-single-tool.yaml` carries the same payload as
`apm.lock.tag-pinned-v0.5.1.yaml` — identical apart from `generated_at` and the
comment header noted above — because a single-tool global install and a
single-tool per-repo install produce the same relative paths; and on 0.29.0 the
`.agents/…` rows carry `target: agents`, the deploy root, where 0.26.0 wrote the
tool name `codex`.

## Native-model spike (#929)

Captured 2026-09-11 on apm 0.29.0 by `docs/research/929-native-model-spike.md`
against the throwaway root package `github.com/fimoklei/apm-spike-833`
(`apm.yml` + `includes: auto` + six skills under `.apm/skills/`, tags
`v1.0.0` and `v2.0.0`; v2 changes `beta` and `gamma`, adds `eta`, deletes
`epsilon`). Conditions common to all: `COLUMNS=200`, `NO_COLOR=1`, sandbox
`HOME` (`realpath`ed), **no credentials at all** (`GITHUB_TOKEN`, `GH_TOKEN`,
`GITHUB_APM_PAT` unset; the repository is public), no rate-limit line in any
capture. `FIVE` below is `--skill alpha --skill beta --skill gamma --skill
delta --skill epsilon`; `FOUR` drops `epsilon`. "ref edit" means the
`ref: v1.0.0` line in the manifest was changed to `v2.0.0` by hand before a
bare install. Global runs used `-t claude,codex` from a neutral cwd.

`apm-spike-833-view-versions.txt` opens with the two-line
`A new version of APM is available` banner: the update check prints it to
**stdout** on the first apm command of a sandbox and caches the check in
`~/.cache/apm/last_version_check`. It is a true capture, kept so the versions
parser is exercised against it.

| Fixture | Command | Conditions | Exit | Streams |
|---|---|---|---|---|
| `apm-spike-833-view-versions.txt` | `apm view fimoklei/apm-spike-833 versions` | first command in a fresh sandbox | 0 | out |
| `apm-spike-833-step1-project.txt` | `apm install <ref>#v1.0.0 FIVE -t claude` | fresh `git init` repo | 0 | out+err |
| `apm-spike-833-step1-global.txt` | `apm install <ref>#v1.0.0 FIVE -g -t claude,codex` | empty sandbox home | 0 | out+err |
| `apm-spike-833-step2-project-cli.txt` | `apm install <ref>#v2.0.0 FIVE -t claude` | after step 1 project | 1 | out+err |
| `apm-spike-833-step2-project-bare.txt` | `apm install -t claude` | after step 1 project, ref edit, `epsilon` still in `skills:` | 0 | out+err |
| `apm-spike-833-step2c-cli-four.txt` | `apm install <ref>#v2.0.0 FOUR -t claude` | fresh repo after a v1 `FIVE` install | 0 | out+err |
| `apm-spike-833-step2-global-cli.txt` | `apm install <ref>#v2.0.0 FIVE -g -t claude,codex` | after step 1 global | 1 | out+err |
| `apm-spike-833-step2-global-bare.txt` | `apm install -g -t claude,codex` | after step 1 global, ref edit | 0 | out+err |
| `apm-spike-833-step2-global-bare-verbose.txt` | `apm install -g -t claude,codex --verbose` | same state, second sandbox | 0 | out+err |
| `apm-spike-833-step3-narrow.txt` | `apm install -t claude` | after step 2 project bare, `- delta` removed from `skills:` | 0 | out+err |
| `apm-spike-833-step3-narrow-global.txt` | `apm install -g -t claude,codex` | after step 2 global bare, `- delta` removed | 0 | out+err |
| `apm-spike-833-step4-bare.txt` | `apm install -t claude` | v1 `FOUR` install, `beta`/`gamma` copies overwritten with v2 content, ref edit | 0 | out+err |
| `apm-spike-833-step4c-same-ref.txt` | `apm install -t claude` | v1 `FOUR` install, `beta` copy overwritten, ref unchanged | 0 | out+err |
| `apm-spike-833-same-ref-clean-reinstall.txt` | `apm install -t claude` | v1 `FIVE` install, nothing touched | 0 | out+err |
| `apm-spike-833-step5-fail.txt` | `apm install -t claude` | v1 `FOUR` install, `.claude/skills/gamma` `chmod 555` and its `SKILL.md` `chmod 444`, ref edit | 1 | out+err |
| `apm-spike-833-step5-retry.txt` | `apm install -t claude` | same repo, permissions restored | 0 | out+err |
| `apm-spike-833-step6-outdated-project.txt` | `apm outdated` | after step 1 project (v1 pinned, v2 exists) | 0 | out |
| `apm-spike-833-step6-outdated-global.txt` | `apm outdated -g` | after step 1 global | 0 | out |
| `apm-spike-833-step6-outdated-project-v2.txt` | `apm outdated` | after step 3 (v2 pinned) | 0 | out |
| `apm-spike-833-step6-uninstall-project.txt` | `apm uninstall <ref>#v2.0.0` | after step 3 project | 0 | out+err |
| `apm-spike-833-step6-uninstall-global.txt` | `apm uninstall -g <ref>#v2.0.0` | after step 3 global, neutral cwd | 0 | out+err |

Lockfiles from the same run, copied verbatim:

| Fixture | Install |
|---|---|
| `apm.lock.spike-833-v1-global-two-tool.yaml` | step 1 global — five skills, `skill_subset`, `.agents/…` rows carry `target: codex` |
| `apm.lock.spike-833-v2-project.yaml` | step 2 project bare — four skills on disk while `skill_subset` still lists `epsilon` |
