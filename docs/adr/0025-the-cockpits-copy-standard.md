# ADR-0025 — The cockpit's copy standard

- **Status:** Accepted, amended 2026-09-08
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

1. Write simple English for a developer who knows git and a terminal but not
   APM. ASD-STE100 principles guide the writing; full compliance with the
   standard and its dictionary is not required. GOV.UK and Polaris research
   remains background, rather than an additional set of mandatory rules.
2. `.claude/rules/copy.md` is the writing and review guide for every word the
   cockpit shows. Review the whole message in context for first-reading
   comprehension and agreement with the implemented behaviour. Enforcement
   remains human or agent review; a copy linter is out of scope.
3. The screen uses the fixed names in `CONTEXT.md`. The glossary continues to
   govern code terminology and which technical terms the screen keeps.
4. Every user-facing word belongs in `packages/web`, centralised per feature.
   Author a notice's heading, sentence, `detail` and action label together.
   The server sends error codes and HTTP statuses. Its eight request-shape
   messages remain the exception, intended only for malformed requests.
5. A Notice retains one always-visible `detail` slot and one action.
   `detail` explains why the event happened. Progressive disclosure remains
   deferred until a real message needs it.
6. `.claude/rules/frontend.md` owns copy implementation conventions;
   `.claude/rules/design.md` owns accessibility and browser verification.

## Amendment to ADR-0018

The clause "the wire message comes from the server's error tables" is
superseded by decision 4. APM's own prose never reaches the browser. The named
field permitted by ADR-0018 may still cross after shape checking where APM's
output is first read.

## Consequences

The writing guide no longer mandates noun-phrase headings, a 15-word limit,
word bans or a fault checklist. Reviewers judge whether the reader understands
the message and can act on it.

This amendment changes agent guidance, not rendered copy or the Notice
component. Existing copy implementation and any remaining migration work are
separate changes tracked in GitHub.
