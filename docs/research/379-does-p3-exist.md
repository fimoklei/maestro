# 379 — Does P3 exist? What apm does when a malformed skill reaches deploy

**Recommendation:** P3 leaves the map as a standalone job. apm 0.26.0 fails
loudly on exactly one thing — a ref or path that does not resolve — and installs
every content malformation silently with the success marker. But the gap that
matters is not the one #346 named: the worst outcome is a package that passes
apm's marker probe, deploys **nothing**, exits 0, prints
`Installed 1 APM dependency`, and writes `package_type: invalid` into the
lockfile — where Maestro's reader filters it out. That is one narrow check, not
a validator. Fold it into the import contract (#351) plus a two-line addition to
the lockfile reader.

**`apm audit --ci` catches none of the six malformations.** #346's conclusion
stands unchanged; #378 can close with no correction.

Measured against apm **0.26.0** (`apm --version` → `Agent Package Manager (APM)
CLI version 0.26.0`), captured **2026-07-28**. Every run used a throwaway `HOME`,
`GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` under the session scratchpad, no
token in the environment, `COLUMNS=200`. No `-g` command ran. No GitHub
repository was created, pushed to, or modified.

---

## Step 0 — the cheapest measurement path

`apm install` accepts a **local filesystem path**, so the whole measurement runs
offline with no remote repo. This is already in `docs/apm-behavior.md`
§ Reference grammar (`Local path | source: local, no version, invisible to
drift. Forbidden (ADR-0003)`); #346 used the same lever. Confirmed again here.

What does **not** work, and closes the door on measuring the real deploy grammar
offline (measured):

```
$ apm install "file:///…/harness/skills/name-mismatch#v1.0.0" -t claude
[x] … -- Invalid shorthand port. Expected an integer from 1 to 65535
All packages failed validation. Nothing to install.
### EXIT=1

$ apm install "git+file:///…/harness#v1.0.0" -t claude
[x] … -- Invalid shorthand port. Expected an integer from 1 to 65535
### EXIT=1
```

There is no local git source form. The tag-pinned GitHub path (ADR-0003's only
permitted grammar) is therefore **unmeasurable offline** — it is covered below by
source reading only, and the difference between the two paths turns out to
matter (§ The two validation paths are not the same).

---

## The harness

A producer-shaped tree (`apm.yml` + `skills/<name>/SKILL.md`) holding one clean
skill and seven malformations. Each case installed into its own fresh
`git init` consumer with a `.claude/` marker, one `apm install … -t claude` per
case.

Wrapper used for every apm invocation:

```sh
#!/bin/sh
SB=<scratchpad>/379
export HOME="$SB/home"
export COLUMNS=200
export GIT_CONFIG_GLOBAL="$SB/home/.gitconfig"
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_TERMINAL_PROMPT=0
unset GITHUB_TOKEN GITHUB_APM_PAT
exec /Users/michielmerks/.local/bin/apm "$@"
```

Per-case command, run with cwd = a fresh consumer repo:

```sh
apm install <scratchpad>/379/harness/skills/<case> -t claude
```

---

## MEASURED — what apm does at install

`marker` = `installed \d+ apm dependenc` after whitespace-normalising and
lowercasing, per `apm-driver.md`. `verdict` = what `ApmCliDriver` would report.

| Case | Exit | Success marker | Other output | Deployed | Maestro verdict |
|---|---|---|---|---|---|
| clean (control) | 0 | yes | `\|-- Skill integrated` | `SKILL.md` | success |
| `name` ≠ directory name | 0 | yes | none | `SKILL.md`, frontmatter verbatim | **success** |
| no frontmatter at all | 0 | yes | none | `SKILL.md`, verbatim | **success** |
| unparseable frontmatter | 0 | yes | one `Warning:` line (stdout) | `SKILL.md`, verbatim | **success** |
| `description` key absent | 0 | yes | none | `SKILL.md`, verbatim | **success** |
| 2007-line `SKILL.md` | 0 | yes | none | `SKILL.md`, all 2007 lines | **success** |
| dir exists, only `README.md` | 1 | **no** | `[x] … -- no apm.yml, SKILL.md, or plugin.json found` / `All packages failed validation. Nothing to install.` | nothing | failure |
| **`apm.yml` present, no `SKILL.md`** | 0 | **yes** | `\|-- (files unchanged)` | **nothing** | **success** |
| control: path does not exist | 1 | **no** | `[x] … -- path does not exist` / `All packages failed validation. Nothing to install.` | nothing | failure |

Classification was run mechanically over each capture, not read by eye:

```sh
norm=$(tr 'A-Z' 'a-z' < "$f" | tr -s ' \n\t' ' ')
grep -cE "installed [0-9]+ apm dependenc" ...
grep -cE "with [1-9][0-9]* error\(s\)|installation failed" ...
grep -c "is a symlink" ...
```

Result: `success_marker=1, failure_signal=0` for every content malformation.
`success_marker=0` only for the two that never got past the pre-flight probe.

### What lands on disk

apm copies `SKILL.md` byte-for-byte and never rewrites frontmatter. Verified per
case with `head -6` on the deployed file and `wc -l`:

- `name-mismatch` → deployed dir `name-mismatch`, frontmatter still
  `name: totally-different-name`, lockfile `name: name-mismatch`. apm takes
  identity from the **directory** and ignores the frontmatter `name` entirely.
- `broken-yaml` → the unparseable block is deployed verbatim.
- `no-frontmatter` → deployed with no frontmatter.
- `oversized` → all 2007 lines deployed, no output of any kind.

### The one loud content signal, and why it does not help

The broken-YAML case prints, **on stdout**:

```
Warning: Failed to parse SKILL.md: Failed to parse SKILL.md file
/…/apm_modules/_local/broken-yaml/SKILL.md: while parsing a flow sequence
  in "<unicode string>", line 3, column 14: …
```

It matches none of `apm-driver.md`'s signals, so it changes no verdict. It also
echoes an absolute path — never surface it raw (`security.md`).

### The worst case, measured

A directory holding `apm.yml` and `README.md` but no `SKILL.md` passes the marker
probe, integrates nothing, and reports success:

```
$ apm install <harness>/skills/manifest-no-skill -t claude
  [+] …/manifest-no-skill (local)
  |-- (files unchanged)
[*] Installed 1 APM dependency in 0.6s.
### EXIT=0
$ find .claude -mindepth 1
.claude/settings.json          # nothing deployed
```

Its lockfile:

```yaml
dependencies:
- repo_url: _local/manifest-no-skill
  name: manifest-no-skill
  version: 1.0.0
  package_type: invalid          # <- apm's only honest signal, and it is here
  source: local
deployments: []
```

`package_type: invalid` is the single machine-readable statement apm makes about
skill validity anywhere in 0.26.0. Maestro's reader
(`packages/core/src/lockfile/lockfile.ts:65`) drops any entry whose
`package_type !== "claude_skill"` — so today this deploy reports success and the
cockpit shows an empty repo. Success in the UI, nothing on disk, no error
anywhere.

---

## MEASURED — `apm audit`

Consumer with all five content-malformed skills installed.

```sh
apm audit                                    # project-wide
apm audit --ci
apm audit --ci --no-policy -f json
apm audit --ci --no-policy --no-fail-fast -f json
apm audit --file <harness>/skills/<case>/SKILL.md -f json
```

**Project-wide `apm audit`** — exit 0, `[+] No drift detected`,
`[*] 10 file(s) scanned -- no issues found`. All five pass.

**`apm audit --ci`** — ten checks. With `--no-fail-fast` the full list is:
`lockfile-exists`, `ref-consistency`, `deployment-ledger-owners`,
`deployed-files-present`, `no-orphaned-packages`, `skill-subset-consistency`,
`config-consistency`, `content-integrity`, `includes-consent`, `drift`.
Nine passed. The one failure, `config-consistency`, reads *"5 MCP config
inconsistenc(ies) — package manifest not found at …/apm.yml"*.

**Control run, clean skill only**, same command: `config-consistency` fails
identically with `1 MCP config inconsistenc(ies)`. So that failure is an
artefact of the local-path source form (a bare skill directory has no `apm.yml`),
**not** a malformation signal. `--ci` catches zero of the six malformations.

**`apm audit --file`** on each malformed source: `"passed": true`, exit 0 for all
five. Expected — coverage is hidden Unicode only (#346 E10), and these files are
pure ASCII.

### Correction to #378 — there is none

`--ci`'s drift check is an install-replay diff of **the lockfile against disk**.
It answers "is what is deployed what apm recorded", never "is what apm recorded a
valid skill". `content-integrity` is critical hidden Unicode plus a SHA-256
compare against the deployment ledger. Read from source
(`policy/ci_checks.py`, docstrings at lines 333 and 507). No structural check
exists among the ten. #378 opened a real unmeasured surface; the measurement
says it is not a gate. It can close.

---

## READ FROM SOURCE — the two validation paths are not the same

This is the finding that changes the picture, and it is source-only because the
GitHub path cannot be exercised offline.

**Local path** (`install/validation.py:145`, `_local_path_failure_reason`) — the
whole gate is three lines: exists, is-a-directory, and holds one of exactly
`apm.yml`, `SKILL.md`, `plugin.json`. That is why the README-only case exited 1.

**GitHub virtual subdirectory** — the ADR-0003 deploy grammar — is a different
function (`deps/github_downloader_validation.py:164-222`), and it is far more
permissive. It probes, in order:

```
<vpath>/apm.yml, <vpath>/SKILL.md, <vpath>/plugin.json,
<vpath>/.github/plugin/plugin.json, <vpath>/.claude-plugin/plugin.json,
<vpath>/.cursor-plugin/plugin.json, <vpath>/README.md
```

`README.md` is on that list. And if every marker misses, **fallback 1 is a bare
directory-exists probe via the Contents API** (`_directory_exists_at_ref`) — any
directory that resolves at the ref validates.

So the one loud content failure this measurement produced is an artefact of the
forbidden source form. **On the real deploy path, a subdirectory with no
`SKILL.md` at all passes pre-flight**, and then takes the
`manifest-no-skill` route measured above: nothing integrated, exit 0, success
marker, `package_type: invalid`. The loud failure the ticket calls the control
case (`Subdirectory '…' not found in repository`,
`deps/github_downloader.py:1427`) fires only when the path does not resolve at
all — a typo, not a malformation.

Other source facts behind the measurements:

- `primitives/parser.py:32-44` — when frontmatter `name` is missing, apm
  **derives it from the parent directory name**. The frontmatter `name` is read
  but never compared to anything and never written back.
- `primitives/discovery.py:496,515` — a `parse_skill_file` exception is caught
  and `print()`ed as `Warning: …`. The skill is dropped from the collection; the
  file copy is a separate step and proceeds regardless.
- `primitives/models.py:105-118` — `Skill.validate()` returns exactly the three
  errors Maestro would want (missing `name`, missing `description`, empty
  content). It is called from the dead-warning path #346 documented at E4: the
  errors are collected into `self.warnings` and never printed. The check exists
  and cannot fire.
- `integration/skill_integrator.py:104` — `validate_skill_name` implements the
  full agentskills.io slug rule and is called only to pick a directory name.

---

## INFERRED — flagged as inference, not measurement

- **A tag-pinned GitHub install of a content-malformed skill behaves like the
  local-path installs above.** The integrator (`skill_integrator.py`) is shared
  and neither path parses `SKILL.md` before copying, so this is strongly
  implied — but it is the same UNMEASURED item #346 recorded, and it stays
  unmeasured. Only the canary lane can settle it.
- **What a missing or unparseable `description` costs at runtime.** Claude Code
  selects a skill on its description; no description plausibly means the skill is
  never triggered. Not observed here — no client was loaded.
- **The 5000-token half of the budget.** Not measured; see
  `docs/research/356-skill-md-token-budget.md`.

---

## Verdict

**Does a malformed skill fail loudly, quietly, or deploy something broken?**
All three, split cleanly by kind:

- **Loud, legible, correctly classified** — only when the ref or path does not
  resolve. Exit 1, no success marker, an error naming the path.
  Maestro already surfaces this (#170 → #180). Nothing to add.
- **Quiet, and deploys something broken** — every content malformation. No
  frontmatter, unparseable frontmatter, missing description, wrong name, 2007
  lines: all deployed verbatim with the success marker.
- **Quiet, and deploys nothing while reporting success** — the marker-passing
  directory with no `SKILL.md`. This is the only case that is actually wrong
  rather than merely bad, and on the real deploy path it is *easier* to hit than
  the measurement suggests, because the remote marker probe accepts a bare
  `README.md` or any directory that exists.

**Does a pre-deploy validator in `core` still earn its place?**
Not as a validator. The failure-and-show-the-reason path already handles the only
loud case, and a validator that catches "2007 lines" or "name ≠ directory" buys a
tidier skill, not a working one. What earns its place is one check apm already
performs and Maestro already reads past: **`package_type` in the lockfile**.
apm says `invalid` and Maestro's reader silently drops the row. Reading that
field turns the worst silent failure into a legible one for the cost of an
`if`.

**Load-bearing versus lint.**

Load-bearing — getting it wrong produces a wrong or failed deploy:

| Rule | Why | Evidence |
|---|---|---|
| `SKILL.md` present at the subpath | deploys nothing, reports success | measured (`manifest-no-skill`); remote probe read from source |
| Frontmatter parses as YAML | deployed verbatim; client cannot read name or description | measured |
| Frontmatter present at all | same | measured |
| `description` present and non-empty | a skill with no description is never selected | measured that apm deploys it; the runtime cost is inferred |
| `name` is a valid slug | apm renames the directory and leaves the frontmatter — three names diverge | #346 E7 |

Lint — the skill is merely worse:

| Rule | Why it is only lint |
|---|---|
| `name` equals the directory name | apm takes identity from the directory and ignores the frontmatter `name` (measured: lockfile `name` = directory name in every case) |
| `SKILL.md` ≤ 500 lines / ≤ 5000 tokens | advisory in apm's own docs, enforced nowhere; a 2007-line skill deploys clean |
| `description` ≤ 1024 chars | no length check anywhere in 0.26.0 (#346 E6) |

Only the first table justifies a blocking gate, and it is five checks, not a spec
implementation.

**Recommendation.**

1. **P3 leaves the map as a standalone job.** "See whether apm accepts a skill"
   is answered: apm accepts almost everything, and the answer does not need a
   product surface of its own.
2. **The five load-bearing rules become a slice of the import contract (#351).**
   Import is the door where refusing costs nothing and the producer is present to
   fix it. A deploy-time blocking gate is the wrong place: by then the skill is
   someone else's, already tagged, and Maestro's job is to say what happened.
3. **Add the `package_type` read to the deploy result path now, in whatever
   branch touches it next.** `package_type: invalid` with `deployments: []` is a
   failed deploy wearing a success marker. This is small, measured, and closes
   the only genuinely wrong outcome found.
4. **#375 (which spec version `core` pins against) shrinks with it.** Pinning a
   full spec version is moot when `core` enforces five rules; cite the rule
   source per rule instead.
5. **#378 closes.** `apm audit --ci` is a lockfile-consistency gate, not a
   correctness one.

---

## Could NOT measure, and why

- **The tag-pinned GitHub install path** — ADR-0003's only permitted grammar.
  `file://` and `git+file://` are both rejected (`Invalid shorthand port`), so no
  local git source form exists. Measuring it needs a remote repo carrying
  deliberately malformed skills under tags. **Not run, by decision.** The first
  pass was barred from creating a repository. A second attempt was then made on a
  relayed instruction and the permission system denied it — nothing was created,
  locally or remotely (verified: `gh repo view
  fimoklei/apm-malformed-skill-fixtures` → `Could not resolve to a Repository`).
  Michiel was then asked directly, 2026-07-28, and chose to bank this document
  with the gap marked rather than spend a throwaway repo on closing it.

  **It is the heaviest unmeasured claim in this document** — the § "The two
  validation paths are not the same" finding is read from source, and this map
  has had to correct docs-read claims before (#346, #356). Treat it as unproven
  until run.

  What it would take, for whoever runs it with direct authorisation from
  Michiel: one private throwaway repo under `fimoklei` holding root
  `skills/<case>/SKILL.md` for the nine cases above plus two that cannot exist
  locally — a subdirectory with only `README.md`, and one with no marker file at
  all (e.g. `notes.txt`) to exercise the `_directory_exists_at_ref` fallback —
  then one annotated tag, then the same per-case install against
  `github.com/fimoklei/<repo>/skills/<case>#v1.0.0 -t claude`, plus the
  does-not-exist-at-the-tag control. Sandbox `HOME` throughout, but let git
  reach real credentials (a private clone needs them); record which route was
  used. Delete the repo afterwards.
- **What Claude Code does at load time** with each malformation. Needs a real
  client, not apm.
- **Token counts** for the oversized case. Sized in lines only; no tokenizer run.
- **`apm audit --policy`** — needs an org policy repo (`.github`, `.apm` or
  `_apm`) reachable from a git remote. Skipped for the same reason as above; all
  `--ci` runs used `--no-policy` or ran with no remote configured.
- **`apm audit --strip` / `--dry-run` on a source file.** Still unexercised, as
  in #346.
- **Hooks and MCP primitives.** Still unobserved
  (`docs/apm-behavior.md` → "Unobserved").

---

## For `docs/apm-behavior.md`

New 0.26.0 observations, for whoever holds the pen on that file. Not the record.

**Addition to Deploy — `apm install`:**

- **The pre-flight gate differs between local paths and GitHub virtual
  subdirectories, and the remote one is weaker.** Local
  (`install/validation.py:145`): exists, is-a-directory, holds one of `apm.yml` /
  `SKILL.md` / `plugin.json` — otherwise exit 1,
  `no apm.yml, SKILL.md, or plugin.json found`, `All packages failed validation.
  Nothing to install.`, and apm removes the `apm.yml` it just created. Remote
  (`deps/github_downloader_validation.py:164`): probes seven markers **including
  `README.md`**, then falls back to a bare directory-exists probe via the
  Contents API. A GitHub subdirectory with no `SKILL.md` passes pre-flight
  (source).
- **A package that passes the marker probe but holds no `SKILL.md` deploys
  nothing and still prints the success marker.** Output is
  `|-- (files unchanged)` instead of `|-- Skill integrated`, exit 0,
  `Installed 1 APM dependency`. The lockfile records
  `package_type: invalid` and `deployments: []`. `package_type` is the only
  machine-readable validity statement apm makes about a skill in 0.26.0.
- **Every content malformation installs silently with the success marker**
  (measured 2026-07-28 via local-path installs): no frontmatter, unparseable
  frontmatter, absent `description`, frontmatter `name` ≠ directory name, and a
  2007-line body. `SKILL.md` is copied byte-for-byte; frontmatter is never
  rewritten.
- **Unparseable frontmatter prints one `Warning: Failed to parse SKILL.md: …`
  line on stdout and installs anyway.** It matches no signal phrase and changes
  no verdict; it echoes an absolute path, so it must never be surfaced raw
  (`security.md`). Source: `primitives/discovery.py:496` catches the
  `parse_skill_file` exception and `print()`s it.
- **A missing frontmatter `name` is filled from the parent directory name**
  (`primitives/parser.py:38`). apm never compares the frontmatter `name` to the
  directory; the lockfile `name` is always the directory name.

**Addition to Audit — `apm audit`:**

- **`apm audit --ci` runs ten checks, none structural.** `lockfile-exists`,
  `ref-consistency`, `deployment-ledger-owners`, `deployed-files-present`,
  `no-orphaned-packages`, `skill-subset-consistency`, `config-consistency`,
  `content-integrity`, `includes-consent`, `drift`. `content-integrity` is
  critical hidden Unicode plus a SHA-256 compare against the deployment ledger;
  `drift` is a cache-only install replay diffed against the working tree. Five
  structurally malformed skills pass all ten (measured).
- **`--ci` fails fast by default** — it stops at the first failing check, so the
  reported check count varies. `--no-fail-fast` is needed to see all ten.
- **`config-consistency` fails for every local-path dependency**, clean or not,
  because a bare skill directory has no `apm.yml`
  (`package manifest not found at …/apm.yml; re-run 'apm install' to restore it`).
  Not a malformation signal; verified against a clean-skill control.
- **`--ci` emits a JSON envelope with `-f json`**, shaped
  `{ passed, checks[{name, passed, message, details[]}], summary{total, passed,
  failed}, drift{drift[]} }` — a different envelope from `--file`'s.
