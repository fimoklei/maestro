# ADR-0025 — The cockpit's copy standard

- **Status:** Accepted, amended 2026-09-08, 2026-10-02, 2026-10-04 and 2026-11-13
- **Date:** 2026-08-31
- **Amends:** ADR-0018's ownership of user-facing messages.
- **Resolves:** [Cockpit language map #646](https://github.com/fimoklei/maestro/issues/646).

## Context

The original inventory found 656 text sites, with 82% outside copy modules.
Notice sentences lived in server routes while their headings lived in `web`.
The original decision adopted GOV.UK and Polaris rules and a detailed review
checklist to make the copy consistent.

By 2026-09-08, the rules repeated themselves across fault tables, message
structures and review checks. The owner chose to return to the purpose:
keep copy simple. This amendment replaces the prescriptive language rules,
anchor tie-breaker and checklist with the short guidance in `copy.md`.

## Decision

1. Write for a developer who knows git and a terminal but not APM. Each text
   lets that reader understand what is happening, what their action changes
   and what they can do next. Copy is written one screen at a time, from a
   term table that gives each action and each thing one word across that
   screen. ASD-STE100, GOV.UK and Polaris remain background, rather than
   mandatory rules.
2. The repo's copy rule for agents is the writing and review guide for every word the
   cockpit shows. Review the whole message in context for first-reading
   comprehension and agreement with the implemented behaviour. Enforcement
   remains human or agent review, with one exception: a blocking check in
   `pnpm lint` fails on a retired screen word, or on a word or mark the
   register leaves out (promotional words, chat phrases, `!`), in shipped
   copy. It lists only words and marks that are wrong in every screen use;
   form, length and style stay with review.
3. The screen uses the fixed names in `GLOSSARY.md`. The glossary continues to
   govern code terminology and which technical terms the screen keeps.
4. Every user-facing word belongs in `packages/web`, centralised per feature.
   Author a notice's heading, sentence, `detail` and action label together.
   The server sends error codes and HTTP statuses. Its request-shape
   messages remain the exception, intended only for malformed requests.
5. A Notice retains one always-visible `detail` slot and one action.
   `detail` explains why the event happened. Progressive disclosure remains
   deferred until a real message needs it.
6. The frontend rule for agents owns copy implementation conventions; the
   design rule owns accessibility and browser verification.

## Amendment to ADR-0018

The clause "the wire message comes from the server's error tables" is
superseded by decision 4. APM's own prose never reaches the browser. The named
field permitted by ADR-0018 may still cross after shape checking where APM's
output is first read.

## Consequences

The writing guide no longer mandates noun-phrase headings, a 15-word limit,
word bans or a fault checklist. Reviewers judge whether the reader understands
the message and can act on it.

The 2026-10-02 amendment ([#969](https://github.com/fimoklei/maestro/issues/969))
adds the retired-word check. Teams lint documentation prose, rarely UI wording.
Measured on Maestro's copy, form and style checks fired mostly on approved
strings, while retired screen words surviving a rename were the one defect
that kept passing review and could be found with no false positives.

The 2026-10-04 amendment ([#1388](https://github.com/fimoklei/maestro/issues/1388))
extends the same check to the register's excluded words and marks. Like a
retired word, each is wrong in every screen use.

The 2026-11-13 amendment
([#1882](https://github.com/fimoklei/maestro/issues/1882#issuecomment-6859670099))
replaces decision 1's ASD-STE100 guidance. The owner rejected reviewed copy
five times as clipped or unidiomatic. The sentence rules (one-word verbs, a
word limit, a fixed `Select {control} to {result}` pattern, headings without
a verb) each passed review and together produced that copy, and a
string-by-string review left one action with three verbs on one screen. The
guide now starts from what the reader must understand, and a control label
names its result. Shipped strings written under the older guidance stay
until their screen is next written.

The 2026-09-08 amendment changes agent guidance, not rendered copy or the Notice
component. Existing copy implementation and any remaining migration work are
separate changes tracked in GitHub.
