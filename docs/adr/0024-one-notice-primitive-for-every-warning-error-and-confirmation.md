# ADR-0024 — One Notice primitive for every warning, error and confirmation

- **Status:** Accepted
- **Date:** 2026-08-21
- **Spec:** [#465](https://github.com/fimoklei/maestro/issues/465)
- **Relates to** ADR-0004 (shadcn components are owned), ADR-0012 (`web`
  imports `core` wire types), ADR-0018 (apm prose never crosses as prose).

## Context

The same kind of failure looked different on every screen. An unreachable
server, a refused deploy, an inventory that would not load and a rejected clone
path are four situations, and they all read as one: amber text. `tokens.css`
has separated `danger` from `amber` since #213 — *"errors only; never a fill for
a primary action"* — but only a minority of surfaces obeyed it, so an outright
failure wore the colour that means "you can proceed, at a cost".

The cause was structural. A notice primitive existed in web's `ui` layer,
`FailureNote`, but it was pinned to one level, one glyph and a literal
`role="alert"`, so it could only serve the outright-failure case. Eight dialog
surfaces adopted it. Sixteen other notice sites had nothing to reach for at
their level and grew their own — seven of them hand-rolled near-copies of the
primitive's markup, tinted amber. An agent building the next screen copied the
nearest neighbour, and the neighbours disagreed.

Two live defects followed from the pin: every notice was an assertive live
region, two of them firing on page load before the user had done anything; and
the three-part contract — what happened, what it means, what to do now — was met
on some surfaces and absent on others.

## Decision

**One primitive, `Notice`, states every warning, error and confirmation in the
cockpit. It is the generalisation of `FailureNote`, not a second component
beside it.**

1. **Four levels bound to tokens that already ship.** `info` → `dim`,
   `success` → `green`, `warning` → `amber`, `error` → `danger`. No token work.
   Transport severity is not UX severity: `deployed-diverged-from-lock` arrives
   as an HTTP failure and is a `warning`, because proceeding costs local edits.
   Separating those two is the point of the scale.
2. **Nothing crosses the wire.** The server keeps its typed code →
   `{status, message}` tables; `core` is untouched. Both the level and the
   heading are a web-side table keyed on the error unions `web` already imports
   as types (ADR-0012), so a new code in `core` is a typecheck failure in `web`
   until it has a heading.
3. **A warning cannot compile without its cost.** The props are one nullable
   `notice` object with a discriminated union: at `warning` the typed `action`
   is required. There is no `children` slot — an untyped escape hatch would
   reopen the hole the union closes.
4. **The live-region role is derived, never chosen.** `role="alert"` iff the
   level is `warning` or `error` *and* `trigger` is `"user-action"`; everything
   else is `role="status"`. `trigger` is a literal at the call site, and the
   rule that keeps it honest is that **a panel or section that failed to load is
   always `load`** — the same call site is reached by a first read, a retry and
   a TanStack Query refetch on window focus, and only the last two follow a
   click. The caller states a fact it knows; it never makes an accessibility
   judgement. The literal string `"alert"` therefore appears nowhere in the
   source outside the primitive's own derivation, which is what makes a
   source-tree guard on it possible without an allowlist.
5. **The live region is always mounted.** `Notice` renders its region while
   `notice` is `null`; the text swaps in. A region that appears together with
   its own content is announced unreliably, and the whole role matrix rests on
   that announcement firing. Accepted limitation: two identical messages in a
   row announce once.
6. **One block, everywhere** — glyph, heading, sentence, optional action. No
   `placement` prop and no `density` axis. Severity is carried by a glyph as
   well as by colour (`✕` error, `▲` warning, `✓` success, nothing for `info`),
   all `aria-hidden`, so it survives without colour perception (WCAG 1.4.1).
7. **Focus does not move.** The notice sits after the control that caused it in
   DOM order, so its action is one Tab away. One exception, already invented
   three times in the repo and now named: when that control no longer exists,
   focus goes to the heading of the card that owned it.
8. **The headings and the sentences were written together.** A heading takes the
   "what happened" clause, so the sentence that kept saying it became a
   duplicate. All 106 messages across the thirteen server tables got the same
   pass, rewritten in place — the text stays in the server's own tables and is
   never apm's prose (ADR-0018).

Every existing notice moved onto the primitive in the same pass, so the guard
that fails the build on a hand-rolled `role="alert"` could land green.

## Consequences

- The same failure looks the same everywhere, and the next screen has exactly
  one neighbour to copy.
- Two surfaces stopped interrupting screen readers on page load.
- A new server error code is a compile error in `web` until it is given a level
  and a heading. That is deliberate friction, and it is the only thing keeping
  the table exhaustive.
- The instruction belongs in `.claude/rules/frontend.md`, which already fires on
  this work; this ADR carries the reasoning, so an agent following the rule
  never has to read it. That file is Michiel's: the section is quoted for his
  yes on #616, together with one `PRODUCT.md` line adding "Harness" to the fixed
  vocabulary. Until he takes them, the standard is enforced by the compiler and
  the guard, not by a written rule.
- Two shapes are named as deliberately *not* notices, so the type stays thin:
  **Report** (per-item outcomes with counts) and **Progress** ("Deploying…", a
  polite region with no level and no action). Neither becomes a `ui` primitive
  until it earns one.
- `role="status"` is left unguarded. Guarding it would drag Report and Progress
  into the `ui` layer for a cosmetic fault; only the assertive region is an
  accessibility fault, and only it is guarded.

Two departures from the spec, made while building:

- **`NoticeTable` cannot express `warning`.** A table maps a code to a level and
  a heading, and a warning needs the consequence it costs as a required action —
  something a table cannot know. Warnings are therefore written at the call
  site, and the table's level type excludes them.
- **An `aside` slot was added** for a property of the control beside the notice
  rather than a second problem. It is a plain string, not a second message.

## The four-level scale is a house rule

Material Design 3 ships exactly one severity colour role (`error`) and no
warning, success or info role; Apple's HIG publishes no severity taxonomy at
all. The scale's authority is `tokens.css`, which separated `danger` from
`amber` in #213 — not an external best practice, and claiming otherwise would
lean the decision on ground that is not there.

Placement is the opposite case: both systems reached the same rule and neither
offers a fixed region. Per
`docs/research/465-notice-placement-apple-google.md`, which holds the primary
sources with the date each was read, Material 3 deleted the M2 banner and named
no replacement, Apple ships no toast, snackbar or banner component at all, and
both state proximity explicitly — "inline or near the action that triggered it",
"near the items it describes".

## Rejected alternatives

- **Put `level` on the wire.** RFC 9457 (*Problem Details for HTTP APIs*)
  deliberately carries no severity field: severity is per surface, error
  identity is not. And because `web` imports the code unions from `core` as
  types, a web-side `Record` is already exhaustive by compiler — the
  synchronisation a shared type would buy is free. Decisive check: none of the
  divergent notices differed in wire shape. They differed in markup, colour,
  role and layout. A wire type would have prevented none of them.
- **Re-base the primitive on shadcn's `Alert`.** It ships two variants, a fixed
  `role="alert"` on its root, and no action or live-region logic — colliding
  with the level scale, the field binding and the derived role. ADR-0004 already
  treats shadcn components as owned, and with a working component in hand that
  is closer to the target, adopting `Alert` would be a rewrite in both
  directions for no gain. `Alert` would also be the wrong name half the time.
- **Keep an untyped `children` slot beside the typed `action`.** Every call site
  passed either nothing or a single button, so nothing was lost by removing it —
  and an escape hatch defeats the one enforcement that matters.
- **An authored `placement` prop.** Maestro has four places a message can sit
  and no banner or toast region. "Next to the thing it is about" is the only
  general answer, so the prop would add exactly the arbitrary axis the standard
  removes. The ladder belongs in the written rule, not in the type.
- **A `density` axis or an inline variant.** Settled by measurement, not
  argument. The block was measured at the narrowest place a notice has — the
  291px skill detail pane, leaving 249px for text — against the longest message
  in the server's tables (273 characters), where it renders as 7 lines and
  154px. It fits. No notice sits inside a table row, so the row-height objection
  that motivated the axis does not apply.
