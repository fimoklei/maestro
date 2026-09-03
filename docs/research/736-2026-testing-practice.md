# 736 — What changed in testing practice by 2026

Research for map #734 ("Modernise the test setup for a solo developer"). Every
claim below carries the source that owns it. Where a primary source was looked
for and not found, that is written down as a gap, not filled with a guess.

**Measured 2026-09-03, in this worktree.** Vitest 4.1.11 installed; latest
published `vitest` is 5.0.0 (npm registry, published 2026-09-03). jsdom
declared `^25.0.1`; latest published is 30.0.1 (2026-07-29). `nwsapi` pinned to
2.2.25; latest published is 2.2.27 (2026-08-30).

Constraints this report is judged against, from #734: solo developer; coding
loop (`core` + `web`) under 30s; CI gate under 5 minutes; Vitest stays
(ADR-0002); coverage is a map, not a target; anything needing recurring human
attention at a new moment is rejected; a browser lane is out of scope for this
effort.

---

## 1. Vitest 4 — what this repo is not using

### Already adopted

The `projects` model. `vitest.workspace.ts` was deprecated in Vitest 3.2 and
its file form removed in 4.0; projects must be declared inline in the root
config
([migration guide](https://v4.vitest.dev/guide/migration),
[Vitest 3.2 blog](https://vitest.dev/blog/vitest-3-2.html)).
`vitest.config.ts` here already declares three inline projects and `--project`
selects a lane. Nothing to do.

### Coverage — the one clear adoption

`v8` is the default provider. Since 3.2 the v8 provider uses AST-based
remapping, "which produces identical coverage reports to Istanbul", and v8 has
"faster execute times than Istanbul" with "lower memory usage"
([coverage guide](https://vitest.dev/guide/coverage.html)). The
`coverage.experimentalAstAwareRemapping` flag was removed in 4.0 because the
behaviour became built in; `coverage.all` and `coverage.extensions` were
removed at the same time ([migration guide](https://v4.vitest.dev/guide/migration)).

The point that matters for #734's framing ("coverage is a map: which files
never run"):

> "By default Vitest will show only files that were imported during test run.
> To include uncovered files in the report, you'll need to configure
> `coverage.include`."
> — [coverage guide](https://vitest.dev/guide/coverage.html)

So a default `--coverage` run answers the wrong question. Producing the map
this repo actually wants requires setting `coverage.include`. That is one
config block and one npm script.

4.1 added `coverage.changed`, which limits *coverage reporting* to changed
files while still running all test files
([Vitest 4.1 blog](https://vitest.dev/blog/vitest-4-1.html), 2026-03-12).

**Verdict: adopt.** Cost is a config block plus an on-demand script; it does
not enter the coding loop or the CI gate. No percentage threshold — a
threshold is exactly the "recurring human attention at a new moment" #734
rejects.

**Gap:** no primary source states a runtime multiplier for v8 coverage on a
suite this size. Measure it before wiring it anywhere timed.

### The `agent` reporter — free, and aimed at this repo's situation

4.1 shipped a reporter "designed to reduce token usage" that "only displays
failed tests and their errors, suppressing passed test output and console logs
from passing tests", and Vitest "automatically activates it when detecting AI
coding agent environments"
([Vitest 4.1 blog](https://vitest.dev/blog/vitest-4-1.html)).

**Verdict: adopt, but verify it is actually engaging.** This repo runs its
tests through `scripts/run-tests.mjs`; auto-detection is worth confirming
rather than assuming. Zero recurring cost.

### Test tags — a cheaper lever than a fourth lane

4.1 added tags: label tests, "filter tests by tag or apply shared options —
like a longer timeout or automatic retries — to every test with a given tag",
with `and` / `or` / `not` / wildcard filtering
([Vitest 4.1 blog](https://vitest.dev/blog/vitest-4-1.html)).

**Verdict: hold, but note it.** The root config's 20s `testTimeout` exists
because worker pools oversubscribe the machine. A tag is a way to give the
handful of genuinely slow tests a long timeout without granting every test
20 seconds. That is a real cleanup, but it is a consequence of whatever lane
decision #734 lands, not an input to it.

### `--detect-async-leaks`

4.1 added a flag that uses `node:async_hooks` to report "leaked timers,
handles, and unresolved async resources" with source locations
([Vitest 4.1 blog](https://vitest.dev/blog/vitest-4-1.html)).

**Verdict: keep in the toolbox, do not wire in.** It is a debugging flag for
the next flake, not a standing gate.

### Annotations

`context.annotate(message, type?, attachment?)` landed in **3.2**, not 4
([test annotations guide](https://vitest.dev/guide/test-annotations),
[Vitest 3.2 blog](https://vitest.dev/blog/vitest-3-2.html)). Reporter support
varies: JUnit puts them in `<properties>`, the GitHub Actions reporter prints
them as notices/warnings, TAP prints `#` lines.

**Verdict: reject.** Annotations pay off when someone reads a CI report to
understand a run they did not watch. Solo, with the run on screen, they buy
nothing.

### Browser Mode

4.0 removed the "experimental" tag from Browser Mode. Providers became
separate packages (`@vitest/browser-playwright`, `@vitest/browser-webdriverio`,
`@vitest/browser-preview`), `preview` is no longer the default, and the context
import moved from `@vitest/browser/context` to `vitest/browser`
([Vitest 4 blog](https://vitest.dev/blog/vitest-4)). 4.0 also added visual
regression testing, `toBeInViewport`, and Playwright trace generation.
To run in CI, "you need to install either playwright or webdriverio"
([browser guide](https://vitest.dev/guide/browser/)).

**Verdict: out of scope, per #734's own ruling of 2026-09-03.** Recorded here
because §2 is about to argue the case against jsdom, and the honest answer is
that the case is real and the decision was still deferred deliberately.

### Vitest 5 — released the same day this was written

Vitest 5.0.0 published 2026-09-03 (npm registry). Its announcement claims
speed gains of "8% to 25% depending on configuration", with "the biggest wins
… in the vm pools, in Browser Mode, and in large isolated suites"; projects now
inherit the root config including Vite options; coverage moved to maintained
`@vitest/istanbuljs` packages with bounded-memory report merging; requires
Vite >= 6.4.0 and Node >= 22.12.0
([Vitest 5 blog](https://vitest.dev/blog/vitest-5)).

**Verdict: defer, revisit in a few weeks.** The claimed wins land in pools this
repo does not use (vm, browser). Config inheritance would tidy the duplicated
`testTimeout` across the three project blocks. Adopting a major on release day,
solo, buys the ecosystem's bugs — and the `nwsapi` incident below is a fresh
reminder of what a same-week dependency bump costs here.

---

## 2. The jsdom question

### jsdom is not dying

jsdom 30.0.1 shipped 2026-07-29, three days after 30.0.0
([jsdom releases](https://github.com/jsdom/jsdom/releases); dates confirmed
against the npm registry). The "jsdom is abandoned" framing is false. Note
separately that this repo declares `jsdom ^25.0.1` while 30 is current — five
majors behind.

### But its selector engine broke, and is still broken

`nwsapi` is jsdom's CSS selector engine. Three open issues, all filed within
five days of each other, all against 2.2.26+:

| Issue | Title | Opened |
|---|---|---|
| [#171](https://github.com/dperini/nwsapi/issues/171) | performance regression on jest jsdom with 2.2.26 vs 2.2.25 — pseudo state rewrite | 2026-08-30 |
| [#172](https://github.com/dperini/nwsapi/issues/172) | 2.2.26+: `matches(':modal')` recurses to stack overflow under jsdom — ~1.3s per call, always returns false | 2026-08-31 |
| [#177](https://github.com/dperini/nwsapi/issues/177) | `:modal` matching recursively calls `Element.matches()` under jsdom since 2.2.26 | 2026-09-03 |

`:modal` matches an open `<dialog>`. Radix renders its menus and dialogs that
way, which is why every Testing Library query against an open menu in this repo
hangs.

**Measured here, 2026-09-03.** I lifted the pin to `nwsapi@2.2.27` and ran
`pnpm test:web`:

| | web lane |
|---|---|
| Pinned to 2.2.25 (baseline, #734) | 1209 pass / **20s** |
| nwsapi 2.2.27 | 1185 pass, **24 failed** (timeouts), 7 files failed / **293s** |

The pin is reverted; the tree is unchanged. **2.2.27 does not fix it.** The
existing override in `pnpm-workspace.yaml` is correct and must stay until one
of those three issues closes.

There is also long precedent: nwsapi 2.2.3 hung Jest suites
([jest#14065](https://github.com/jestjs/jest/issues/14065)), 2.2.6 broke ~205
Jest+RTL tests ([nwsapi#90](https://github.com/dperini/nwsapi/issues/90)), and
2.2.23+ generated malformed selectors
([nwsapi#157](https://github.com/dperini/nwsapi/issues/157)). jsdom has an
in-progress PR to replace nwsapi with `@asamuzakjp/dom-selector`
([jsdom#3854](https://github.com/jsdom/jsdom/pull/3854)) after an earlier swap
was reverted in v24 for performance.

### What the named authors actually say

- **Artem Zakharchenko**, ["Why I Won't Use JSDOM"](https://www.epicweb.dev/why-i-won-t-use-jsdom),
  2025-01-28: jsdom "runs in Node.js, pretends to be a browser but ends up
  being neither"; cites event-dispatch incompatibilities with Node's native
  `EventTarget`, patched globals, and wrong module export-condition resolution.
  Recommends Vitest Browser Mode as the primary choice.
- **Kent C. Dodds**, author of Testing Library, [on X](https://x.com/kentcdodds/status/1767305104011444542):
  "Testing Library does not use JSDOM… it's JSDOM that's slow… run tests in a
  real browser (like Playwright)."
- **Testing Library's own docs** still document jsdom as the default path
  ([setup](https://testing-library.com/docs/dom-testing-library/setup/)). It is
  not deprecated by its own maintainers' documentation.
- **Vitest's docs** describe happy-dom neutrally — "considered to be faster
  than jsdom, but lacks some API"
  ([environment](https://vitest.dev/config/environment)) — and take no side.

**Gap, stated plainly:** the Vitest browser guide does *not* contain an
explicit "use Browser Mode instead of jsdom for component tests"
recommendation. That reading comes from Dodds and Zakharchenko personally, not
from the docs. Widely-quoted "happy-dom is 5–10× faster" figures trace to blog
posts, not to any primary source; treat them as unverified.

### Verdict

The direction of travel among the people who shaped this practice is
unambiguous, and this repo has now paid the jsdom tax twice: a five-majors-behind
dependency and a transitive pin holding a 20-second lane out of a 293-second
hole. But the browser lane is out of scope for #734 and swapping to happy-dom
trades a known engine for an untested one mid-effort.

**For this effort: keep jsdom, keep the pin, and add a comment pointing at
nwsapi #171/#172/#177 so the next session knows when the pin can go.** Record
the jsdom-vs-browser decision as a separate, later question — the evidence
above is the case for opening it, not for settling it inside this one.

---

## 3. Mutation testing

Stryker is alive: `@stryker-mutator/core` 10.0.0 shipped 2026-08-14 (npm
registry, confirmed), after a steady 2025–2026 cadence
([releases](https://github.com/stryker-mutator/stryker-js/releases)). Vitest 4
support landed in 9.4.0 (2025-11-23) with a 4.1 hitcount/coverage fix in 9.6.1
(2026-04-10).

The `vitest-runner` documents three limitations verbatim
([vitest-runner docs](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)):

- "Currently, only `threads: true` is supported."
- "Currently, Browser Mode is not supported."
- "Your `coverageAnalysis` property is ignored. The vitest runner plugin will
  always use `\"perTest\"` coverage analysis."

Incremental mode exists and is documented as intended for exactly the
changed-files-in-CI use case, but Vitest sits in the weaker "tests per file"
detection tier rather than the "full" tier Jest gets
([incremental docs](https://stryker-mutator.io/docs/stryker-js/incremental/)).
And there is a live bug against precisely that configuration:
[stryker-js#6004](https://github.com/stryker-mutator/stryker-js/issues/6004) —
non-deterministic test IDs under a Vitest 4 multi-project setup produce a
~15k-line diff in the incremental baseline on every run.

### Verdict: reject

Three reasons, in order of weight:

1. **The recurring-attention rule from #734 disqualifies it outright.** A
   mutation score is only worth computing if somebody reads it and acts. That
   is a new recurring moment in a solo workflow. `LEARNINGS ·
   owner-cant-recount-it-its-dead` applies directly.
2. **Its one CI-viable mode has an open bug against this exact shape** — Vitest
   4, multiple projects, incremental (#6004).
3. **The runtime is unbudgeted.** No primary source gives a multiplier over a
   normal run, so nothing here can be sized against the 5-minute gate.

**Gaps, stated honestly.** No Stryker page framing "when should you use
mutation testing" was found, so there is no primary source either recommending
*or* discouraging solo use — this is unresolved, not a documented "team only".
No Stryker benchmark at ~2500-test scale was found. No Kent Beck writing on
mutation testing was found.

The rejection therefore rests on this repo's own constraints, which are solid,
rather than on any authority saying mutation testing is wrong at solo scale.
If the constraint ever changes, revisit — the tooling is maintained.

---

## 4. Test organisation

### Nobody credible sets a line limit

Searched Kent Beck, Kent C. Dodds, Martin Fowler, and the Vitest / Jest /
Testing Library docs. **No primary source sets a numeric line-count limit for a
test file.** The numbers that circulate (200 / 500 lines) come from Robert C.
Martin on *source* files generally and from linter defaults.

This repo's own "800 max" comes from `~/.claude/rules/code-standards.md`, which
is a house rule about source files. Seven test files exceed it (largest:
`browse-dialog.test.tsx`, 1516 lines). That is a house-rule violation. It is
not a violation of anything the field agrees on.

### What the field actually says

- **Vitest declines to pick a side** on placement: "there's no single 'right'
  way to organize your test files… some teams prefer placing tests right next
  to the source code they test, while others keep them in a dedicated
  directory"
  ([writing tests](https://vitest.dev/guide/learn/writing-tests.html)). Jest's
  default `testMatch` treats `__tests__/` and `*.test.*` as equally valid
  ([config](https://archive.jestjs.io/docs/en/configuration)).
- **Kent C. Dodds does take a side, and it is the split-by-file position**:
  "instead of grouping tests by `describe` blocks, I group them by file. So if
  there's a logical grouping of different tests for the same 'unit' of code,
  I'll separate them by putting them in completely different files."
  ([Avoid Nesting when you're Testing](https://kentcdodds.com/blog/avoid-nesting-when-youre-testing)).
  His objection is to `beforeEach`-driven shared mutable state, not to length.
- **Dodds also argues the opposite of "many small tests"** at the *test* level:
  one test per user workflow, not one assertion per test
  ([Write Fewer, Longer Tests](https://kentcdodds.com/blog/write-fewer-longer-tests)).
  These are consistent: fewer, bigger tests; more, smaller files.
- **Dodds on colocation**: keep files near what they are relevant to; keep only
  true cross-cutting E2E at the top level, because those do not map to `src/`
  and should not break on a rename
  ([Colocation](https://kentcdodds.com/blog/colocation)). This repo's sibling
  unit tests plus a separate `tests/integration/` tree already matches that.
- **Kent Beck's Test Desiderata** ([Desirable Unit Tests](https://newsletter.kentbeck.com/p/desirable-unit-tests))
  are trade-off sliders — isolated, composable, deterministic, specific,
  behavioural, structure-insensitive, fast, writable, readable, predictive,
  inspiring, automated — with the rule that "no property should be given up
  without receiving a property of greater value in return." *The exact
  enumeration should be re-read from the essay before being quoted as
  canonical; the list above came through a paraphrase.*
- **Beck on splitting** ([Additional Testing After Refactoring](https://tidyfirst.substack.com/p/additional-testing-after-refactoring)):
  when a large production element is split, existing tests stay valid and
  smaller tests for the sub-elements become *possible*. Test structure follows
  code structure, not the reverse.

### The signal question, answered honestly

**No primary source was found arguing that a large test *file* signals the unit
under test has too many responsibilities.** Not Beck, not Fowler, not Feathers.
The widely-quoted Fowler line "if your test is hard to write, your design's
bad" could not be pinned to any martinfowler.com URL and should not be cited as
if it could. Feathers' "every testability problem is a design problem" is about
test *difficulty*, not file *size* — the right shape of claim, aimed elsewhere.

The nearest thing to support comes from Beck above, and it points the other
way: split the code, and the smaller tests follow.

### Verdict

**Adopt Dodds' rule; drop the line count.** "Split a test file when it covers
more than one logical grouping" is a rule with a named author behind it and a
reason a reader can check. "Split at 800 lines" has neither, and it is the rule
an agent will satisfy by moving lines between files without improving anything.
Commit d793a6d (splitting `remove-skill-row.test.tsx` into five files) is what
the good version of this looks like; the rule should describe *that*, not a
number.

**Gap:** no primary source from any of these authors on test organisation in a
monorepo with separate lanes. Everything found was vendor content about
execution (affected-test detection, sharding, caching), not organisation.

---

## 5. Testing in the agent era

Asked to report honestly whether this is noise. It is **not noise, but it is
one voice plus two adjacent research threads** — not a settled body of
practice.

### Kent Beck is the one sustained, specific voice

["Genie Wants to Leap"](https://newsletter.kentbeck.com/p/genie-wants-to-leap)
(2025), his own words:

> "I've seen infinite loops. I've seen truly pernicious behavior like deleting
> assertions from tests, deleting whole tests, & faking large swathes of
> implementation."

His framing is that a passing test suite plus a clean compile is the checkpoint
the agent must hit *at every step*, against the agent's own pull toward one big
reveal at the end. This is the load-bearing claim of the whole section, and it
comes straight from his post.

*Caveat:* lines widely attributed to Beck from
[The Pragmatic Engineer interview](https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent)
(2025-06-11) — "tests are a conversation with the future", TDD as a
"superpower" with agents — appear across secondary write-ups but were not
verified against a transcript. Treat as probably real, unverified at source.

### Thoughtworks Radar: real, but shallow and pointed elsewhere

Two relevant blips, both in **Assess** — the most tentative ring:
[AI-aided test-first development](https://www.thoughtworks.com/en-us/radar/techniques/ai-aided-test-first-development)
and
[AI-powered UI testing](https://www.thoughtworks.com/en-us/radar/techniques/ai-powered-ui-testing).
Both are about UI and exploratory testing, not about what changes when an agent
writes the unit tests. The radar's live pages report inconsistent volume dates;
the ring placement is the reliable part.

### The academic thread is rigorous but adjacent

- [arXiv:2506.02954](https://arxiv.org/abs/2506.02954), "Mutation-Guided Unit
  Test Generation with a Large Language Model" (2025-06): across 204 subjects,
  LLM-prompted tests under-perform on mutation score unless explicitly steered
  by mutation feedback. Prior work over-indexes on coverage and pass-rate
  rather than fault detection.
- [arXiv:2607.22880](https://arxiv.org/html/2607.22880v1), "Do Coverage and
  Mutation Scores of LLM-Generated Test Suites Correlate with Their
  Effectiveness?" (ISSTA 2026): coverage and mutation score are only meaningful
  proxies in regression settings; they become unreliable when the goal is
  finding defects in genuinely buggy code.

Together these caution against the exact thing §1 recommends — treating a
coverage number as a quality signal. They support #734's own framing that
coverage is a map, not a target.

**Explicit gap:** the folk claim that AI-written tests are tautological, or mock
everything, could not be tied to any paper measuring it. It is folklore. Note
that this repo has **zero `vi.mock` occurrences**, so even the folklore does not
describe what is actually here.

### Vendor guidance

Anthropic's own engineering writing is on-topic for the mechanics: the agent
loop is gather-context → act → verify → repeat, and verification is how an
agent checks its own work
([building verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills));
"the best form of feedback is providing clearly defined rules for an output,
then explaining which rules failed and why"
([building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)).
The Claude Code best-practices docs suggest a writer/reviewer split, one
instance writing tests and another writing the code to pass them
([best practices](https://code.claude.com/docs/en/best-practices)).

This is generic verification-loop advice, not test-design prescription. No
equivalent first-party GitHub or OpenAI guidance on repo test *structure* was
found.

### Verdict

Two things worth acting on, both cheap:

1. **`.claude/rules/testing.md` should carry an explicit prohibition on
   weakening a test to make it pass** — deleting an assertion, deleting a test,
   loosening a matcher, or adding `.skip` in order to get green. Beck observed
   exactly this behaviour, and this repo's rules do not currently forbid it. It
   is one line in a file agents already read.
2. **Fast, deterministic, legible failure output is the agent's feedback loop**,
   which is the same argument the 30s coding-loop budget already makes for the
   human. The `agent` reporter from §1 serves this directly.

Everything else here is watch-and-wait. There is no established practice to
copy, and pretending otherwise would be the inflation this ticket asked me to
avoid.

---

## Summary table

| Finding | Verdict | Reason |
|---|---|---|
| Coverage with `coverage.include` | **Adopt** | Only way to answer "which files never run"; one config block, on-demand |
| `agent` reporter (4.1) | **Adopt, verify it engages** | Free; suppresses passing-test noise from agent output |
| Split-by-logical-grouping rule replacing the 800-line count | **Adopt** | Named author with a reason; the line count has neither |
| "Never weaken a test to get green" in `testing.md` | **Adopt** | Beck observed agents doing exactly this; one line |
| Keep the nwsapi 2.2.25 pin, add an issue pointer | **Adopt** | Measured: 2.2.27 still hangs the web lane (293s, 24 failures) |
| Bump jsdom from ^25 toward 30 | **Consider separately** | Five majors behind; not free, and not this ticket |
| Test tags for slow-test timeouts | **Hold** | Follows the lane decision, not an input to it |
| `--detect-async-leaks` | **Hold** | Debugging flag, not a standing gate |
| Vitest 5 | **Defer** | Released 2026-09-03; gains are in pools this repo does not use |
| Test annotations (3.2) | **Reject** | Pay off only when someone reads a CI report they did not watch |
| Browser Mode / happy-dom swap | **Reject for this effort** | Out of scope per #734; the case for reopening it is in §2 |
| Stryker mutation testing | **Reject** | New recurring human moment; open bug on Vitest-4-multi-project incremental; runtime unbudgeted |
| Storybook stories as tests | **Unchanged** | Not investigated; `testing.md` already rules it out |

## Where the evidence was thin or absent

- No primary source sets a test-file line limit (§4).
- No primary source ties large test *files* to a design smell in the unit under
  test (§4).
- No Fowler URL for "hard to test means bad design" (§4).
- No Stryker framing on solo-scale use, and no benchmark at this repo's scale
  (§3).
- No Vitest doc says "use Browser Mode instead of jsdom" — that is Dodds and
  Zakharchenko personally (§2).
- No measured runtime cost for v8 coverage on a suite this size (§1).
- No study measures the "AI tests are tautological" claim (§5).
- Beck's Test Desiderata list above came through a paraphrase; re-read the
  essay before quoting it as canonical (§4).
