# ADR-0025 — The cockpit's copy standard

- **Status:** Accepted
- **Date:** 2026-08-31
- **Amended:** 2026-09-06, at the owner's request: remove assumed technical
  knowledge and grammatical restrictions that obstruct comprehension.
- **Amends** ADR-0018 (apm output crosses only as shape-checked fields) — one
  clause, stated under "Amendment to ADR-0018".
- **Resolves** the wayfinder map [what the cockpit says to the person reading
  it](https://github.com/fimoklei/maestro/issues/646).

## Context

The cockpit says 656 things and nothing governs any of them. One notice carried
four separate faults in three lines:

```
✕ the Maestro server is unreachable
Nothing on this screen can load until it answers. Check that it is still running, then try again.
[ Try again ]
```

A lowercase heading repeating the state; "until it answers"
giving the server a mind; "Check that it is still running" naming nothing the
reader can do; and a button promising something the sentence never offered.

The string inventory (`docs/research/string-inventory.md`) then measured the
scale: 656 sites, 82% of them outside any copy module, `error/notice` alone 46%
of everything the cockpit says, and the sentence half of every notice authored
in a route file in `packages/server` while its heading sat in `packages/web`.

Eight decision tickets on the map settled the anchors, the fault list, the term
list, the surfaces in scope, where the sentence lives, and what a Notice's
`detail` slot is. This ADR records the decision; `.claude/rules/copy.md` holds
the rules a writer and a reviewer apply.

## Decision

**Maestro writes to a copy standard anchored in GOV.UK and Polaris, enforced at
review, with every user-facing word owned by `packages/web`.**

1. **Copy assumes no technical training.** Write for someone managing their
   AI tools without assumed programming, git, terminal or APM knowledge.
   Explain necessary terms and manual steps where the reader needs them.
   This replaces the original developer-only writing baseline; it does not
   add product capabilities. Review whether the visible text explains the
   state, its effect on the task and the available next step.

2. **Two anchors, with a fixed tie-breaker.**
   [GOV.UK's writing guidelines](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/)
   for language;
   [Shopify Polaris' content guidance](https://github.com/Shopify/polaris-react-archive/tree/main/polaris.shopify.com/content/content)
   for product-UI patterns. GOV.UK is maintained; Polaris' content section was
   retired in 2026 and survives only as archived markdown. Where the two
   conflict on language, GOV.UK wins; where the conflict is a product-UI pattern
   GOV.UK has no component for, Polaris wins. The seven live conflicts are
   settled in `docs/research/copy-anchors-govuk-polaris.md` §6.

3. **Cite the rule, not the guide.** Both anchor URLs were dead when this was
   written. Every rule in `.claude/rules/copy.md` carries the link the research
   file resolved.

4. **Review meaning in context.** Review the whole notice and the screen it
   refers to, including heading, body, `detail` and action. For accessible
   names, compare the name with its visible label. Check factual claims
   against behavior before review. Source guidance and Maestro conventions
   are identified separately in `copy.md`. Notice headings may be phrases or
   full sentences; questions are appropriate when asking for a choice.
   Comprehension takes priority over grammatical form and word-count targets.

5. **Keep the comprehension test in the rules file.** Writers must check for
   unexplained terms and missing steps, not infer understanding from a reading
   score or sentence length. Tone remains restrained: do not sell, apologise
   or make the reader feel they are behind.

6. **A Notice carries one always-visible `detail` slot, one action, and no
   progressive disclosure.** Rewriting all 122 notices produced 38 details, of
   which 36 are prose causes ("apm refuses to install into a linked skill
   directory") and 2 are technical identifications. There is almost nothing to
   hide, and a click costs more than it saves. A collapse gets built when a real
   string needs one.

7. **The screen may translate a domain word; the code may not.** `CONTEXT.md`'s
   ubiquitous language binds the codebase. The cockpit uses the fixed screen
   names in `CONTEXT.md` → **Screen names**, one name per concept on every
   surface. Exact technical terminology is confined to `detail`, except where
   the instruction acts on the file itself.

8. **Every user-facing word lives in `packages/web`, centralised per feature.**
   The server sends the error code and the HTTP status; `web` writes the
   heading, the sentence, the `detail` and the action label together, in the
   feature's copy module. The eight request-shape messages stay in `server`:
   they fire only on a malformed request, and no user is meant to read them.

9. **The sweep is separate work, in a fixed order.** The 125 server sentences
   relocate into `web` first as one mechanical job — no word changed, green
   tests as the proof — because a diff that moves and rewrites at once is
   unreadable. Then: notices per feature, buttons and badges per feature, then
   the small surfaces one issue each, and screen-reader text last, because an
   accessible name is judged against a visible label that must be final first.

10. **Enforcement is review, not tooling.** `.claude/rules/copy.md` ends in a
    reviewer's checklist, applied to every new or changed user-facing string. A
    string nobody rewrote stays a known fault, owned by the sweep issue that
    counts it; that issue stays open until its count is met. A copy linter is
    out of scope.

## Amendment to ADR-0018

ADR-0018's clause **"the wire message comes from the server's error tables"**
lapses. Its ban is untouched and gets stricter: apm's own prose never reaches
the browser, and after the move in §9 no sentence crosses the wire at all. The
one named field that may still cross, shape-checked where apm's output is first
read, is unchanged.

## Consequences

- `packages/server`'s error tables keep `{ status }` and lose their sentences.
  `noticeFromTable` stops reading `(error as Error).message`.
- `noticeFromTable`'s `fallbackLabel` becomes `fallback: { label, message }`.
  One shared fallback sentence could not state a consequence for ten callers,
  and the compiler now forces each of them to write its own.
- The `Notice` component's `aside` becomes `detail`, with a new contract: why
  this happened, in a sentence the reader does not have to read aloud.
- `.claude/rules/design.md` gains a pointer line: a change to what the cockpit
  says is checked against `copy.md`, and a change to what it renders still needs
  the browser check.
- 656 string sites are now measurable against a standard, and roughly 8–10 sweep
  issues carry them. Until those close, the cockpit reads inconsistently — the
  standard exists before the strings match it, deliberately.

## Rejected alternatives

- **Invent a Maestro voice guide from scratch.** Rejected: an unanchored guide
  is taste, and taste is what the map exists to remove. Both anchors moved or
  died during the research, which is an argument for citing precise rules, not
  for writing our own.
- **Rewrite the app first and extract the standard afterwards.** Rejected: 656
  sites is too many to hold by hand, and the rules would then describe whatever
  the rewrite happened to produce.
- **Keep the sentence in the server and pair it with the heading by code.**
  Rejected: nothing in the code holds the pair together except a shared error
  code, and four of the thirteen faults are undecidable on half a notice.
- **Split `detail` into a button footnote plus a collapsed technical slot.**
  Rejected on the count in §6: two of 38 details are technical, and neither is
  long enough to hide.
- **A copy linter.** Rejected as its own project. Half the rules need the whole
  notice and the code around it; a linter that catches only capitalisation buys
  a build step.
