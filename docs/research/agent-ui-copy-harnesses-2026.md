# How the community gets coding agents to write good UI copy (2026)

Read **2026-10-03** against primary sources only: the skill and rule files in
their own repos, vendor docs, tool READMEs and the orgs' own posts. Star counts
and push dates were read from the GitHub API that day. **[inferred]** marks my
reading, not a source's statement. **[unverified]** marks a claim I could not
trace to a primary source. Companion to [969](969-copy-linting-practice.md)
(linting UI copy) and [copy-anchors-govuk-polaris](copy-anchors-govuk-polaris.md);
neither is repeated here.

## Verdict

- **The dominant harness is a UI-copy skill shaped by element.** Each one is a
  table of element forms (button, error, empty state, confirmation, toast) plus
  weak/better pairs. The one with the most use in a real product is Operately's
  `ui-copy`, which SuperPlane adapted with an ASD-STE100 skill on top.
- **Anti-AI-tell lists are everywhere but are the weaker half.** humbleteam's
  skill states the limit: a line can pass every tell check and still fail its
  element's job ("Nothing here yet.", "Submit").
- **The process fixes that commenters report are copy first, then code.**
  They write strings to a Markdown file or translation file, have a person
  edit them, then build the UI.
- **Only one measured result exists, and it is small.** KoukeNeko's
  `ui-microcopy` gained +8 pp on held-out briefs. Its first version, which
  started by cutting words, lost up to 15.7 pp of required facts.
- **Design-system MCP servers serve components, not content rules.** Ditto is
  the exception: an MCP that serves a copy style guide and approved strings.

## 1. Harness approaches, ranked by evidence of payoff

| # | Approach | Who does it (primary source) | Evidence | Cost |
|---|---|---|---|---|
| 1 | **Element-shaped copy rule**: one form per element, verb+object buttons, cause+fix errors, named consequence in confirmations | Operately [`ui-copy`](https://github.com/operately/operately/blob/main/.agents/skills/ui-copy/SKILL.md) (563★ repo); SuperPlane [`ui-copy`](https://github.com/superplanehq/superplane/blob/main/.agents/skills/ui-copy/SKILL.md) (7.7k★); [humbleteam/ux-writing](https://github.com/humbleteam/ux-writing); [content-designer/ux-writing-skill](https://github.com/content-designer/ux-writing-skill) (218★) | Used in production repos; no measurement | Low |
| 2 | **Copy deck before code**: strings go to a Markdown file or translation file, a person edits them, then the agent builds | HN "Tells of a Slop UI" commenters `alin23` ("always write the copy in a Markdown file and let me edit it before actually coding the UI") and `vallerie` (translation file, then edit) ([thread](https://news.ycombinator.com/item?id=49867038)); UX Content Collective: map the journey and set up a glossary before prompting ([post](https://uxcontent.com/dont-vibe-code-your-content/), 2025) | Practitioner reports only | Low |
| 3 | **Weak/better pairs (few-shot)** for each element | Anthropic: examples are "one of the most reliable ways to steer Claude's output format, tone, and structure"; use 3–5 ([prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)); every skill in row 1 ships pairs | Vendor guidance | Low |
| 4 | **Fact slots, not guesses**: a line missing a count or cause gets `<n>`/`<cause>` and a `Needs:` question | [humbleteam SKILL.md](https://github.com/humbleteam/ux-writing/blob/main/SKILL.md) steps 2c/3c, self-check 8 | KoukeNeko: unaided models filled notes whose brief listed no facts 88% of the time, the skill 0% ([README](https://github.com/KoukeNeko/ui-microcopy/blob/main/README.en.md#measurement)) | Low |
| 5 | **Plain-language standard as a separate skill** (ASD-STE100: ≤20 words for instructions, ≤25 for descriptions, no contractions, one term per concept) | SuperPlane [`simplified-technical-english`](https://github.com/superplanehq/superplane/blob/main/.agents/skills/simplified-technical-english/SKILL.md): "If UX tone and STE conflict, choose the clearer STE wording" | Production use | Low |
| 6 | **Ordered procedure: facts, then form, then cutting** | KoukeNeko `ui-microcopy`: "a procedure that begins with deletion removes required facts"; measured on 32 held-out briefs, 7 model channels, 2 cross-family judges, 108 blind human ratings ([eval repo](https://github.com/KoukeNeko/ui-microcopy-eval)) | +8 pp net pass [+1, +15]; author calls these development figures. 0★, one author | Low |
| 7 | **String store as agent context (MCP)**: agent reads the style guide and reuses approved strings before writing | [Ditto MCP](https://help.dittowords.com/en/articles/14122778-ditto-mcp-for-ai-agents) (2026-04-22): "Before writing something new, your AI agent searches your Ditto projects … for strings that already exist" | Vendor case study: Collibra audited 2,700 strings in a day **[unverified: vendor claim, not opened]** | SaaS + migration |
| 8 | **Anti-tell list or linter** (Vale styles, PostToolUse hook) | [Syntaf/vale-llm-slop](https://github.com/Syntaf/vale-llm-slop) (26★, adds optional STE style); [thrash-d/slop-linter](https://github.com/thrash-d/slop-linter) (Claude Code `PostToolUse` hook that "lints what Claude writes as it writes it", but lints only comments, "never strings"); [edmundmiller/vale-llm-cliches](https://github.com/edmundmiller/vale-llm-cliches) | None for UI strings; 969 found UI-wording lint rare and noisy | Medium |
| 9 | **LLM-as-judge rubric / eval set** | Anthropic: "Create evaluations BEFORE writing extensive documentation"; three scenarios plus a baseline without the skill ([skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)); UX Content Collective: judges give coverage, "accuracy and reliability may not be guaranteed" ([post](https://uxcontent.com/ai-evaluation-content-design/)) | Only KoukeNeko ran one for UI copy | High |
| 10 | **Design-system MCP / schema** | Atlassian ADS MCP and schemas (+4.9% code accuracy, −11% errors; [post](https://www.atlassian.com/blog/ai-at-work/teaching-ai-to-speak-our-design-language), 2026-06-02); [Primer MCP](https://primer.style/product/getting-started/foundations/mcp/) tools cover components, icons and `review_alt_text`; Shopify AI Toolkit Polaris skills cover UI code | Measured for **code**, not copy. No content-guideline tool found in Primer or Shopify; Atlassian's posts do not say the MCP serves voice-and-tone **[unverified]** | Org-scale |

## 2. What the skills contain

**Common core** (Operately, SuperPlane, humbleteam, content-designer,
ill-communication, Anthropic `frontend-design`):

- Name the button by its outcome (`Save changes`, not `Submit`). Keep one
  verb through the flow: Anthropic's [`frontend-design`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
  says "the button that says 'Publish' produces a toast that says 'Published.'"
- Write an error as what happened, then how to fix it. "Errors don't
  apologize" (`frontend-design`). No "Oops".
- Make a confirmation name the object and what happens (humbleteam's
  "Unnamed consequence" row).
- Use one term per concept. SuperPlane lists its approved product nouns and
  bans "internal package paths, proto message names, worker names, or DB
  table names" in UI.
- Use sentence case, no humour in errors or destructive flows, and no
  promotional adjectives.
- Before drafting, match the copy nearby. Operately, step 2: "Find nearby
  existing copy and match the product vocabulary, casing, tense, and tone."

**Details that only some skills add**

- **Two separate checks** (humbleteam). The tell table reports what was cut
  (`Removed:`). The element rule reports what the line never had (`Rule:`).
- **Know when not to rewrite** ([ill-communication](https://github.com/alexconner-79/ill-communication/blob/main/SKILL.md)):
  leave legal, consent and verbatim text alone; flag it instead.
- **Register drift** ([KoukeNeko](https://github.com/KoukeNeko/ui-microcopy/blob/main/README.en.md)):
  models write a button "as an answer" and a status "as spoken report", and
  add notes about where a number came from. Its linter targets those
  patterns in zh-TW/EN/JA.
- **Leaked chat context**: UI text that repeats the prompt or the build story
  ("Built with Hugo. Written from Neovim"). Tell #8 in the
  [post](https://godobject.dev/blog/10-tells-of-slop) the HN thread links.

**The sources disagree on the basics.** Vercel's
[Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/README.md)
(926★, aimed at agents) require **Title Case** buttons, prefer `&`, and give
"Something went wrong—try again or contact support" as a good error. Every
skill in row 1 bans all three. **[inferred]** A stock skill is no house
standard; whichever one is loaded last decides.

## 3. Content design systems as agent input

| System | Machine-readable form | Turned into agent rules? |
|---|---|---|
| GOV.UK | HTML guidance; [`tech-docs-linter`](https://github.com/alphagov/tech-docs-linter) Vale rules | Community only: fofr's [`govuk-style`](https://gist.github.com/fofr/505e225f9bf5e839d30c12ba6bfa0be2) skill (prose, 2026-06); [govuk-design-system-skill](https://github.com/chrisjohnleah/govuk-design-system-skill) (components) |
| Shopify Polaris | Content pages retired; archive repo only (see [copy-anchors](copy-anchors-govuk-polaris.md)) | Official AI Toolkit skills cover code, not copy |
| Atlassian | TypeScript schemas → ADS MCP, skill, DESIGN.md ([post](https://www.atlassian.com/blog/ai-at-work/atlassian-design-system-building-the-context-engine-for-the-ai-era), 2026-05-28) | Official, but content coverage not confirmed **[unverified]** |
| GitHub Primer | `@primer/mcp` | Official; no content-guideline tool listed |
| Microsoft Writing Style Guide | [`vale-cli/Microsoft`](https://github.com/vale-cli/Microsoft) | Vale only; no agent skill found |
| Mailchimp | Markdown in [`mailchimp/content-style-guide`](https://github.com/mailchimp/content-style-guide) | No agent skill found |
| ASD-STE100 | Copyrighted standard | Rules (not the dictionary) distilled by SuperPlane and in Syntaf's STE Vale style |

## 4. Vendor guidance that bears on copy

- **Anthropic**: tell Claude what to do, not what to avoid ("Instead of: 'Do
  not use markdown' … Try: 'smoothly flowing prose'"). Give the reason behind
  a rule. Match the prompt's style to the output. Use 3–5 relevant, varied
  examples ([prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)).
  A style-guide skill should run a loop: draft, check against the checklist,
  revise, and continue only once every check passes
  ([skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
- **OpenAI**: the current prompt guide asks for "familiar words, concrete
  examples, and precise verbs". It lists stock phrases to drop ("delve",
  "leverage", "In short") and warns against unprompted "X, not Y" framing
  ([prompt guidance](https://developers.openai.com/api/docs/guides/prompt-guidance)).
  The GPT-5 frontend cookbook and Apps SDK UI guidelines give no copy
  guidance.

## 5. Community diagnosis (why agent copy is bad)

- **Too much text that explains.** "Scroll and scroll through walls of text";
  the fix offered was "Remove all non-salient text from this app" (HN
  `minimaxir`, [thread](https://news.ycombinator.com/item?id=49867038)).
- **Implementation talk leaks into the UI.** One commenter's rule set:
  "No tech stack. Do not say the tech implementation" (HN `jph`, same thread).
- **Hype vocabulary.** "Elevate", "Seamless", "Supercharge"
  ([10 tells](https://godobject.dev/blog/10-tells-of-slop), 2026-09-27).
- **Chat-reply register and invented facts.** KoukeNeko README, measured
  above.
- **The words get fixed last.** "Don't prompt a chatbot to 'write onboarding
  copy' before you've mapped the onboarding journey" (UX Content Collective).

## Gaps vs Maestro's current harness

Maestro already does what most skills recommend. `copy.md` has an element
forms table, outcome-first ordering and a reuse-by-grep step. Its sibling
tests pin approved strings, `CONTEXT.md` fixes screen nouns, `copy-guard`
blocks retired words, and screens are checked in the browser. The gaps, by
expected payoff:

1. **The always-on writing skills conflict with the copy rule.** `unslop`
   ("Must always apply") says "avoid em dashes entirely". `copy.md`'s
   blocked-control form is `Update target — no GitHub origin`. `unslop` also
   says to add soul: "Have opinions", "Use 'I' when it fits", "Let some mess
   in". `PRODUCT.md` asks for terse copy with no "you" or "we".
   `writing-clearly-and-concisely` is Strunk (1918) on general prose, with no
   element forms. SuperPlane settles this with one precedence line ("If UX
   tone and STE conflict, choose the clearer STE wording"). **Fix:** one
   line in `copy.md` saying it outranks both skills for shipped strings, and
   scope `unslop`'s voice section out of UI copy. Cheapest change, and it
   removes a silent source of wrong drafts.
2. **No copy deck before code.** Today strings are written with the code and
   approved in the diff. The community fix is a table of every new or changed
   string, with its screen, state and trigger. Michiel edits it before the UI
   is built (HN; UX Content Collective; humbleteam's output format). For a PM
   reviewer, a table beats reading JSX.
3. **One calibration pair where vendors advise 3–5 for each form.** `copy.md`
   has a single weak/outcome-first pair. Add pairs for Notice, blocked
   control, empty state and dialog. Take them from the 21 shipped defects
   969 counted (#845–#889), so the examples match Maestro's real failures.
4. **No "slot, don't guess" rule.** Step 1 says to check the implemented
   behaviour. It does not say what to do when the cause or count is unknown.
   Add: write `<cause>` and ask, never write a plausible cause. Also add
   leaked context to the reread step, meaning text that describes how the
   copy or data was produced, or repeats the prompt. The KoukeNeko 88% → 0%
   figure is the evidence.
5. **The writer reviews its own copy.** The copy review is done by the agent
   that wrote it. `writing-clearly` already describes sending a draft to a
   subagent. Mozilla reviews strings with only the string and its comment
   (969). A fresh subagent given the rendered screenshot and `copy.md`, and
   not the code, would catch text that only makes sense to its writer.
6. **No eval set for the copy rule.** Anthropic's advice is to write
   evaluations first, three scenarios plus a baseline without the skill.
   Five briefs from past defects, rerun after each `copy.md` change, would
   show whether an amendment helps. Higher cost; do it after 1–4.

Not recommended: Vale or slop linters on UI strings (969 measured mostly
false positives on approved copy), Ditto or other string-store MCPs (too much
for a solo, English-only product), and design-system MCPs (none serve
content rules).
