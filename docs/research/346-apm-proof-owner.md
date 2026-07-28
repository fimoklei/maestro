# 346 — Who checks "APM-proof": apm, or `core`?

**Recommendation:** `core` owns every structural skill rule, because apm 0.26.0
has no per-skill validation surface at all — `apm compile --validate` cannot
even see a `skills/<name>/SKILL.md`, and the one apm check worth delegating is
the hidden-Unicode scan behind `apm audit --file <path> -f json`.

Measured against apm 0.26.0 (`apm --version` → `Agent Package Manager (APM) CLI
version 0.26.0`), the version `docs/apm-behavior.md` describes. Every apm run
below used a throwaway `HOME` under the session scratchpad.

## The proposed split

| Rule | Who checks it | Evidence |
|---|---|---|
| `name` present and non-empty | **core** | apm has the check (`Skill.validate`, `primitives/models.py:113`) but files it as a warning that is never printed and never returned — E3, E4 |
| `name` equals the parent directory name | **core** | apm never compares them. It takes identity from the directory and leaves the frontmatter untouched — E7, E8 |
| `name` is a 1–64 char lowercase-alphanumeric-plus-hyphen slug, no leading/trailing/consecutive hyphen | **core** | apm ships exactly this rule (`validate_skill_name`, `integration/skill_integrator.py:104`) but calls it only to *rename* on failure, never to refuse — E7 |
| `description` present and non-empty | **core** | same dead-warning path as `name` — E4 |
| `description` ≤ 1024 chars | **core** | no length check exists anywhere in apm 0.26.0; a 2250-char description installs silently — E6, E8 |
| `SKILL.md` body non-empty | **core** | dead-warning path; an empty-body skill deploys — E4, E7 |
| `SKILL.md` ≤ 500 lines / ≤ 5000 tokens | **core** | apm has no line or token budget in any form; a 1207-line SKILL.md installs with no output — E6, E8, E9 |
| Relative markdown links resolve | **core** | apm's `validate_link_targets` runs only over discovered primitives, and a `skills/<name>/SKILL.md` is never discovered — E2, E4 |
| Hidden / invisible Unicode (tag chars, bidi overrides, zero-width, variation selectors) | **apm** | `apm audit --file <path> -f json` — per-file, per-line, per-column, machine-readable, works on an un-deployed source file with no `apm.yml` present — E10, E11, E12 |
| Deployed copy matches what apm recorded (install-replay drift) | **apm** (consumer side, already ADR-0001 territory) | project-wide `apm audit` in a consumer runs a cache-only install replay — E13 |

Two derived rules for the driver port, both measured below:

- **One `apm audit` process per file.** `--file` is not repeatable; a second
  `--file` silently discards the first (E12).
- **For `audit`, the in-band signal is the JSON envelope, not the exit code.**
  Exit 2 means "warnings found" *and* "usage error"; exit 1 means "critical
  findings" *and* "file not found". Only the `-f json` envelope
  (`passed`, `exit_code`, `summary`) separates them, and it is absent on both
  error paths — so absent JSON is failure, fail-closed (E10, E11, E14).

## Evidence

Harness: a producer-shaped tree (`apm.yml` + `skills/<name>/SKILL.md`) holding
one clean skill and five deliberately-broken ones — `name` ≠ directory name, a
2250-char description, a 1207-line body, an invalid `Bad_Name` directory with
empty description and empty body, and one carrying invisible Unicode. All apm
runs went through a wrapper that exported a sandbox `HOME`, `COLUMNS=200`, and a
sandboxed `GIT_CONFIG_GLOBAL`.

### E1 — `apm compile --validate` refuses to run on a skills-only harness

```
$ apm compile --validate          # cwd = harness with apm.yml + skills/ only
[x] No APM content found to compile
[i]  To get started:
[i]    1. Install APM dependencies: apm install <owner>/<repo>
[i]    2. Or create local instructions: mkdir -p .apm/instructions
[i]    3. Then create .instructions.md or .agent.md files
### EXIT=1
```

The gate is `_validate_project` (`commands/compile/cli.py:459-517`): it requires
`apm.yml` *and* one of `apm_modules/`, a `.apm/**/*.instructions.md`, a
`.apm/**/*.agent.md`, or `memory/constitution.md`. A `skills/` tree satisfies
none of them.

### E2 — with the gate satisfied, five broken skills are invisible

Adding one throwaway `.apm/instructions/dummy.instructions.md` lets validation
run. The five broken skills are not mentioned:

```
$ apm compile --validate
[*] Validating APM context...
[*] All primitives validated successfully!
[i] Validated 1 primitives:
[i]   * 0 chatmodes
[i]   * 1 instructions
[i]   * 0 contexts
### EXIT=0
```

Source reason: `discover_primitives` finds a skill only via
`_discover_local_skill`, which reads exactly `<base_dir>/SKILL.md`
(`primitives/discovery.py:487`). There is no glob for `skills/*/SKILL.md`.

### E3 — even a root `SKILL.md` with empty description and empty body passes

```
$ cat SKILL.md
---
name: Root_Bad!!
description:
---
$ apm compile --validate
[*] Validating APM context...
[*] All primitives validated successfully!
[i] Validated 2 primitives:
[i]   * 0 chatmodes
[i]   * 1 instructions
[i]   * 0 contexts
### EXIT=0
```

Note the arithmetic: `Validated 2 primitives` against `0 + 1 + 0`. Skills are
counted by `primitives.count()` but the breakdown has no skills line — so even
the count cannot tell you a skill was looked at.

### E4 — the validator is structurally incapable of failing

`AgentsCompiler.validate_primitives` (`compilation/agents_compiler.py:1236`)
opens `errors = []`, appends every primitive error and every link error to
`self.warnings` instead, and returns `errors` — always empty. `_run_validation_mode`
(`commands/compile/cli.py:520`) fails only `if validation_errors:` and never
prints `compiler.warnings`. `-v` adds perf counters, not warnings (measured).

A file that fails to parse also passes:

```
$ apm compile --validate           # .apm/instructions/broken-yaml.instructions.md has invalid YAML
[*] Validating APM context...
Warning: Failed to parse /…/broken-yaml.instructions.md: … expected ',' or ']', but got ':'
[*] All primitives validated successfully!
[i] Validated 2 primitives:
### EXIT=0
```

So for `compile --validate` the marker `All primitives validated successfully!`
is not a validity signal — it fires over an unparseable file. The only exit-1
paths are: no `apm.yml`, no APM content, or `discover_primitives` raising.
(The bare `Warning:` line comes from `print()` and echoes an absolute path —
never surface it raw, per `security.md`.)

### E5 — `--validate` writes nothing in the project, but touches `HOME`

Tree hashed before and after (`sha256` per file, plus directory entries):

```
=== harness diff after compile --validate ===
ADDED: (none)      REMOVED: (none)      CHANGED: (none)
=== sandbox HOME diff ===
ADDED: ['.apm/', '.apm/config.json']    # {"default_client": "vscode"}
```

`compile --dry-run` also writes nothing. **Plain `apm compile` is not safe on a
producer harness** — it overwrites hand-authored root context files:

```
$ apm compile --target claude      # CLAUDE.md held hand-authored content
CHANGED: ['CLAUDE.md']
$ head -3 CLAUDE.md
# CLAUDE.md
<!-- Generated by APM CLI -->
<!-- Build ID: c391be740e63 -->
```

Same for `AGENTS.md` under `--target codex`; `--target claude,codex` creates or
rewrites both. Only `--validate` and `--dry-run` are safe to run in a harness.

### E6 — no budget constants exist in apm 0.26.0

```
$ grep -rn "5000" <site-packages>/apm_cli --include=*.py      # no matches
$ grep -rni "token_budget|token budget|max_tokens|line_count|max_lines" …    # no matches
$ grep -rn "1024" …    # only byte-size caps (log/JSON/archive limits), no description length
```

The 5000-token / 500-line SKILL.md budget is **advisory only** as far as apm is
concerned: unenforced, unmentioned, unmeasured.

### E7 — apm renames rather than refuses, and never touches the frontmatter

Installing the invalid-named skill into a sandbox consumer:

```
$ apm install ../harness/skills/Bad_Name -t claude
  [+] ../harness/skills/Bad_Name (local)
  |-- Skill integrated -> .claude/skills/
  [!] [Bad_Name] Skill name 'Bad_Name' normalized to 'bad-name' (Skill name must be lowercase (no uppercase letters))
[*] Installed 1 APM dependency in 0.1s.
### EXIT=0
```

Three different names end up in three places:

- deployed directory: `.claude/skills/bad-name/`
- deployed `SKILL.md` frontmatter: `name: Bad_Name!!` — **verbatim, unrewritten**
- lockfile `name:` field: `Bad_Name` — the raw folder name

Its `description:` is empty and its body is empty; apm deployed it and exited 0
with the success marker. `validate_skill_name` is called only to pick between
the raw and the normalised *directory* name
(`integration/skill_integrator.py:348, 1010, 1880`) — it never gates.

(Local-path installs are forbidden in production by ADR-0003; used here only
because they exercise the integrator offline.)

### E8 — the three remaining rules produce no apm output at all

```
$ apm install ../harness/skills/oversized ../harness/skills/long-description ../harness/skills/name-mismatch -t claude
  [+] ../harness/skills/long-description (local)   |-- Skill integrated -> .claude/skills/
  [+] ../harness/skills/name-mismatch (local)      |-- Skill integrated -> .claude/skills/
  [+] ../harness/skills/oversized (local)          |-- Skill integrated -> .claude/skills/
### EXIT=0
```

Deployed state afterwards:

```
$ wc -l .claude/skills/oversized/SKILL.md              →  1207
$ head -2 .claude/skills/name-mismatch/SKILL.md        →  name: totally-different-name
$ (description length, long-description)               →  2250 chars
```

Not one warning. Over-long body, over-long description, and `name` ≠ directory
name all pass apm end to end.

### E9 — a consumer's installed skills are outside `--validate`'s scope too

```
$ apm compile --validate      # cwd = consumer with the three broken skills installed
[*] All primitives validated successfully!
[i] Validated 0 primitives:
### EXIT=0
```

`--validate` calls `discover_primitives`, not
`discover_primitives_with_dependencies`, so `apm_modules/` is never walked.

### E10 — `apm audit --file` is the one genuinely useful surface

On a source `SKILL.md` carrying Unicode tag characters spelling a hidden
instruction, an RLO override, a zero-width space and a non-breaking space:

```
$ apm audit --file skills/hidden-unicode/SKILL.md
  Severity   File                             Location   Codepoint   Description
  CRITICAL   skills/hidden-unicode/SKILL.md   8:14       U+E0069     Unicode tag character (invisible ASCII mapping)
  … 15 more tag characters …
  CRITICAL   skills/hidden-unicode/SKILL.md   10:31      U+202E      Right-to-left override (RLO)
  WARNING    skills/hidden-unicode/SKILL.md   10:5       U+200B      Zero-width space
[x] 17 critical finding(s) in 1 file(s) -- hidden characters detected
### EXIT=1
```

`-f json` gives a versioned envelope — no Rich parsing, no `COLUMNS`, no
whitespace-normalising:

```json
{ "version": "1", "passed": false, "exit_code": 1,
  "summary": { "files_scanned": 1, "files_affected": 1, "critical": 17, "warning": 1, "info": 1 },
  "findings": [ { "severity": "critical", "file": "skills/hidden-unicode/SKILL.md",
                  "line": 8, "column": 14, "codepoint": "U+E0069",
                  "category": "tag-character", "description": "Unicode tag character (invisible ASCII mapping)" }, … ] }
```

Coverage is exactly `ContentScanner` (`security/content_scanner.py`) and nothing
else: Unicode tag characters, bidi overrides and isolates, SMP variation
selectors (Glassworm vector) as **critical**; zero-width chars, BMP variation
selectors, soft hyphen, bidi marks, invisible math operators, interlinear
annotation markers, deprecated formatting and a mid-file BOM as **warning**;
unusual whitespace and the emoji presentation selector as **info**. No
structural checks whatsoever. A pure-ASCII file short-circuits to zero findings
(`content_scanner.py:165`).

It also runs with no `apm.yml` anywhere — measured from a bare directory outside
any APM project, same JSON, exit 1. And it writes nothing.

### E11 — audit exit codes are ambiguous in both directions

| Input | Exit | JSON emitted? |
|---|---|---|
| critical findings | 1 | yes (`passed: false`, `exit_code: 1`) |
| warning findings only | **2** | yes (`passed: false`, `exit_code: 2`) |
| info findings only | 0 | yes (`passed: true`) |
| clean | 0 | yes (`passed: true`, `findings: []`) |
| `--file` path missing | 1 | **no** — `[x] File not found: …` |
| unknown flag | **2** | **no** — click usage error |

Exit 2 collides with click's usage-error code, and exit 1 collides with
file-not-found. Hence the rule above: read the JSON envelope, and treat absent
JSON as failure.

### E12 — `--file` is not repeatable, and drops the earlier file silently

```
$ apm audit --file skills/warn-only/SKILL.md --file skills/hidden-unicode/SKILL.md -f json
  "summary": { "files_scanned": 1, … }        # only hidden-unicode; warn-only silently gone
```

One process per file, or findings vanish with no error.

### E13 — project-wide `apm audit` is consumer-only

```
$ apm audit                       # cwd = producer harness, no apm.lock.yaml
[i] No apm.lock.yaml found -- nothing to scan. Use --file to scan a specific file.
### EXIT=0

$ apm audit -f json               # cwd = consumer with the 3 broken skills installed
[>] Replaying install (cache-only)...
[+] Replayed 3 package(s)
[>] Diffing scratch vs working tree...
[+] No drift detected
{ "version": "1", "passed": true, "exit_code": 0,
  "summary": { "files_scanned": 6, "files_affected": 0, "critical": 0, "warning": 0, "info": 0 } }
```

So the project-wide audit = install-replay drift + hidden-Unicode over deployed
files. It passes structurally broken skills, and in a producer harness it does
nothing at all.

### E14 — `apm pack` has no skill validation either

```
$ grep -n "validate|SKILL" <site-packages>/apm_cli/commands/pack.py
89:    from ..utils.path_security import validate_path_segments
107:        # Security: validate path to prevent traversal attacks
109:            validate_path_segments(path_val, context="--marketplace-path", …)
```

Path-traversal defence only. There is no publish-time gate to delegate to.

## UNMEASURED

- **Whether a *tag-pinned GitHub* install behaves like the local-path installs
  in E7/E8.** Those installs used local paths (offline, no auth). The
  integrator code path is shared (`skill_integrator.py`), but "same warning
  surface over a git virtual package" is inference, not measurement — it needs
  the canary lane with network + auth.
- **What Claude Code itself does with the E7 skill** (directory `bad-name`,
  frontmatter `name: Bad_Name!!`, empty description, empty body). The claim
  "unusable primitive" is reasoning from the agentskills.io rule apm's own
  docstring cites, not an observed loader failure. Measuring it means loading
  the skill in a real client.
- **The exact token count of a 500-line SKILL.md.** No tokenizer was run; the
  oversized fixture was sized in lines (1207) only. Whatever core enforces for
  "5000 tokens" needs its own decision about which tokenizer counts.
- **`apm audit --strip` / `--dry-run` on a source file.** Not exercised; only
  the read-only scan was measured.
- **`apm audit --ci` and `--policy`.** Not exercised. `--ci` is documented as
  lockfile-consistency for CI gates, so it is consumer-side by definition, but
  that is read from `--help` text, not measured.
- **Hooks and MCP primitives.** Out of scope here, and still unobserved per
  `docs/apm-behavior.md` → "Unobserved".

## The ADR-0001 tension, stated plainly

ADR-0001 forbids reimplementing **retrieval, install, sync, pinning, the
lockfile, and multi-tool targeting**. Author-time primitive validation is not on
that list, and the measurements show why: apm does not offer it. There is no
per-skill validation command to drive. `apm compile --validate` cannot see a
`skills/<name>/SKILL.md` at all (E2), and even for the primitives it *does* see
it is incapable of failing (E4). Choosing "delegate to apm" would mean choosing
no checking.

The tension is narrower than "are we reimplementing apm", and it is real:

**apm already contains the rule we would write.** `validate_skill_name`
(`integration/skill_integrator.py:104`) implements 1–64 chars, lowercase
alphanumeric plus hyphens, no consecutive hyphens, no leading or trailing
hyphen — the exact rule. It is Python, it is not exported as a command, and it
is called only to pick a directory name (E7). Putting that rule in `core`
duplicates apm *code* while adding zero apm *engine* surface. `core` already
carries a narrower version of it (`packages/core/src/deploy/package-ref.ts` →
`isValidSkillSlug`), justified there as a security gate.

Three things keep that on the right side of the line:

1. **It duplicates a rule, not an engine.** The rule's real owner is the
   agentskills.io spec and the consuming client, not apm. apm is one more
   implementor of it, and a lenient one.
2. **apm's leniency makes the check more necessary, not less.** apm's response
   to a bad name is to rename the directory and leave the frontmatter alone,
   producing a deployed skill that apm calls installed and the spec calls
   invalid (E7). A cockpit whose job is "see and steer" has to surface that;
   only apm's silence is available otherwise.
3. **The delegation that does exist is taken.** Hidden Unicode goes to
   `apm audit --file … -f json` (E10). That is the honest boundary: apm owns
   content safety, `core` owns structural shape.

What this costs, and should be named rather than hidden: `core` acquires an
independent copy of a spec that lives outside this repo. When agentskills.io or
apm moves the limits, Maestro drifts silently — the same coupling ADR-0001
accepted for behaviour ("APM changes can affect the cockpit"), now extended to a
rule set. The mitigation is the one already in place for apm behaviour: pin the
rules to a version in one owned module, cite the source, and re-verify on
upgrade via `docs/agents/apm-upgrade.md`.

## For `docs/apm-behavior.md`

New 0.26.0 observations, for whoever holds the pen on that file. Do not treat
this section as the record.

**New section — Validate — `apm compile --validate`:**

- Requires `apm.yml` **and** content: `apm_modules/`, a
  `.apm/**/*.instructions.md`, a `.apm/**/*.agent.md`, or
  `memory/constitution.md`. A `skills/`-only producer harness exits 1 with
  `No APM content found to compile`.
- Discovers a skill only at `<root>/SKILL.md` (`primitives/discovery.py:487`) —
  never `skills/<name>/SKILL.md`, and never `apm_modules/` (it calls
  `discover_primitives`, not the with-dependencies variant).
- **Cannot fail on a content defect.** `validate_primitives`
  (`compilation/agents_compiler.py:1236`) routes every primitive error and link
  error into `self.warnings` and returns an always-empty error list;
  `_run_validation_mode` never prints those warnings, with or without `-v`.
  `All primitives validated successfully!` therefore fires over a file that
  failed to parse — it is not a validity marker. Exit 1 only for: no `apm.yml`,
  no APM content, or a discovery exception.
- Checks nothing about a skill's name charset, name-vs-directory agreement,
  description length, line count, or token count. No such constants exist in
  0.26.0 (`grep` for `5000`, token budget, max lines: no matches).
- The `Validated N primitives` count includes skills, but the itemised
  breakdown lists only chatmodes/instructions/contexts — an off-by-skills
  mismatch is normal output.
- Writes nothing in the project tree. Creates `~/.apm/config.json`
  (`{"default_client": "vscode"}`) in `HOME` if absent.
- **Plain `apm compile` overwrites hand-authored root context files.**
  `--target codex` rewrites `AGENTS.md`; `--target claude` rewrites
  `CLAUDE.md`; both replace existing content with a
  `<!-- Generated by APM CLI -->` build. Only `--validate` and `--dry-run` are
  safe in a repo whose `AGENTS.md`/`CLAUDE.md` are owned.

**New section — Audit — `apm audit`:**

- `apm audit --file <path>` scans one arbitrary file, needs no `apm.yml`, works
  outside any APM project, and writes nothing.
- Coverage is exactly `ContentScanner` (`security/content_scanner.py`): hidden
  and invisible Unicode. Critical — Unicode tag characters, bidi
  overrides/isolates, SMP variation selectors. Warning — zero-width characters,
  BMP variation selectors, soft hyphen, bidi marks, invisible math operators,
  interlinear annotation markers, deprecated formatting, mid-file BOM. Info —
  unusual whitespace, emoji presentation selector, leading BOM. No structural
  checks. Pure-ASCII files short-circuit to zero findings.
- **`apm audit` has `-f json` — unlike `outdated` and `view`.** A versioned
  envelope: `version`, `passed`, `exit_code`, `summary`
  (`files_scanned`/`files_affected`/`critical`/`warning`/`info`), `findings[]`
  with `severity`/`file`/`line`/`column`/`codepoint`/`category`/`description`.
  `sarif` and `markdown` are also offered.
- **Exit codes are ambiguous; the JSON envelope is the signal.** critical → 1;
  warning-only → **2**; info-only → 0; clean → 0; missing `--file` path → 1 with
  **no JSON**; unknown flag → 2 with **no JSON**. Exit 2 collides with click's
  usage error and exit 1 with file-not-found, so read `passed` from the
  envelope and treat absent JSON as failure, fail-closed.
- **`--file` is not repeatable.** Two `--file` flags scan only the last;
  `files_scanned` reads 1 and the dropped file is reported nowhere. One process
  per file.
- Project-wide `apm audit` (no `--file`) needs `apm.lock.yaml`: in a producer
  harness it prints `No apm.lock.yaml found -- nothing to scan`, exit 0. In a
  consumer it runs a cache-only install replay plus the Unicode scan over
  deployed files, and passes structurally broken skills.

**Addition to Deploy — `apm install`:**

- **apm normalizes an invalid skill name instead of refusing it.**
  `validate_skill_name` (`integration/skill_integrator.py:104` — 1–64 chars,
  lowercase alphanumeric + hyphens, no consecutive/leading/trailing hyphen) is
  applied to the *source directory name*; on failure apm renames the deployed
  directory and prints `[!] [<raw>] Skill name '<raw>' normalized to '<slug>'
  (<reason>)`, then exits 0 with the success marker. The deployed `SKILL.md`
  frontmatter is copied verbatim — never rewritten — so directory, frontmatter
  `name`, and lockfile `name` can all differ (measured: `bad-name` /
  `Bad_Name!!` / `Bad_Name`).
- An over-long description (2250 chars), an over-long body (1207 lines), and a
  frontmatter `name` that disagrees with the directory produce **no output at
  all** and install cleanly. (Measured with local-path installs; the
  tag-pinned-git equivalent is UNMEASURED.)
- `apm pack` validates only path segments — no skill-shape gate to delegate to.
