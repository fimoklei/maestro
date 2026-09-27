# Pocock's coding standards, retro, and why no `.claude/rules/`

Measured 2026-09-27 against these commits:

- `mattpocock/skills` @ [`c55ee46`](https://github.com/mattpocock/skills/tree/c55ee46073ed923f86ce59a5eb3b6d895095d1b7) (`SK` below)
- `mattpocock/course-video-manager` @ [`1eccc78`](https://github.com/mattpocock/course-video-manager/tree/1eccc78781bd38e00e9a6ceb4a233c3bdc262925) (`CVM`)
- `mattpocock/sandcastle` @ [`e99f832`](https://github.com/mattpocock/sandcastle/tree/e99f832f26dc9d245c019a9ddd19fa5dee792427) (`SC`)
- `mattpocock/dictionary-of-ai-coding` @ [`ed1ebed`](https://github.com/mattpocock/dictionary-of-ai-coding/tree/ed1ebed3975cba04ed5e74c6ca73659274beb754) (`DICT`)
- `fimoklei/maestro` @ [`25a7ae0`](https://github.com/fimoklei/maestro/tree/25a7ae078d75a05b560859c5155de1a749537bf3) (`M`)

Anything marked **inference** is my reading, not something a source states.

## 1. The concept

**Filename:** `CODING_STANDARDS.md`, in upper case. It sits at the repo root in CVM. In the Sandcastle templates and older repos it sits in `.sandcastle/`. It is plain Markdown: `##` topic headings, and each rule is a heading plus a short prose paragraph. It has no frontmatter and no path scoping.

**Skills that reference it.** Only two do:

- `code-review` (stable) reads it. Step 3 says: *"Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`."* It also adds a Fowler smell baseline, and *"The repo overrides."* The standards sub-agent must *"cite the standard (file + the rule)"*. ([SK code-review/SKILL.md L34-41, L60-64](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/code-review/SKILL.md#L34-L64))
- `retro` (in-progress) decides what goes into the file (see §2).
- `tdd`, `codebase-design`, `domain-modeling` and `implement` do not mention it. `implement` only closes with `/code-review` ([SK implement/SKILL.md L13](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/implement/SKILL.md#L13)). `tdd` sends refactoring to the review stage ([SK tdd/SKILL.md L38](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/tdd/SKILL.md#L38)).

**Local copies.** `~/.claude/skills/{code-review,tdd,codebase-design,domain-modeling,implement}` are byte-identical to upstream (`diff -rq`). The local `retro` differs only by a trailing newline.

**The design intent.** The file is read during review, not during implementation:

> `CODING_STANDARDS.md`: this file is read during review, not implementation.
> ([SK retro/SKILL.md L42](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/retro/SKILL.md#L42))

> the review agent should be responsible for imposing coding standards, not the implementation agent. ([L35](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/retro/SKILL.md#L29-L35))

## 2. How standards get created and updated

**The skill is `retro`.** It is in `skills/in-progress/`, has `disable-model-invocation: true`, and runs only when the user invokes it ([SK retro/SKILL.md L1-5](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/retro/SKILL.md#L1-L5)). The in-progress README still calls it *"STUB: design notes only, not functional yet"* ([SK in-progress/README.md L19](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/README.md#L19)). The SKILL.md itself has working steps; they were added in commits `8fa1886`, `6654f6b` (2026-08-24) and `0243b6e` (2026-09-15).

**Steps** ([L9-25](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/retro/SKILL.md#L9-L25)):

1. Load `writing-for-agents`.
2. Read the session logs. The default is the current session.
3. Look for candidates in seven categories: Navigation, Automated checks, Coding standards, Global AGENTS.md, Tool economy, No-ops and Information access.
4. *"Present these candidates to the user, in order of severity."*

**What it writes:** nothing. It proposes changes, and the human decides and edits. No promotion criteria exist beyond that approval.

**The standards rule** (L19, from `0243b6e`, [changeset](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/.changeset/retro-deterministic-checks.md)):

- Classify every violation first.
- A **mechanical** violation gets a deterministic check, "full stop". That can be a linter rule, a pre-commit hook or a CI job.
- `CODING_STANDARDS.md` is only for **judgement calls**.
- A repo with no guardrail at all is a finding in its own right.
- AGENTS.md steering that could be a standard or a check should move there (L20).

**The loop as designed:**

1. The implementer works with a thin CLAUDE.md.
2. `/code-review` checks the diff against `CODING_STANDARDS.md` plus the smell baseline.
3. The human runs `/retro` and gets proposals.
4. The human edits the standards file, or adds a check.
5. The next review enforces the change.

**The loop in practice:** CVM has no commit that mentions "retro" (`git log -i --grep=retro` returns 0 commits). §3 shows where the entries came from instead.

## 3. Real use

**course-video-manager.** The files are [`CODING_STANDARDS.md`](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/CODING_STANDARDS.md) (216 lines) and [`docs/TESTING_STANDARDS.md`](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/docs/TESTING_STANDARDS.md) (100 lines).

- **The shape of an entry.** Each rule gets a heading. The prose states the rule, then *"What a leak costs, from this repo"*: a real incident with numbers. It closes with when the rule may be broken, e.g. *"An `any` survives review when…"*. ([L29-56](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/CODING_STANDARDS.md#L29-L56), [L60-101](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/CODING_STANDARDS.md#L60-L101))
- **How it is read.** A CLAUDE.md pointer ([L48-50](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/CLAUDE.md#L48-L50)) says: *"Read it while writing code, not only while reviewing it"*. The Sandcastle review prompt feeds the file to `code-review` as its standards source ([.sandcastle/review/prompt.md L9, L45-51](https://github.com/mattpocock/course-video-manager/blob/1eccc78781bd38e00e9a6ceb4a233c3bdc262925/.sandcastle/review/prompt.md#L45-L51)).
- **History:** 20 commits from 2026-04-14 to 2026-09-26. Matt Pocock made 14 (most co-authored by Claude), `claude-code[bot]` made 4 and `github-actions[bot]` made 2.
  - The bot commits are "RALPH: Review" passes that codify a pattern the review found. Example: [`9c5b73a`](https://github.com/mattpocock/course-video-manager/commit/9c5b73a4) adds the "trivial function test" anti-pattern *"per owner feedback"*.
  - Recent entries each come from one incident PR. [#1741](https://github.com/mattpocock/course-video-manager/commit/044f015f) adds "every `any` is a leak" from #1737, where a 500 error slipped past a green typecheck. [#1745](https://github.com/mattpocock/course-video-manager/commit/5a22188a) adds the Draft guard rule, after about 250 writes stranded on a published Version, and also prunes no-ops.
- **Removals.** Rules leave the file when a check takes them over. [#1667 `803832f`](https://github.com/mattpocock/course-video-manager/commit/803832fa) turned four standards into oxlint and script checks and removed them from the file. [`b70ddcb`](https://github.com/mattpocock/course-video-manager/commit/b70ddcb5) then deleted the leftover table.
- **Where the file lives.** [#1741](https://github.com/mattpocock/course-video-manager/commit/044f015f) moved it out of `.sandcastle/` to the root. The reason given: *"Standing there made it the reviewer's file. The `any` rule binds the hand that writes the cast."* Pocock's own practice is drifting toward reading standards at implementation time. That reading still comes through a pointer, not through auto-loading.

**Other repos.** GitHub code search for `CODING_STANDARDS` finds two more:

- **Sandcastle** ships it as a template file ([sequential-reviewer/CODING_STANDARDS.md L3-5](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/templates/sequential-reviewer/CODING_STANDARDS.md#L3-L5)). The review prompt includes it with `@.sandcastle/CODING_STANDARDS.md`.
- **mise-en-place** has one commit on it (`3f78352`, 2026-05-08). It is not actively used.

## 4. Why no `.claude/rules/`

**Explicit statements.** None mention `.claude/rules/` by name. I searched the skills repo text, its issues, Sandcastle and the dictionary. These statements come closest:

- Sandcastle template: standards are loaded by the reviewer *"so these standards are enforced during review without costing tokens during implementation"* ([SC L3-5](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/templates/sequential-reviewer/CODING_STANDARDS.md#L3-L5)).
- Retro: CLAUDE.md/AGENTS.md *"should be used incredibly sparingly, usually only for **navigation pointers**"* ([L41](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/in-progress/retro/SKILL.md#L41)).
- Dictionary: always-loaded content *"pays a token cost every turn"* and *"dilutes itself"*. The recommended fix is skills or context pointers ([DICT AGENTS.md.md L11-13](https://github.com/mattpocock/dictionary-of-ai-coding/blob/ed1ebed3975cba04ed5e74c6ca73659274beb754/dictionary/AGENTS.md.md#L11-L13), [Progressive disclosure.md](https://github.com/mattpocock/dictionary-of-ai-coding/blob/ed1ebed3975cba04ed5e74c6ca73659274beb754/dictionary/Progressive%20disclosure.md)).

**What `.claude/rules/` actually does** ([Claude Code docs, memory § Organize rules](https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/)):

- *"Rules without `paths` frontmatter are loaded at launch with the same priority as `.claude/CLAUDE.md`."*
- Rules with `paths:` load *"when Claude reads files matching the pattern, not on every tool use"* ([§ Path-specific rules](https://code.claude.com/docs/en/memory#path-specific-rules)).
- The feature is Claude Code only.

**Structural reasons (inference):**

1. **Loaded at the wrong stage.** Pocock wants standards applied at review, by an agent that is under little context pressure. Rules load into the implementer's context, which is the agent he wants to keep thin.
2. **Triggers do not fit review.** A path-scoped rule fires when a file is read. A review sub-agent works from `git diff` output, so it may never read the matched files, and scoped rules would not fire for it. One file handed to the reviewer by name is deterministic.
3. **Tool-agnostic.** The skills target "Claude Code, Codex, and other coding agents" ([SK README L86](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/README.md#L86)). They ship `agents/openai.yaml` beside each skill, and Sandcastle runs its prompts in containers. A plain file named in a prompt works in every tool. `.claude/rules/` works only in Claude Code.
4. **One citable source.** `code-review` has to cite "file + the rule". A single file with headings makes each citation cheap, and retro caps the file at about 1,000 lines before it splits.

## 5. Compared with Maestro

**Finding A: the routing in Maestro's AGENTS.md is a no-op in Claude Code.**

- None of `M/.claude/rules/*.md` has `paths:` frontmatter (`grep '^paths:'` exits 1).
- So all nine files (635 lines), plus AGENTS.md (149 lines), load at every launch. This session's system context shows all of them injected.
- The `### When X → Read .claude/rules/Y.md` lines ([M AGENTS.md L64ff](https://github.com/fimoklei/maestro/blob/25a7ae078d75a05b560859c5155de1a749537bf3/AGENTS.md#L64)) therefore route nothing in Claude Code. They do route for Codex, which does not auto-load the files.

**Finding B: `/code-review` in Maestro reviews against an almost empty source.**

- The skill looks for `CODING_STANDARDS.md` or `CONTRIBUTING.md`.
- [`M/CODING_STANDARDS.md`](https://github.com/fimoklei/maestro/blob/25a7ae078d75a05b560859c5155de1a749537bf3/CODING_STANDARDS.md) is 0 bytes. It was added empty in `a63baa21` on 2026-09-26.
- [`CONTRIBUTING.md`](https://github.com/fimoklei/maestro/blob/25a7ae078d75a05b560859c5155de1a749537bf3/CONTRIBUTING.md) covers the contributor process, not code rules.
- So the Standards axis in practice runs only the Fowler baseline. Unless a reviewer happens to find `.claude/rules/`, it never cites them. **Inference:** whether a sub-agent gets them depends on whether sub-agents inherit project rules. I did not measure that.

**Maestro has what Pocock lacks:**

- `LEARNINGS.md`: dated entries, a filter question, and a Tentative → Active promotion step. It is captured mid-session by the agent.
- Domain driver rules (`apm-driver.md`, `gh-driver.md`) tied to measured research files.

Pocock has no store for tool-behaviour facts. His standards hold only code judgement calls.

**Pocock has what Maestro lacks:**

- A review-time standards source that the review skill actually reads.
- The "mechanical → build a check" rule.
- A session retro that audits the whole environment: navigation, tool economy, no-ops.
- Incident-backed entries that say when a rule may be broken.

**Conflict.** Pocock's entries carry their rationale and the incident behind them inside the standards file. Maestro's rule files are "instruct, never explain", and the reasoning goes into commits and ADRs. This is defensible while the files load at implementation time (**inference**): brevity costs less there. A review-time file could afford the story.

## Patterns to adopt

1. **Pick one loading model per rule file, then make the routing true.**
   - Rules that apply to a set of files get a `paths:` glob. Examples: `testing.md` → `**/*.test.*`; `frontend.md` and `design.md` → `packages/web/**`; `copy.md` → `packages/web/src/**/*-copy.ts`.
   - Rules that apply everywhere (security, architecture) stay unscoped.
   - Then drop the AGENTS.md "→ Read" lines for scoped files, or keep them only as the Codex path.
2. **Fill `CODING_STANDARDS.md` as an index** that points to `.claude/rules/*.md`, the way Pocock's pointers work. `/code-review` then cites Maestro's real rules with no fork of the skill. Do not copy the rules into it.
3. **Add Pocock's gate to promotion.** Before a LEARNINGS entry or a review finding becomes a rule, ask whether Biome, knip or a `scripts/` guard can enforce it. If one can, build the check and leave the rule out of prose. [CVM #1667](https://github.com/mattpocock/course-video-manager/commit/803832fa) is the model.
4. **Run `/retro` (already installed) now and then** to find no-ops and navigation gaps. Its "Coding standards" findings go to rule files or checks. Tooling facts go to `LEARNINGS.md`.
5. **Keep `LEARNINGS.md` and the driver rules.** Pocock has no equivalent, and they cover a different kind of knowledge.
6. **Optional:** end a rule with its "survives review when…" exception. It is one line and costs no rationale.
