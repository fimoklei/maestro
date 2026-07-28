# Which tokenizer defines the 5000-token SKILL.md budget, and does `core` enforce tokens or lines? (#356)

Measured 2026-07-28 against **apm 0.26.0**, **Claude Code 2.1.220**, the
agentskills spec repo at commit `38a2ff8` (2026-07-09), and 798 real
`SKILL.md` files on this machine. Every claim below is a quoted source or a
captured measurement. What could not be measured sits under
[UNMEASURED](#unmeasured).

## Verdict

1. **The number is apm's phrasing of the agentskills.io spec.** Both halves
   are **recommendations**, and apm says so in its own words: *"This is the
   agent-skills convention, not an APM check."*
2. **No source names a tokenizer.** The spec, Anthropic's authoring guide and
   apm's docs are all silent. That silence is the finding — and it is not a
   gap someone forgot to fill, because Claude has **no offline tokenizer to
   name**.
3. **The two limits disagree, badly.** Across 263 real skill bodies the ratio
   runs from 4.8 to 32.7 tokens per line — a 7× spread around the 10:1 the
   budget pair implies. Of the 14 files that break at least one budget, only
   **3 break both**.
4. **`core` should enforce the 500-line proxy and nothing else.** A token gate
   needs either a network call with credentials Maestro deliberately does not
   hold, or a tokenizer that is measurably the wrong one.
5. **No tokenizer dependency survives the standards check.** The only
   Anthropic-published one was last pushed 2024-03-04 and its own README says
   it is inaccurate from Claude 3 onward.

## 1. Where the number comes from

Three sources, one lineage.

**The owner — agentskills.io, read 2026-07-28.** Under *Progressive
disclosure*
([agentskills.io/specification](https://agentskills.io/specification), source
at `docs/specification.mdx:219`):

> 2. **Instructions** (< 5000 tokens recommended): The full `SKILL.md` body is
>    loaded when the skill is activated
>
> Keep your main `SKILL.md` under 500 lines. Move detailed reference material
> to separate files.

Two things to notice. The document **declares no version number** — there is
nothing to pin a Maestro rule against except a commit, and the repo carries no
`CHANGELOG` either. And the two halves have **different units of measurement**:
5000 tokens is scoped to *the body*, 500 lines to *"your main `SKILL.md`"* —
frontmatter included, on a plain reading.

**Anthropic's own guide does not carry the token number at all.** The skill
authoring best-practices page
([platform.claude.com](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
read 2026-07-28) has a section literally headed *Token budgets*, and its whole
content is:

> Keep SKILL.md body under 500 lines for optimal performance. If your content
> exceeds this, split it into separate files using the progressive disclosure
> patterns described earlier.

Its pre-publication checklist says the same: *"SKILL.md body is under 500
lines"*. The string `5000` does not appear on the page. So the party that
invented the format states the budget **in lines only** — the token figure
lives in the community spec.

**apm restates the pair and disclaims it.** Under *Body budget*
([microsoft.github.io/apm](https://microsoft.github.io/apm/producer/author-primitives/skills/),
read 2026-07-28):

> Keep `SKILL.md` under **500 lines and 5000 tokens**.
>
> This is the agent-skills convention, not an APM check, but every harness
> pays a context-window tax for an oversized body.

That sentence is the source of the wayfinder map's *"`SKILL.md` under 500
lines / 5000 tokens"*, and it independently confirms #346's grep: apm never
intended to enforce it. Re-verified on the installed 0.26.0 —
`grep -rn "5000"` and `grep -rniE "max_lines|token_budget|max_tokens|line_limit"`
over `apm_cli` each exit 1; the control `grep -rln "SKILL.md"` exits 0 and hits
16 files.

**The spec's own reference validator enforces neither.** `skills-ref` 0.1.0
(`skills-ref/src/skills_ref/validator.py`, authored by an Anthropic engineer)
checks frontmatter only. Its three constants are `MAX_SKILL_NAME_LENGTH = 64`,
`MAX_DESCRIPTION_LENGTH = 1024`, `MAX_COMPATIBILITY_LENGTH = 500` — the last
being characters of the `compatibility` field, not lines of the body. `grep -rni
"token"` over `skills-ref/src` exits 1. So the budget is advisory **everywhere
that could enforce it**, all the way down to the spec's own tooling.

## 2. Which tokenizer counts

**Nobody says.** Confirmed absent from all three sources above.

The silence is load-bearing, not lazy. **Claude has no offline tokenizer to
name.** Anthropic's shipped guidance (`claude-api` skill,
`shared/token-counting.md`, bundled with Claude Code 2.1.220) is explicit on
both halves:

> Use the `count_tokens` endpoint (`POST /v1/messages/count_tokens`) for
> accurate token counts against Claude models. Token counts are
> **model-specific** — pass the same model ID you'll use for inference.
>
> **Do not use `tiktoken`.** It's OpenAI's tokenizer. It undercounts Claude
> tokens by ~15–20% on typical text, and by much more on code or non-English
> input.

*Model-specific* is the sharper problem. The same guidance records that the
tokenizer introduced with Opus 4.7 counts the same text at **~1×–1.35×** the
Opus 4.6 figure, and that Sonnet 5 counts **~30% more** than Sonnet 4.6. So
"5000 tokens" is not one number even within one vendor's model line, let alone
across the ~45 agents listed on agentskills.io — Gemini CLI, Codex, Copilot and
Cursor each tokenize the same file differently.

What that costs Maestro, per candidate:

| Candidate | What it costs |
| --- | --- |
| Claude's real count (`count_tokens`) | A network call and an Anthropic credential, per skill, per check. Maestro binds `127.0.0.1`, holds no credentials and lets APM own auth (`security.md`). A "too big" verdict would also stop working offline and change under Anthropic when a model ships. |
| `tiktoken` family | The wrong tokenizer by the vendor's own statement. Undercounts by 15–20% on prose and more on code — SKILL.md is prose *and* code. Produces confident false passes near the boundary. |
| Characters ÷ 4 | Free and offline, wrong by an unbounded margin at the boundary, and unattributable to any spec. |

## 3. Do the two limits agree? (measured)

**Corpus.** 798 `SKILL.md` files found under `~/.agents/skills` (the real
directory behind the `~/.claude/skills` symlinks), `~/Projects/agent-harness`,
`~/.claude/plugins` and `maestro/.claude`. De-duplicated to **292 distinct
bodies**; 263 have more than 20 body lines and carry the statistics below.
Body = everything after the closing frontmatter `---`. Tokens counted with
`tiktoken` 0.13.0 `o200k_base` (`cl100k_base` agrees to within 0.6% on every
file). Script: `scratchpad/measure.py`, reproduced in
[Reproducing](#reproducing).

**Tokens per line, by content shape.** "List share" = fraction of non-blank
body lines starting with a list marker or a table pipe.

| Shape | n | median tok/line | p10 | p90 | tokens at 500 lines (tiktoken) | …×1.175 as a Claude estimate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Prose-heavy (<25% list lines) | 39 | **13.22** | 6.60 | 16.89 | 6 609 | ~7 800 |
| Mixed (25–50%) | 86 | 11.57 | 7.50 | 18.22 | 5 784 | ~6 800 |
| List-heavy (≥50%) | 138 | **10.05** | 7.39 | 17.88 | 5 027 | ~5 900 |

The issue's hypothesis holds and then some. A 500-line **prose** body lands at
roughly **6 600 tiktoken tokens — 32% over budget before any Claude
correction**, and near 7 800 with it. A 500-line **list-heavy** body lands
almost exactly on 5 000 by tiktoken, but crosses it once the undercount is
allowed for. The p10/p90 columns matter more than the medians: within *every*
shape the ratio spans better than 2:1, so content shape predicts the ratio only
weakly.

**Which limit bites first, overall.** 58% of the 263 bodies exceed 10
tokens/line by tiktoken; on the Claude-adjusted equivalent that rises to
**78%**. For four skills in five, the token budget is the binding one — while
the line budget is the one every tool checks.

**The two verdicts rarely coincide.** Counting only real, unscaled files:

| | tiktoken | Claude estimate (×1.175) |
| --- | ---: | ---: |
| Over 5 000 tokens | 6 | 29 |
| Over 500 lines | 11 | 11 |
| Over **both** | 3 | 5 |

Fourteen files break at least one budget by tiktoken; **three break both**. The
budgets disagree on 79% of the failures. A cockpit that enforces one and calls
it "the budget" is wrong about most oversized skills.

**The two files that make the point.**

| File | Body lines | Tokens (o200k) | tok/line | Verdict by lines | Verdict by tokens |
| --- | ---: | ---: | ---: | --- | --- |
| `claude-plugins-official/plugins/cwc-makers/skills/m5-onboard/SKILL.md` | 182 | 5 952 | 32.70 | **pass** (36% of budget) | **fail** (119%) |
| `n8n-mcp-skills/skills/command-development/SKILL.md` | 880 | 4 222 | 4.80 | **fail** (176%) | **pass** (84%) |

Two published skills, two budgets, four verdicts, no overlap. `m5-onboard` is
long unbroken prose lines; `command-development` is fenced code and short list
items. Nothing in the spec tells a user which verdict is the real one.

**Maestro's own harness is nowhere near either limit.** Of the 27 `SKILL.md`
files in `agent-harness`, the largest is 309 body lines / 3 560 tokens
(`socratic-explorer`), the token maximum is 4 073 (`47`), and the median ratio
is 10.09 tok/line. No file in the repo Maestro actually validates today would
be rejected by either rule — so the choice below is about correctness under
future content, not about unblocking present content.

**Third-party corroboration that lines is the de-facto rule.** The
`ncoevoet-health-check` plugin ships a skill validator with
`SKILL_MAX_LINES=500`, an `OVER-500-LINES` finding code, and a test fixture
named `tests/fixtures/over-500-lines/`. It has no token check. Its own fixture
is a 519-line body of 7 729 tokens — sized in lines, 55% over the token budget
by accident. #346's fixture had exactly the same blind spot.

## 4. Should `core` enforce tokens at all?

**Recommendation: enforce 500 lines only. Do not gate on tokens.**

The trade-off, named plainly. A line count is free, deterministic, offline,
byte-stable, and explainable in one sentence a user can act on ("your file is
612 lines; the budget is 500"). A token count is none of those. The honest
version of a token gate is a refusal the user cannot argue with, computed by a
tokenizer the spec never chose, that disagrees with the number their own harness
would compute, and that changes when a model they do not control ships. That is
the worst property a gate can have, and §3 shows it would fire on four skills in
five.

Three consequences Maestro should accept out loud rather than paper over:

- **The line rule is a proxy, and a poor one.** It under-reports by roughly 32%
  on prose and passes files like `m5-onboard` that are genuinely 19% over the
  real budget. Enforcing lines is choosing a rule that is *consistently wrong in
  a stated direction* over one that is *unpredictably wrong and unverifiable*.
- **Then call it what it is.** The cockpit should say "over the 500-line
  budget", never "over budget" — the second claims more than Maestro can check.
  How that reads on screen is #351's; the wording of the rule is not.
- **The whole rule is advisory upstream.** Neither the spec, nor Anthropic, nor
  apm, nor `skills-ref` enforces it. If Maestro fails a skill outright on 501
  lines it is stricter than every other party in the chain — which argues for
  a warning that does not block deploy. That is #351's decision; this ticket
  only establishes that Maestro would be inventing the strictness, not
  inheriting it.

Two smaller decisions fall out and want writing down:

- **Count body lines, not file lines.** Anthropic says *"SKILL.md body"*
  twice; apm and the spec say "SKILL.md". Body is the defensible reading (it is
  what gets loaded) and matches Anthropic's wording. Frontmatter is capped
  separately by the `description` and `name` rules `core` already owns from
  #346.
- **Define a line.** Count `\n` and treat a body not ending in a newline as
  having one final line. Trivial, but it is the difference between 500 and 501
  at the boundary, and a spec that pins nothing leaves it to us.

If a token *number* is ever wanted for display (not for a gate), the cheapest
honest option is to show characters and let the user judge — never a token
figure Maestro cannot source.

## 5. The dependency check, if a tokenizer were the answer

Run against `code-standards.md` (last release date, open issues, prefer no
dependency under ~20 lines of logic). All four fail before the size question
is even reached:

| Package | Latest | Last repo push | Open issues | Verdict |
| --- | --- | --- | ---: | --- |
| `@anthropic-ai/tokenizer` | 0.0.4 | **2024-03-04** | 9 | Unmaintained >2 years, and its README states the algorithm *"is no longer accurate"* as of Claude 3 and suggests relying on the API's `usage` instead. |
| `js-tiktoken` | 1.0.21 | 2025-08-09 | 34 | Maintained, but it is OpenAI's tokenizer — wrong by Anthropic's own statement. |
| `@dqbd/tiktoken` | 1.0.22 | 2025-08-09 | 34 | Same repo; WASM build. Same wrongness plus a WASM artifact in a local-first app. |
| `gpt-tokenizer` | 3.4.0 | 2026-02-10 | 4 | Healthiest of the four, still the wrong tokenizer. |

The only package that would give a *correct* Claude answer is the Anthropic SDK
calling `count_tokens` — a network call plus a credential, which
`security.md` rules out for the product (`ApmCliDriver` passes only ambient env
and never injects a token; APM owns credentials, not Maestro).

The chars-÷-4 fallback is under 20 lines and needs no dependency, so the
standard says implement it rather than install anything — but the standard is
about *how* to get a number, not *whether* the number should gate. It should
not.

## Reproducing

```bash
# apm 0.26.0 enforces nothing (control grep exits 0)
APM=~/.local/share/uv/tools/apm-cli/lib/python3.11/site-packages/apm_cli
grep -rn "5000" $APM; echo $?                                    # 1
grep -rniE "max_lines|token_budget|max_tokens|line_limit" $APM; echo $?   # 1
grep -rln "SKILL.md" $APM | wc -l                                # 16

# spec + reference validator
git clone --depth 1 https://github.com/agentskills/agentskills.git
grep -rn "5000" agentskills/docs agentskills/skills-ref          # docs only
grep -rni "token" agentskills/skills-ref/src; echo $?            # 1

# corpus measurement (tiktoken 0.13.0 in a throwaway venv)
python measure.py ~/.agents/skills ~/Projects/agent-harness \
                  ~/.claude/plugins ~/Projects/maestro/.claude > rows.json
```

`measure.py` splits frontmatter on the first closing `---`, counts body lines
as `body.split("\n")`, encodes with `o200k_base` and `cl100k_base`, and
classifies list share with `^\s*(?:[-*+]\s|\d+[.)]\s|\|)`.

## UNMEASURED

- **The real Claude token count of any file.** No `ANTHROPIC_API_KEY` and no
  `ant` CLI on this machine, and Claude Code's own credentials were not
  borrowed for API calls. Every Claude figure here is `tiktoken × 1.175`, the
  midpoint of Anthropic's stated 15–20% undercount — a stated correction, not a
  measurement. It is also a *floor*: the same guidance says the undercount is
  larger on code, and SKILL.md bodies are code-heavy. The direction of the
  finding cannot flip (a larger undercount only strengthens "tokens bite
  first"); the exact percentages can move.
- **What other harnesses count.** Gemini CLI, Codex and Copilot all consume
  the same `SKILL.md` and all tokenize differently. Not measured, and not
  measurable offline.
- **Whether the spec's silence is deliberate.** No issue, discussion or commit
  history was read — the clone was `--depth 1`. Filing a spec issue asking for
  a tokenizer would settle it upstream and is not this ticket's job.
- **Whether apm's docs and its 0.26.0 behaviour will stay aligned.** The
  disclaimer is prose on a docs site with no version marker;
  `docs/agents/apm-upgrade.md` is the re-check path.
