# Reflection notes — session-transcript diagnosis, 2026-08-14

Diagnosis only; nothing was built or changed. Ranked by leverage (recurrence × pain ÷ build cost).

**Corpus:** ~560 sessions in `~/.claude/projects/` (2026-07-14 → 2026-08-14), mined by five
parallel subagents: maestro main recent (55 sessions), maestro main older (429 files, ~224 MB),
maestro worktree dirs (85 sessions / 52 dirs), orca workspaces (24 sessions / 14 dirs), other
projects (78 sessions: pm-operating-system, agent-harness, life-os, chief-os). Raw signal
reports: session scratchpad `report-{a,b,c,d,e}-*.md`. Session refs below are
`corpus|session-prefix|date`.

---

## 1. Scope RTK down (or fix its grep rewrite) — RESOLVED 2026-08-18

Re-measured on rtk 0.45.0: the grep rewrite is fixed. `--include='*.ts'`, `-E`
alternation, `-F` literals, escaped metacharacters and character classes all
match `/usr/bin/grep` output exactly, and `git -C <path>` targets the right
repo. Only `rtk find` compound predicates still hard-fail, with a clear error.
`~/.claude/RTK.md` now records the measured 0.45.0 limits instead of the stale
0.42.0 ones, so the workaround boilerplate (`rtk proxy`, `/usr/bin/grep`,
`python3 -` heredocs) can stop. The hook stays as-is; scoping it down would
have removed a working rewrite.

<details><summary>Original diagnosis</summary>


The single most recurrent failure in every corpus, for a tool whose purpose is saving tokens.

- `--include=*.ts` glob breakage: 167 error lines across 127 files pre-08 (B), ~25 sessions
  post-08 (A), 9 of 14 orca dirs (D), 7 pm-os vault sessions on `*.md` (E).
- Rewrites targeting nonexistent binaries: `/usr/bin/cat` missing on macOS, 6+ sessions (A|29fed62f|08-09 a.o.).
- Workaround pressure is itself overhead: `rtk proxy` 130x in 21 sessions (B); 57 `python3 -`
  heredocs + 84 `/usr/bin/grep` calls to dodge the rewriter (D); every review-subagent prompt
  now carries "use /usr/bin/git" boilerplate (A); RTK.md documents four known limits that every
  session re-pays in tokens.
- Hook fired ~794 times in the recent corpus alone (A).

Leverage: removes the #1 error class everywhere at near-zero cost. Options, cheapest first:
narrow the hook to the rewrites that demonstrably work (`git`, `gh`), or upgrade/patch rtk's
grep+find handling. Worth measuring whether RTK still nets out positive at all.
</details>

## 2. Take the remaining weight out of the ship pipeline — RESOLVED 2026-08-18

`workflow-ship` already carried the linked-worktree repair (steps 1, 6–9), the
ship-time behind-origin check (step 1) and the `git ls-remote` verification of
gh's silent auto-delete skip (step 6). The one open gap — `git branch -d`
refusing "not fully merged" after a squash or rebase merge — is now closed in
step 8: on that failure only, re-read `gh pr view --json state`, and delete with
`-D` when it says `MERGED`. Any other `-d` failure still reports and stops.

Michiel's call on the review gate: **no gate**. The commit-gate hook (lint,
typecheck, test) stays the only check; do not re-add a review round. The
implement-start half of the behind-origin check belongs to candidate 3.

<details><summary>Original diagnosis</summary>

The codex review gate is already removed (A|2b172ac5|08-13: "soms lijkt het wel enterprise
gate" → "haal de hele codex review weg") after weeks of the same complaint: "skip de review"
8x in 7 sessions (B), a 4-round/58-min review loop (D|a3cc67c8|08-13), "40 min voor een simpele
front-end fix, dit is ondragelijk" (B|20da66e1|07-25). Don't re-add it. What is still paid on
every ship:

- **Post-merge cleanup fails in every linked-worktree ship** and is repaired by hand each time:
  "cannot delete branch … used by worktree" / "'main' is already used by worktree" in 8+ orca
  sessions (D|84cf53d6, a3cc67c8, ad91a61e) and 2 worktree sessions (C). The repair sequence is
  identical every time — bake it into `workflow-ship`.
- **Behind-origin races**: shipped-second workspaces were 1–8 commits behind in 6 orca sessions;
  twice a real merge conflict (D|b5165a2d: 8 conflict files, review read a stale diff). The
  mid-corpus fetch+behind-check patch didn't stop recurrence — the check belongs at implement
  start too, not only at ship.
- **Squash-merge branch cleanup**: `git branch -d` "not fully merged" (A|022e3d3c|08-09),
  gh auto-delete silently skipped (D|ad91a61e) — use `-D` after a confirmed squash merge.
- Given no server-side branch protection (private repo, GitHub Free), consider a cheap
  risk-tiered gate instead of none: docs/small diffs ship directly; `packages/core` diffs get
  one review round. Decision is Michiel's; the transcripts only show the old gate cost more
  than it caught.
</details>

## 3. Fix the worktree lifecycle mechanics — FIX (worktree skill + hooks)

- **Tilde-path bug**: "Cannot enter worktree: …/maestro/~/Projects/…: ENOENT" in 3 sessions
  spanning ≥2 weeks (C|issue249|07-22, issue516|08-03, issue519|08-04) — a literal `~` is being
  concatenated instead of expanded.
- **Deleted-cwd shell breakage** after worktree cleanup: "shell cwd recovered" in 14 sessions (C).
  ExitWorktree/cd-away before removal would kill this class.
- **cd-noise**: one session ran 122 `cd` commands, 87 identical (C|issue423); ~170 worktree
  cd's in the recent corpus (A). Symptom of the same stale-cwd fear `workflow.md` documents.
- **Manual cleanup asks** keep recurring: "welke worktrees staan er nog open" / "verwijder die
  worktree" in 8+ sessions (C|issue339, worktrees-issue214, triage-187, issue249; B: 17x in 13
  sessions). A `worktree done` path (remove worktree + branch, verify merged) closes the loop
  the skill currently leaves open.

## 4. Spec-split skill: sub-issues + blocked-by in one move — SKILL (or extend `jobs`/`create-issue`)

The same instruction re-typed for a month: "hang ze als sub-issues onder de spec, met blocked-by".

- 11x in 8 sessions pre-08 (B|cf4076e1|07-27, 2cc70e08|07-22, 0c0a7efa|07-22, 028e57af|07-18,
  dfe19bcf|07-20 "waarom hangen ze niet als sub-issues?", +3) and again post-08 (A|6bb881d1|08-06,
  6520506d|08-09).
- The mechanics are already proven in transcripts: `gh api …/sub_issues`, `…/dependencies/blocked_by`,
  `gh api graphql` (14x). Codifying them into the spec-splitting step makes the instruction
  disappear. Build cost: low — instructions + known recipes, no new tooling.

## 5. Fix the flaky `copy-skill-folder` test — FIX

- Times out (1000+ files, 5s limit) only under 3-process `pnpm verify` load; re-diagnosed from
  scratch in 5 orca sessions, twice in one session, always concluding "belastingsflakiness, geen
  regressie" (D|6c9f089d, a3cc67c8, 97dfdb38, 4222a953, 9a9bda20).
- Same cluster: verify wall-time swings 8s→30s→79s (D|b5165a2d), and `pnpm verify | tail -N`
  ran 59x in 21 sessions with 9 hand-tuned tail sizes despite the ".logs/, never re-filter" rule.
- One test fix (timeout/pool isolation) deletes a recurring diagnosis ritual and makes verify
  time predictable again.

## 6. Consolidate the style/persona hook stack — FIX (audit)

Plain-language drift persists *despite* three overlapping per-prompt injections (tone_preference
UserPromptSubmit fired 257x in the recent corpus; ADHD + ponytail SessionStart rulesets load in
every session of every project — all 39 pm-os vault sessions included).

- Corrections still needed: 7 sessions pre-08 (B|bdf52ec2, 8f42a296, …), 5+ worktree sessions
  (C|triage-187: "ik snap niks van wat je hier zegt" → handoff "waarom leef je mijn globale rules
  structureel niet na"), 2 post-08 (A), 5 pm-os (E).
- The stack also conflicts: the assistant itself diagnosed a harness-vs-user-rules contradiction
  (A|b98bf3ea|08-01), and Michiel couldn't tell whether the ADHD hook was even active
  (B|f174f958+1e48d2d2|07-29).
- Include `read-tracker.py` in the same audit: it blocked edits ~100+ times across all corpora
  (~46 events C, ~43 B, 14 E, 3 sessions D) while the harness *already* enforces read-before-edit
  natively (Edit fails on unread files) — a duplicate guard paying double.
- Precedent exists: pm-os session 2a86090e (07-28) audited every hook on time/token cost and
  pruned; anti-deflection.py has misfired on Claude's own closing prose (2x, E).
- More rules won't fix the drift; fewer, non-overlapping ones might. One audit session:
  inventory all injections, delete overlaps and duplicates, keep one source per concern.

## 7. Structural Node-24 fix for launchers — FIX (verify first)

- Explicitly requested: "de handmatige werkt, ik wil een struturele oplossing" (A|5836be99|08-03)
  after VS Code-spawned shells got node 22.16.0 (<24). One session carried `export NVM_DIR=…`
  boilerplate on 24 commands (A|bb31d025|08-03).
- Only observed 08-03; check whether it is already fixed before spending anything. If not:
  launcher sources nvm, or `.envrc`/direnv.

## 8. Harden the pm-operating-system ingest pipeline — FIX

The signal→inbox→wiki ritual is pm-os's dominant workload: `signal_helper.py` driven in 17 of
39 sessions, 44 direct calls, plus a fixed 12-step sequence (pull → inbox → file → verify →
index → wiki → commit → push) re-executed per session (E|A/C-1).

- The parts that break are the ad-hoc gaps *around* the helper: the identical inline-python bug
  twice, 9 days apart ("AttributeError: 'str' object has no attribute 'get'",
  E|11e83588|07-16 + 131f82b2|07-25) — move that logic into `signal_helper.py`.
- ≥9 sessions consist of a single word ("pull", "push", "commit") as the entire prompt (E|C-2):
  a session-start auto-pull (hook or wrapper) in that repo deletes a whole session category.
- Wiki curation still needs hand-pruning of ingest-created entities (3 sessions, E|A/D-2) —
  a stricter entity-creation threshold in the skill is cheaper than recurring cleanup.

## 9. Make this reflection a skill — SKILL

This transcript-mining exercise has now been commissioned at least four times with hand-typed
prompts: B|289e83af|07-19 ("analyze my Claude Code sessions … reflection-notes.md"),
B|37a80984|07-25 (same, workflow speed), home-dir|3c8a1f2e|07-20, and today. Adjacent one-offs:
token-spend audits in 6 sessions (B), an in-session time audit (D|b5165a2d), a logging proxy
install (A|af57d146|08-03). A `/reflect` skill (fan-out extraction → cluster → ranked notes file)
standardizes the method and the evidence format. Medium build cost; recurs roughly fortnightly.

## 10. Targeted permission allowances around the ship path — FIX (narrow)

- The auto-mode classifier repeatedly blocks what `workflow-ship` is designed to do:
  "[Merge Without Review]" 15+ denials across all corpora (C|E1, B|E1, A|b98bf3ea, 6x in E),
  answered with typed grants ("je hebt toestemming", "ja jij mag ook mergen").
- Michiel already asked for the fix a month ago: "Permanent toestaan — voeg een
  Bash-permissie-regel voor gh pr merge toe aan je settings, dan vraagt hij dit niet meer"
  (E|ah 04b77ff7|07-17) — it never landed in settings.
- Keep the classifier — it also caught real problems (a `false &&` validation bypass
  C|issue417|07-30; credential materialization D|8f982a0a|08-09). Only pre-authorize the known
  ship-merge step (e.g. allow rules for `gh pr merge` on this repo), not broad classes.

## Deliberately no action

- **Grill/approval marathons** (341 AskUserQuestion calls, one-word answers): working as
  designed — it is how Michiel steers. The cost sits in the gates above, not the dialogue.
- **TaskCreate/TaskUpdate schema errors** (8x pre-08, 5 orca sessions): harness version skew,
  not fixable from this side; already fading.
- **APM source dives** (~173 commands into apm-cli site-packages, B): `docs/apm-behavior.md`
  is the designed answer; the dives were concentrated in the doc's build-up phase.
- **agent-browser `--help` re-reads** (17x in 11 sessions, D): cheap; a cheatsheet would save
  little.
- **Cross-repo skill sync asks**: "sync deze skill ook naar agent-harness / deploy ook lokaal"
  in 10+ sessions (B|A6 3 sessions; E|A-2 7 sessions, incl. the rejected "ik wil gewoon een hook
  om te deployen in claude"). Deliberately not scripted around: this is literally Maestro's
  product surface. The strongest possible prioritization signal for the deploy/promote jobs on
  the board — dogfood the cockpit on agent-harness→local instead of building a side-channel.
- **Per-project re-learning of the same corrections** (E|F-1): maestro's and pm-os's memories
  independently hold the same feedback families (language register, docs condensing, commit
  routing, rtk quirks). Covered if candidate 6 trims the stack and candidate 9's reflect skill
  runs across projects; no separate build.
- **Graphify residue** (B|F2): already uninstalled; the lingering hook error disappeared after
  cleanup sessions.
