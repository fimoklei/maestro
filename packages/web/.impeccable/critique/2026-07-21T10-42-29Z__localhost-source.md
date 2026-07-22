---
target: /source page
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-07-21T10-42-29Z
slug: localhost-source
---
# Design Critique — /source (Inventory source view)

Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Re-read gives no visible progress; no "last read" mark |
| 2 | Match System / Real World | 4 | Fixed vocabulary applied cleanly |
| 3 | User Control and Freedom | 3 | Cancel works; in-flight re-read not abortable |
| 4 | Consistency and Standards | 2 | `●` marks both healthy and fault; focus falls back to browser default |
| 5 | Error Prevention | 3 | Path is free text, validated server-side |
| 6 | Recognition Rather Than Recall | 3 | Current path shown and seeded; no shortcut hints |
| 7 | Flexibility and Efficiency | 2 | No shortcut for Re-read; path copyable only by drag-select |
| 8 | Aesthetic and Minimalist | 3 | Very clean, near-empty; green banner too heavy for resting state |
| 9 | Error Recovery | 3 | "re-read to retry" is usable but names no cause |
| 10 | Help and Documentation | 2 | No hint what "inventory source" or "Re-read" does |
| Total | | 28/40 | Good — solid foundation, targeted weak spots |

## Anti-Patterns Verdict

Does this look AI-generated? No.

LLM assessment (A): A Linear/Raycast/Stripe-fluent user trusts this. Token discipline is real — mono for data, sans for chrome, 1px lines, exactly amber+green, no shadows/gradients. Reads as an intentional Control Room. Trips none of the banned anti-references. The tells present are "was this finished?" tells, not fake-component tells: focus ring is the browser default (no token), one card floats top-left in an ocean of near-black.

Deterministic scan (B): The slop detector ran over inventory-source-view.tsx plus the shared UI primitives (button, card, section-header, connect-form). All clean — zero hits, exit 0. No false positives. Confirms the LLM verdict: nothing automated-suspect in the markup.

What the detector missed but the eye/measurement caught: the accessibility + responsive findings below came only from measuring the live page.

## Overall Impression

One of the better screens of its kind — calm, honest, on-brand. The problem is not ugliness; it's finish on the very edges the brand promises to honor. PRODUCT.md sets WCAG 2.2 AA as a hard commitment and states muted text is checked against the surface it sits on. Two measured findings break that: muted labels miss the contrast floor, and the focus ring is designed nowhere. For a cockpit that wants to be keyboard-driven, that is the biggest opportunity.

## What's Working

1. State is not color-only. "● connected · 36 primitives" pairs glyph + color + word; count is instant proof-of-life. Both error surfaces carry role="alert".
2. In-place card flip for re-point. Change-source swaps the card rather than routing away — nav stays active — and the field seeds from the current path. Low friction.
3. Token rigor. Mono/sans split, 1px structure, two signal colors, no shadows. Real h2, real label htmlFor. Solid semantic foundation.

## Priority Issues

[P1] Muted labels miss the contrast floor. B measured `local path · read-only` and `SOURCE · LOCAL FOLDER` at ~3.2:1 at 10px; WCAG AA needs 4.5:1. PRODUCT.md makes this a hard promise. Fix: push these labels toward the lighter end of the gray ramp or enlarge them; remeasure to >=4.5:1. Command: /impeccable colorize

[P1] Keyboard focus is effectively invisible. No :focus-visible rule exists anywhere; buttons fall back to the UA default, the change-source input uses outline-none with an imperceptible border delta. WCAG 2.4.7 failure; undermines the keyboard-cockpit ambition. Fix: one tokenized focus-visible ring (amber-border) in button.tsx for all variants, and on the input. Command: /impeccable harden

[P2] Re-read gives no feedback. The button only sets disabled while fetching — no "reading…" label, no post-read confirm. The most-repeated action leaves the user guessing. Fix: swap label to "reading…" while fetching; briefly confirm the count after. Command: /impeccable animate

[P2] Narrow window overflows. B measured 50px horizontal overflow at 375px — the fixed sidebar does not collapse, so "Change source" falls off-screen. Caveat: this is a shell concern, not this view's markup, and phone width is likely out of scope; a split desktop window beside an editor is the realistic case. Fix: collapse the sidebar below a breakpoint, or accept a documented min-width. Command: /impeccable adapt

[P2] Glyph vocabulary inconsistent. Success and error both wear `●` (lines 100 vs 105); the codebase already owns `▲` for warnings. Shape should separate fault from health. Fix: use `▲` on the read-error card. Command: /impeccable clarify

## Persona Red Flags

Alex (power user, keyboard): Re-read has no shortcut. Tab reaches every button but the focus indicator is the pale UA default; the change-source input's focus is invisible. The mono path is copyable only by drag-select — no copy button, no ⌘C hint. Functional, but not yet a keyboard cockpit.

Sam (accessibility): Good — status is glyph+word+color, role="alert" announces errors, real h2, real label htmlFor. The gap: visible focus (P1) and muted labels under the contrast floor (P1). The `●`/`▲` are literal text chars, not aria-hidden — minor screen-reader noise, not blocking.

## Minor Observations

- Loading state is a bare <p>Loading…</p> replacing the whole card frame (line 59) — a layout jump; a skeleton card would hold the frame.
- Verb mismatch: header says "Change… / re-point" but the submit button reads "Connect inventory" — reads like first-time setup to a returning user.
- The green pill duplicates the top-bar "connected" chip — same state shown twice.
- The error message names no cause, so recovery is "retry blindly".

## Questions to Consider

- If green means rest and the resting state is ~95% of visits, why is the resting state the largest colored block on screen?
- Does "Re-read" earn its amber primary, or is it amber only because the view needs one primary?
- Should re-pointing a whole inventory be one unconfirmed "Connect inventory" click away, with no "you're leaving agent-harness" beat?
