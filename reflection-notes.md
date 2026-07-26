# Reflection notes — Claude Code setup audit

**Date:** 2026-07-25
**Corpus:** `~/.claude/projects/` — 345 top-level sessions, 674 transcript files, 280 MB.
Date range 2026-05-23 → 2026-07-25; 317 of 345 sessions fall in July (20 active days, 15.8 sessions/day).
Repos covered: `maestro` (249 sessions), `agent-harness`, `pm-operating-system`, `chief-os`, `life-os`, `knowledge-pipeline`, `dex`.

**Method:** six parallel sub-agents mined the transcripts along separate axes (rework, commit/ship pipeline, worktree lifecycle, verification loop, interruptions, repeated context). Aggregate counts computed directly over the JSONL. Every load-bearing claim below was re-verified against the live filesystem before being written down; the verification command is named in each entry.

**Status.** The diagnosis is unchanged from 2026-07-25. All of Tier 1 plus one
adjacent hook fix shipped on 2026-07-26 — see "Implementation log". Tier 0 (#16)
is still open; Tier 2 and below are untouched.

> Placement note: this file sits in the `maestro` repo root because that was the working directory, but the audit spans seven repos and the global `~/.claude` setup. It does not belong to the repo shape described in `AGENTS.md`. Move it or ignore it.

---

## Baseline corrections

Three numbers in circulation were wrong. They are corrected here so the record is right.

| Claim | Actual | Why it was wrong |
|---|---|---|
| 24 of 43 skills never used | **10 of 43** (9, discounting `agent-browser`, which is used via the shell) | Slash-command invocations do not appear as `Skill` tool calls in the transcript |
| The `worktree` skill was used once | **45 times** | Same cause |
| ~180 rubber-stamp "ja" replies answered `AskUserQuestion` | **185 rubber-stamps, none of them followed `AskUserQuestion`** | All answered a question Claude asked in plain prose |

---

## The finding underneath every other finding

Rules that are mechanically gated get followed. Rules written as prose get re-litigated, session after session.

| Rule | How it is enforced | Compliance |
|---|---|---|
| TDD is blocking | `/implement` skill + commit gate | **91%** (67 of 74 source-editing sessions) |
| Token/styling facts | promoted into `.claude/rules/design.md` | **100%** — 0 re-derivations, 14 clean citations |
| Cross-worktree port squat | promoted into the `verify-in-smoke` skill | **100%** after promotion; 2 same-day re-derivations before |
| Commit via `/workflow-commit` | partly gated | 89 of 115 — **26 bypasses** |
| Browser check before "done" | prose only | **28–42% skipped** |
| "Run graphify first" | a hook that nags, no gate | **38%** |
| Read `LEARNINGS.md` at session start | prose only | **3%** (7 of 213 sessions) |

The escalation in your own remedies is the proof: memory note → rules file → hard rule in `AGENTS.md` → hook injecting the rule on every message. You keep climbing that ladder because the lower rungs do not hold. The two rules that stopped leaking (Dutch chat, plain language) are the two that got a hook.

You asked this yourself on 2026-07-17, `agent-harness/04b77ff7`:

> "hoe kunnen we afdwingen dat je dit altijd doet, check mijn globale rules"

That question is still the right one, and it is unanswered.

**Consequence for this whole document:** almost none of the candidates below want a new skill. You have 43 skills and 10 dead ones. The supply of instruction is not the constraint. Enforcement is.

---

# Implementation log

## 2026-07-26 — all of Tier 1, plus one adjacent hook fix

| # | Change | Where | Verified by |
|---|---|---|---|
| 1 | Lint lane scopes to the commit's own files, sharing one `changed_files()` helper with the test lane | `~/.claude/hooks/verification-runner.sh` | A messy file *outside* the commit passes; the same file staged fails |
| 2 | Every vitest invocation added to `[hooks] exclude_commands` | `~/Library/Application Support/rtk/config.toml` | Five invocation styles fed to `rtk hook claude` — all pass through unrewritten, while `git status` still rewrites |
| 4a | `agent-browser` symlink un-ignored and tracked; its target is relative, so it survives any checkout | `maestro/.gitignore`, `maestro/.claude/skills/agent-browser` | Throwaway worktree: link present, `SKILL.md` readable |
| 5a/5b | Per-edit format and typecheck hooks removed | `maestro/.claude/settings.json` | Global wiring re-read: format already runs on `Edit\|Write\|MultiEdit`, typecheck on `Stop`/`SubagentStop` |
| 7 | `cd` forbidden after `EnterWorktree`; `-C` or a subshell required | `~/.claude/rules/workflow.md` | The `worktree` skill already used `-C` and a subshell throughout — the global rule was the only contradiction |
| 11a | `format` switched to `biome check --write .` | `maestro/package.json` | Probe with reversed imports gets sorted; `pnpm lint` clean over 321 files, so no surprise repo-wide diff |
| 13 | Stale `review` fork deleted | `~/.claude/skills/review`, `~/.agents/skills/review` | Catalogue now carries one `code-review`; copy kept in `~/.claude/hooks/.backup-20260726/` |
| — | Main-branch hook reads a branch created in the same command | `~/.claude/hooks/protect-main-branch.sh` | Seven commands probed against a scratch repo on `main`: `checkout -b` / `switch -c` / `checkout -B` allowed; bare `git commit`, `checkout -b main`, and `push --force` still blocked |

Repo changes are two commits on `chore/tier1-setup-fixes` (`1672714`, `3ce6ce1`), not pushed. The second also rewrites the `tooling/rtk-masks-vitest` entry in `LEARNINGS.md`, which had become a warning about a hazard that no longer fires here.

## Two claims in this document were wrong

- **"Lift the line-39 parsing into the default block" does not fix the `git checkout -b` block.** Line 39 parses paths out of `git add`. The block comes from the hook reading the session's branch before the checkout has run. Implemented instead: parse branch creation out of the command and treat that as the effective branch. Still deliberately blocked — `git checkout <existing-branch> && git commit`, because `git checkout <file>` has the same shape and allowing it would let a commit land on `main`. Zero occurrences in the corpus.
- **`grill-me`, `grill-with-docs` and `grilling` are not three overlapping entries.** The first two are two-line files carrying `disable-model-invocation: true` that delegate to `grilling` — user-typed aliases, not duplicates. Merging them removes working entrypoints and saves nothing. Not done.

## Still open

- **Tier 0 (#16) — unresolved, and now more urgent.** Three of the files changed above (`verification-runner.sh`, `protect-main-branch.sh`, the rtk config) still sit in no repository. The backup at `~/.claude/hooks/.backup-20260726/` is one more unversioned directory on one laptop: the disease, not the cure.
- Tier 2 and below: untouched.

---

# Ranked candidates

Ranked by leverage — recurrence × cost per instance, divided by build cost.

---

## 1. The commit gate lints the whole repo but tests only the commit — **FIX · DONE 2026-07-26**

**Recurrence:** 15 blocks, 12 distinct sessions, 2026-07-16 → 2026-07-23.
**Cost:** 14 of 15 blocks were triggered by a file that was not in the commit. 4–9 recovery tool calls each, plus 4 `AskUserQuestion` human interrupts. One block cascaded into a false "cannot commit to main" (see #7).

**Verified:** `~/.claude/hooks/verification-runner.sh` line 99 runs `biome lint .` — the whole repo. Lines 105–141 run `vitest related --run` against `git diff --cached --name-only` — only the staged set. Same script, same gate, two different scopes.

What blocked commits: `.claude/settings.json`, `graphify-out/`, `packages/web/.impeccable/`, `.sc/last-chat-settings.json` (another tool's state file), a `biome.json` deprecation warning, vendored skill code, design-tool exports, a throwaway prototype. Only one block, ever, was about a file in the commit.

Worst case, `maestro-worktrees-issue214/814bd9fc`, 2026-07-22, 11 tool calls / 7.6 minutes: the commit was ready at call 1; nine of eleven calls and both human interrupts were gate recovery.

The `biome.json` deprecation blocked *every* commit repo-wide across three sessions on two days (`5a1563dd`, `1d7851bb`, `f5fc63ee`), each paying the diagnosis cost from scratch.

**Build cost:** one line. Make the lint lane scope to the staged set, exactly as the test lane in the same file already does.

---

## 2. The RTK wrapper reports a red test suite as green — **FIX (correctness, not speed) · DONE 2026-07-26**

**Recurrence:** 46 sessions ran the masked command after the fact was recorded. 16 sessions dug through RTK's own log files to work out which number was real. **Four resolved it backwards and declared GREEN on a red suite.**

**Verified:** `LEARNINGS.md` line 30 records it, dated 2026-07-18, and it was re-captured in commit `d2a2133` titled "capture rtk-vitest masking reconfirmation". `rtk hook claude` is still wired at line 208 of `~/.claude/settings.json`.

The sharpest instance, `maestro/23b466dd`, 2026-07-21 — three days after the entry was written:

```
pnpm vitest run --project web tokens-contrast
  → PASS (25) FAIL (0)  ...  total 25 passed 20 failed 5
Claude: "GREEN: 25/25 slagen. De samenvatting-regel las een oude log."
Confirmation run → success False, total 25 passed 20 failed 5
```

It saw the honest failure twice, called it stale twice, and shipped the green claim.

`AGENTS.md` calls TDD blocking. A tool that silently converts red to green is not a speed problem; it is a correctness hole underneath the one rule this repo treats as non-negotiable. The entry sits in an advisory file that is read at session start 3% of the time.

**Build cost:** minutes. Either stop RTK rewriting `vitest`, or hard-code the direct binary into the `tdd` and `implement` skills. Do not leave it as a written warning — the written warning is what already failed, four times.

---

## 3. Nineteen percent of every session is spent working out where you are — **AUTOMATION**

**Recurrence:** all 269 sessions with tool use.
**Cost:** median 10 orienting tool calls, 26 assistant turns, and 5.2 minutes before the first productive action. Aggregate **6,389 of 33,454 minutes = 19%** of total session wall-clock.

What gets re-discovered every time, across 269 sessions: `gh issue view` ×188, `AskUserQuestion` ×106, `git -C ~/Projects/maestro …` ×62, an explorer sub-agent ×60, `git log --oneline` ×32, `gh issue list` ×30, `git worktree list` ×15, `git branch --show-current` ×13, `Read docs/jobs.md` ×11, `Read LEARNINGS.md` ×8.

You ask "welke worktrees staan er open" in 6 separate sessions, 2026-07-20 → 2026-07-23.

**The fix is already proven in your own setup.** Sessions opened via `/worktree` show 2 orienting calls and a fixed opening sequence. Sessions without it show 13 to 48.

**Build cost:** roughly half a day. A session-start hook printing one preamble: current branch, live worktrees, open PRs, the NOW job, and the `## Active` block of `LEARNINGS.md`. That replaces ~10 tool calls with zero, and it is also the only mechanism that would make the 3% LEARNINGS read rate irrelevant.

---

## 4. The mandatory browser check is skipped in a third of UI sessions, and in worktrees it is impossible — **FIX + AUTOMATION · 4a DONE 2026-07-26; 4b/4c open**

**Recurrence:** 59 sessions edited rendering code. 25 (42%) ran neither `agent-browser` nor `pnpm smoke`. Since the `AGENTS.md` hard rule landed on 2026-07-22, still 5 of 18 (28%).

You asked why in four separate sessions on two days:

> "heb je geen toegang tot agent-browser?" — 2026-07-22, `maestro/f075d5a0`
> "waarom gebruik je agent-browser niet?" — 2026-07-22, `maestro/255d94bd`
> "in geen van alle worktrees pakte de agent automaatisch agent-browser om de ui te verifieren. wat gaat hier mis" — 2026-07-22, `maestro/93b40eee`

**Your gitignore hypothesis was right.** Verified: `git check-ignore -v .claude/skills/agent-browser` → `.gitignore:42`. Only `agentation`, `verify-in-smoke/SKILL.md` and `worktree/SKILL.md` are tracked under `.claude/skills`. A fresh worktree gets the skill file under `.agents/skills` but not the link Claude Code actually discovers.

**But that is not the whole cause.** The skip rate is 46% in worktrees and 43% in the main repo — statistically the same. The rule is skipped everywhere; the gitignore only makes it impossible in worktrees.

**Second half of the cost: the ritual is expensive enough to avoid.** Across 56 smoke boots in 26 sessions, the same five steps repeat verbatim — boot, open, snapshot, click, fill the sandbox path, click again — costing a median **6 tool calls and 59 seconds before the first real assertion**. 283 explicit `sleep` calls total 44 minutes of deliberate waiting.

Sessions that shipped visible UI with no screenshot at all, confirmed by their own commit messages:
`d8a9365c` (30 UI edits, first-run wizard), `5a1563dd` (13 edits, sidebar targets), `8d0bd3fb` (25 edits, path labels), `40c8c13e` (7 edits, re-read feedback), `1d7851bb` (9 edits, bulk-deploy report).

**Build cost:** one line for the gitignore. Half a day for a `smoke-ready` script that polls instead of sleeping and seeds through the server API instead of the form — collapsing 6 calls and 60 seconds into 1 call and ~15 seconds. Then the mandate stops being the expensive option.

---

## 5. Two typecheck hooks and two format hooks run on every edit — **FIX · DONE 2026-07-26**

**Recurrence:** 1,795 TypeScript edits across 79 sessions.
**Cost:** measured 1.50 s per edit for the full chain, of which 1.41 s is `typecheck-after-edit.sh`. Roughly **45 minutes of pure waiting**, most of it duplicate.

**Verified:** `~/Projects/maestro/.claude/settings.json` still wires `typecheck-after-edit.sh` on every Edit and Write. Your global settings wire `typecheck-on-stop.sh`, whose own header says:

> "Why Stop instead of per-edit: a multi-file refactor is only type-correct once all files are written. Checking after every single Edit/Write surfaces transient mid-refactor errors."

You wrote the replacement and never unwired the original. Both run.

Same shape for formatting: `~/.claude/hooks/format-after-edit.sh` and `~/.claude/hooks/code-quality/scripts/format-after-edit.sh` both fire on every edit in maestro. `diff` confirms they are different files.

**Build cost:** deleting two lines.

---

## 6. The Codex review inside `/workflow-ship` is the biggest single time sink, and you override it — **FIX (skill)**

**Recurrence:** 21 of 42 ship runs contain the loop; 49 adversarial-review calls total. You have cancelled it five times in nine days:

> "dit gaat nergens naar toe ship zonder review" — 2026-07-16, `maestro-146/6c4688a6`
> "sdit duurt veel te lang ga maar sghippen zonder review" — 2026-07-25, `maestro/20da66e1`
> "skip de review" — 2026-07-23, twice, two sessions
> "doe alleen /impeccable document daarna workflow ship zonder review" — 2026-07-21

**Cost:** ship's median is a healthy 4 tool calls / 1.2 minutes. The worst run, `maestro/f6f75574` 2026-07-22, spent **68 tool calls and 40.3 minutes before the first push** — eight review rounds, each followed by edits, a test run and an amended commit. Tool calls 19–28 re-edit the identical files as calls 5–14. Nineteen test runs and five amends inside one span. The top four ship runs burn 207 tool calls and 86 minutes before pushing.

The `codex-review` skill documents a configurable round cap. The review embedded in `workflow-ship` has none in evidence.

**Also relevant:** ship is not slow for the reasons you would guess. CI polling averages 2 calls per session. Merge conflicts appear in exactly one span, and that one was necessary work.

**Build cost:** a cap of 2–3 rounds, or move the review before the commit where `/code-review` already lives. Ship's job is push, PR, merge — not rewriting source.

---

## 7. Your global rule about `cd` is the direct cause of 13 worktree failures — **FIX (one line, but it is a contradiction) · DONE 2026-07-26**

**Recurrence:** 743 of 1,260 Bash calls in `/worktree` sessions (59%) begin with a redundant `cd`; per-session median 77%, max 92%. Worst single session: 125 of 146 calls, 123 of them to the same path.

**Cost:** all 17 `EnterWorktree` failures trace to this. Thirteen of them follow a bare `cd` into the worktree — twelve are the skill's own graphify step. The failure looks harmless (Claude reads the error and continues) but leaves no worktree session registered, which then produces `ExitWorktree` no-ops and forces manual cleanup. Worst case, issue290 on 2026-07-23: stranded session, `/clear`, 31 minutes, three extra messages from you.

**The contradiction, verbatim.** `~/.claude/rules/workflow.md` says:

> "Never rely on the working directory between Bash calls: use absolute paths, or prefix the command with its own `cd`."

The `worktree` skill says the opposite: run every git command with `-C`, never rely on cwd. And the skill's own graphify line wraps it in a subshell — a form used **0 times out of 38**.

Two sessions prove the cheap pattern works end to end: `c092edc6` (85 Bash calls, **zero** `cd`) and `0f142ef7` (54 calls, 2 `cd`).

**Build cost:** one line. Amend the global rule so that after `EnterWorktree`, `cd` is forbidden and `-C` or a subshell is required. This is an edit to an existing instruction, not an addition — which is why it has survived so long.

---

## 8. Seventy-six interruptions, and almost none of them are because Claude was wrong — **behaviour, weak fix**

**Recurrence:** 76 interruptions across 67 distinct sessions — 20% of all sessions, rising through July.
**Cost:** 480 minutes of work discarded mid-flight, across 629 tool calls whose results were never used. Median 46 seconds of silence before the interrupt; p90 is 656 seconds; the maximum is 2 hours 40 minutes.

Your own words:

> "zit je vast?" — 2026-07-23, `maestro/1d7851bb`, after 1,131 s. The work was correct and on track.
> "loopt het nog" — 2026-07-21
> "dit duurt te lang, waar staan we" — 2026-07-16, after 3,940 s and 77 tool calls
> "waarom duurt dit zo lang" — 2026-07-16, after 9,575 s
> "deze sessie durude bijna 40 min, een simpele front-end fix, dit is ondragelijk." — 2026-07-25

These are silence failures, not wrongness failures. You interrupt because you cannot tell running from hung.

**Honest assessment of the fix:** the obvious answer is a progress line every ~90 seconds during long runs. But that is a prose rule about model behaviour, and section zero of this document says prose rules do not hold. Expect partial compliance. The durable version is #3 and #6 — make the long runs short, rather than narrating them.

---

## 9. Claude asks permission six times more often than it should, and skips asking where it matters — **behaviour**

**Recurrence:** 185 bare "ja"/"akkoord"/"eens"/"a" replies across 96 distinct sessions. Roughly 100–120 were avoidable. Against that: 5 undo events and 13 wrong-path interrupts where Claude should have asked and did not. **The ratio is about 6:1 toward over-asking.**

The avoidable kind, verbatim, 2026-07-19:

> "een nieuwe worktree heeft geen `node_modules`. Draai er eerst `pnpm install` — anders faalt elke test en typecheck … en dat kost je tien minuten verkeerd debuggen. **Zal ik die install nu draaien?**" — reply: "ja"

Claude states the step is mandatory, states the cost of skipping it, then asks permission. That is not a decision.

The genuine kind, correctly asked, 2026-07-22:

> "Ben je het eens met deze zes-toestanden-kaart, of wil je er één anders?" — reply: "eens"

**The tools are used backwards.** 30 replies across 12 sessions are a bare letter — `a`, `b`, `c` — answering a menu Claude hand-built in prose, which is exactly what `AskUserQuestion` exists for. Meanwhile `AskUserQuestion` is fired for ceremony: a skill's opening menu, a clarification answerable from `CONTEXT.md`, approval of a commit *message*. Thirty-three of those were rejected outright.

The 16 push/ship confirmations should stay — that is your explicit stop-line.

**Build cost:** a rule. Same caveat as #8.

---

## 10. "Mirror the skill back to `.agents/skills`" — asked 15 times, written down nowhere — **FIX (add a rule) or AUTOMATION**

**Recurrence:** 15 distinct sessions across two repos, 2026-07-02 → 2026-07-25.

> "ik wil .agents/skills als basis (niet de repo) en dan symlinked naar .claude/skills. doe dit" — 2026-07-02
> "kopieer de geupdate skill ook lokaal naar .agents/skills daarmee krijg .claude/skills ze ook via synmlink" — 2026-07-17
> "copy de ge-updae skill ook naar /projects/agent-harness skills directory zodat deze in sync blijft" — 2026-07-25

**Verified absent:** zero mentions of `.agents/skills` or `agent-harness` in `~/.claude/CLAUDE.md`, `~/.claude/rules/workflow.md`, or `~/.claude/rules/code-standards.md`.

This repeats across repos, so it is a gap in the **global** rules, not a repo one.

**Build cost:** one sentence — or better, a PostToolUse hook on edits under `.claude/skills/**` that does the mirroring, since it is mechanical.

---

## 11. Four small config wins, roughly ten minutes each — **FIX · 11a DONE 2026-07-26; 11b/c/d open**

Each is independently verified and individually trivial. Grouped because none deserves its own decision.

**a. `pnpm format` does not sort imports.** Verified: root `package.json` has `format = biome format --write .`, which leaves import order alone; `lint = biome check .` flags it. Result: 26 import-order complaints across 19 sessions, and 19 manual `biome check --write` calls across 12 sessions to work around it. Change `format` to `biome check --write .`.

**b. No per-project test scripts.** Verified: no sub-package defines a test script; root has only `test = vitest run` (whole suite). So four improvised ways of running tests appeared — `pnpm vitest run` (median 1.4 s), `pnpm test` (13.8 s), `npx vitest run` (median 4.5 s but mean 28.3 s), `./node_modules/.bin/vitest run` (3.3 s) — with 143 style switches between them. Add `test:web`, `test:core`, `test:int` using the projects already defined in `vitest.config.ts`.

**c. Test failures are truncated, so the same command is re-run with a different filter.** 34 identical re-runs with only the output filter changed and no edit in between, across 22 sessions. The worst single bug hunt, `maestro/f6f75574`, took 7 runs and ended with Claude parsing an RTK log as JSON and writing a throwaway `__debug.test.tsx` — while the full error sat on disk the whole time. Add a JSON reporter writing to a fixed file.

**d. Chained `lint && typecheck && test`.** 145 invocations across 44 sessions, against `verify-in-smoke/SKILL.md` line 28 which forbids exactly this. Eleven produced a failure count that had to be re-run standalone to be trusted. One session ran the full suite four times to converge on a number that moved every time. Replace with a `verify` script running the three as separate processes and printing one summary.

---

## 12. The graphify hook fires 1,320 times for 38% adoption — **FIX (narrow the matcher)**

**Recurrence:** installed 2026-07-22, commit `d6aa6f0`. 1,320 firings across 53 transcripts in three days; worst single session 102. Adoption: 29 of 76 sessions since install actually ran graphify.

**Cost:** roughly 73,000 tokens of nagging, at a 38% hit rate. It fired about ten times during *this* audit session, where the maestro code graph is irrelevant to reading transcript files.

Also unrecorded anywhere: `graphify update` is advisory, not automatic. That fact was independently re-discovered three times, including a session where the graph referenced deleted files, and another where the graph is gitignored so the "mandatory" hook fires in worktrees where no graph exists.

**Build cost:** narrow the matcher to Read and Grep under `packages/**`, drop it for Bash entirely, and gate it on the graph being fresh.

---

## 13. Skill catalogue hygiene — **FIX (small) · DONE 2026-07-26 (fork deleted; grill family left alone — see Implementation log)**

**Recurrence:** 43 local skills installed. **10 never invoked** in 345 sessions, by either route: `thermo-nuclear-code-quality-review`, `six-thinking-hats`, `security-threat-model`, `research`, `intent-layer`, `decision-mapping`, `codex-review`, `codebase-design`, `audit-dependencies`, `agent-browser`. The last is a false positive — it is used constantly through the shell.

**The real defect is a fork, not the dead weight.** `review` is a stale copy of `code-review`: the two SKILL.md files carry the same description in the catalogue, but `review` is missing the Fowler code-smell baseline. Thirteen invocations got the weaker one. `grill-me`, `grill-with-docs` and `grilling` are three overlapping entries; `thermo-nuclear-code-quality-review` overlaps `code-review`.

**Cost:** 14,192 characters of skill descriptions load every session (~3,500 tokens) before plugin skills are counted. That is secondary. The primary cost is that two entries with identical descriptions cannot be chosen between correctly.

**Build cost:** delete the fork, merge the grill family. Minutes.

---

## 14. Handoff files are load-bearing and evaporate — **SKILL (the one genuine candidate)**

**Recurrence:** 33 `lees: <path>/handoff-*.md` prompts across 16 sessions; 17 handoff files written. `/compact` is essentially unused — one transcript contains a continuation summary. The handoff file *is* your context-carrying mechanism.

**Cost:** they are written to session-scoped temp directories, so you paste an absolute path by hand each time, for example:

> "lees: /private/tmp/claude-501/-Users-michielmerks-Projects-maestro/232c193a-.../scratchpad/handoff-inventory-redesign-build-slices.md"

Of six sampled files, **three are already gone**. `git ls-files | grep -ic handoff` → 0. Not one is tracked.

A `handoff` skill exists globally and was invoked 13 times, but nothing in the global rules, `AGENTS.md`, or any `.claude/rules/*.md` mentions handoffs at all.

**Why this is the one place a skill is justified:** it recurs (16 sessions), it has no owner, and the failure mode is losing context permanently rather than losing time. Give it a stable gitignored path and have the session-start hook from #3 offer the newest one.

---

## 15. Things that are fine — **NOTHING**

Flagged explicitly so effort does not leak here.

- **`/code-review` is the healthiest part of the pipeline.** 72 of 73 runs sit before the commit, zero sessions re-review the same diff, and the findings land in the commit that follows. Only 3 sessions run both it and the Codex review. Leave it alone.
- **`/workflow-commit`'s happy path is tight.** Median 3 tool calls, 1 turn, 30 seconds. No message rewrites, no staging fights, no redundant status re-reads. The tail is entirely #1.
- **The read-before-edit hook is the best-behaved control in the setup.** 132 blocks across 73 sessions, **zero** caused by lost tracker state, 58 genuine catches of blind edits to files including `CLAUDE.md`, `commit-gate.py` and `MEMORY.md`. Half its cost is self-inflicted — Claude reaching for `cat`/`sed` when `Read` was correct. Keep it.
- **Test-suite growth is healthy.** 82 files / 439 tests on 2026-06-23 → 126 files / 1,101 tests on 2026-07-25: 151% more tests for 34% more wall-clock.
- **Four of the five worktree conventions are dead.** Only `~/Projects/maestro/.claude/worktrees/` is live, and the tool enforces it. Nothing to fix.
- **The 152 redundant `gh issue view` calls** are real but second-order — 10% of `gh` traffic against 598 legitimate writes. Do this last, or not at all.
- **CI polling, PR bodies and merge conflicts are not bottlenecks.** Measured and ruled out.

---

## 16. Five hooks exist only on this laptop — **BLOCKER, found while planning the fixes**

Added after the initial write-up, while working out where the repairs above should land.

**Verified:** `~/.claude/` is not a git repository (`git rev-parse --show-toplevel` → `fatal: not a git repository`). `~/Projects/agent-harness` tracks 20 hook files and is the canonical home. Cross-checking the hooks this audit wants to touch:

| Hook | Home |
|---|---|
| `verification-runner.sh` (#1) | tracked in `agent-harness` |
| `commit-gate.py` | tracked in `agent-harness` |
| `typecheck-on-stop.sh`, `format-after-edit.sh` | tracked in `agent-harness` |
| `protect-main-branch.sh` (#7 target) | **nowhere** |
| `read-tracker.py` | **nowhere** |
| `typecheck-after-edit.sh` (#5 culprit) | **nowhere** |
| `secret-file-guard.py` | **nowhere** |
| `anti-deflection.py` | **nowhere** |

The read-before-edit hook — 58 genuine catches, zero false positives, called the healthiest control in this setup — exists in exactly one unversioned, unbacked-up place.

**This is the same disease as #10.** There is no rule saying where hook and skill source belongs, so some of it landed in `agent-harness` and some of it landed nowhere. #10 is the symptom you noticed fifteen times; this is the same gap on the hook side, which nobody noticed at all.

**Consequence for sequencing:** editing `protect-main-branch.sh` or unwiring `typecheck-after-edit.sh` means changing a file with no history to revert to. Give these five a home before touching them.

**Build cost:** half an hour.

---

# Proposals, ranked by value

Value = payoff ÷ build cost. Type is one of: **fix** (change existing config or code), **automation** (a hook or script that did not exist), **skill**, **nothing**.

## Tier 0 — blocker · NOT DONE

| # | Finding | Proposal | Type | Evidence | Payoff | Cost |
|---|---|---|---|---|---|---|
| 16 | Five hooks are unversioned | Move them into `agent-harness`; add a global rule naming the home | fix | `~/.claude` is not a repo; 5 of 7 audited hooks tracked nowhere | Makes every repair below revertible; protects the best control in the setup | 30 min |

## Tier 1 — one line or less, immediate payoff · ALL SHIPPED 2026-07-26

Every row below is implemented and verified; the runs are named in the Implementation log. Two rows landed differently than proposed — the main-branch hook and #13 — and that log says why.

| # | Finding | Proposal | Type | Evidence | Payoff | Cost |
|---|---|---|---|---|---|---|
| 1 | Commit gate lints the repo, tests the commit | Scope the lint lane in `verification-runner.sh:99` to the staged set, as the test lane at 105–141 already does | fix | 15 blocks, 12 sessions | Removes 14 of 15 blocks and 1 false main-branch block | 1 line |
| 2 | RTK reports red tests as green | Stop RTK rewriting `vitest`, or hard-code the direct binary into `tdd` / `implement` | fix | 46 sessions exposed, 16 re-investigations, **4 false GREEN** | Closes a correctness hole under the one blocking rule | minutes |
| 5a | Two typecheck hooks per edit | Unwire `typecheck-after-edit.sh` from `maestro/.claude/settings.json` | fix | 1,795 edits, 1.41 s each | ~45 min | 1 line removed |
| 5b | Two format hooks per edit | Unwire the duplicate `format-after-edit.sh` | fix | every maestro edit | ~0.3 s per edit | 1 line removed |
| 11a | `pnpm format` does not sort imports | Change `format` to `biome check --write .` | fix | 26 complaints / 19 sessions; 19 manual workarounds | Removes the workaround | 1 line |
| 4a | `agent-browser` skill is gitignored | Un-ignore `.gitignore:42` or vendor the skill | fix | mandatory UI check impossible in every fresh worktree | Makes the rule executable at all | 1 line |
| 7 | The global `cd` rule causes the worktree failures | Amend `workflow.md`: after `EnterWorktree`, no `cd` — use `-C` or a subshell | fix | 743 redundant prefixes; **all 17** failures | 17 failures + one 31-min stranded session | 1 line (resolves a contradiction) |
| — | Main-branch hook misses `git checkout -b` | Lift the line-39 parsing into the default block of `protect-main-branch.sh` | fix | 6 blocks, 6 sessions | Correct commands stop being denied | ~5 lines |
| 13 | `review` is a stale fork of `code-review` | Delete the fork; merge the grill family | fix | 13 invocations got the weaker version | Removes an impossible choice | minutes |

## Tier 2 — ten minutes to an hour

| # | Finding | Proposal | Type | Evidence | Payoff | Cost |
|---|---|---|---|---|---|---|
| 12 | Graphify hook fires 1,320× for 38% adoption | Scope the matcher to Read/Grep under `packages/**`; drop it for Bash; gate on graph freshness | fix | 1,320 firings in 3 days; ~10 during this audit | ~73k tokens | config |
| 11b | Four vitest invocation styles | Add `test:web` / `test:core` / `test:int`; name them in `testing.md` | fix | 143 switches; `npx` mean 28 s vs 3 s | One documented way | 10 min |
| 11c | Truncated failures cause filter-only re-runs | JSON reporter to a fixed file in `vitest.config.ts` | fix | 34 re-runs with no edit between, 22 sessions | Full error on disk, first time | 10 min |
| 6 | Codex review inside `/workflow-ship` | Cap at 2–3 rounds, or move the review before the commit | fix (skill) | overridden 5× in 9 days; worst run 68 calls / 40 min | Largest single time sink | small |
| 11d | 145 chained `lint && typecheck && test` | One `pnpm verify` script running three child processes, one summary | fix | 44 sessions; 11 untrustworthy red claims | Same rigour, one call | ~1 h |
| 10 | "Mirror the skill to `.agents/skills`" asked 15× | PostToolUse hook mirroring edits under `.claude/skills/**` | automation | 15 sessions, 2 repos, written nowhere | 15 manual reminders | ~1 h |
| 4c | `verify-in-smoke` used in 5% of cases | Convert its two mechanical checks into PreToolUse guards | automation | 3 invocations vs 56 smoke boots | ≥1 documented misdiagnosis | ~1 h |

## Tier 3 — half a day, largest absolute payoff

| # | Finding | Proposal | Type | Evidence | Payoff | Cost |
|---|---|---|---|---|---|---|
| 3 | 19% of session time spent orienting | SessionStart preamble: branch, worktrees, open PRs, NOW job, `## Active` learnings | automation | median 10 calls / 5.2 min; **6,389 of 33,454 min** | Largest absolute time win; also makes the 3% read rate irrelevant | half day |
| 4b | Browser check costs 6 calls / 60 s before the first assertion | `smoke-ready` script: poll instead of sleep, seed via the server API | automation | 56 boots, 44 min of sleeps, 42% skip rate | 60 s → ~15 s; the mandate stops being the expensive option | half day |
| 14 | Handoff files evaporate | `handoff` skill with a stable gitignored path; offered by the SessionStart preamble | **skill** | 33 references / 16 sessions; 3 of 6 files already gone | The only place a new skill is justified | half day |

## Tier 4 — needed, but enforcement is weak

| # | Finding | Proposal | Type | Evidence | Honest verdict |
|---|---|---|---|---|---|
| 8 | 76 interruptions, 480 min discarded | Progress line every ~90 s on long runs | behaviour rule | 67 sessions; "zit je vast?", "loopt het nog" | This is a prose rule about behaviour, and prose rules do not hold here. The durable fix is #6 and #3: make long runs short |
| 9 | Asks 6× too often, misses the times it should | If the step is already stated as necessary, safe and reversible: act and report. Menus go through `AskUserQuestion`, not prose | behaviour rule | 185 stamps / 96 sessions; 30 letter replies to prose menus | Same objection. Expect partial compliance |

## Tier 5 — do not build

| # | Finding | Verdict |
|---|---|---|
| 15a | 152 redundant `gh issue view` calls | **Nothing.** 10% of traffic against 598 legitimate writes. Last, or never |
| 15b | 9 unused skills | **Nothing.** Cosmetic, ~3,500 tokens. The real defect was the fork (#13) |
| 15c | `/code-review`, the `/workflow-commit` happy path, the read-before-edit hook | **Nothing — and explicitly leave alone.** 72 of 73 reviews correctly placed; commit median 3 calls; the read hook has 58 genuine catches and zero false positives |

---

## What this adds up to

The setup is not short of instruction. It has 43 skills, 14 hooks, six rules files, a glossary, a job board, an ADR directory, a learnings file and a knowledge graph. What it lacks is **enforcement placed where the failure happens**.

Three items are gates that already exist but are wired wrong (#1, #5, #12). Two are facts that were written down correctly and then ignored because the file holding them is read 3% of the time (#2, #4). One is a global rule actively causing the failure it was meant to prevent (#7). One is a genuine automation gap with the largest single payoff (#3). And one, found last, is that five of the hooks doing the enforcing have no home at all (#16).

Seventeen of the twenty-four proposals are hooks or configuration, not skills. Only one wants a new skill (#14). That is the honest read of the evidence, and it argues against the instinct this document was commissioned to serve.

**Sequence:** #16 first — half an hour, and it makes everything after it revertible. Then Tier 1 in one sitting: nine one-line changes, roughly thirty minutes, no ticket ceremony. Then `/to-tickets` for Tier 2 and 3, which have real blocking edges (#3 blocks #14). Skip the grilling stage — this audit was the grilling. Do not build Tier 4; writing two more prose rules is the exact mistake this document documents.

**What actually happened (2026-07-26):** Tier 1 ran first, #16 did not run at all. Three unversioned files were edited anyway, guarded only by a copy in a second unversioned directory. That ordering was the wrong call and #16 is now the next thing to do, before Tier 2.

**Measurement:** the extraction scripts are in the session scratchpad. Re-run the compliance table in 30 days (target: 2026-08-24) and compare. Without that, a month from now you will know these were built, not whether they worked.
