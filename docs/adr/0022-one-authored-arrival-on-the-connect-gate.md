# ADR-0022 — One authored arrival on the connect gate

- **Status:** Accepted
- **Date:** 2026-08-03
- **Amends** ADR-0008 (Control Room design system) — the motion rule, and only
  for the surface named here.

## Context

The design system allows exactly one kind of motion: a 150ms colour transition
on hover, declared once in `hover-transition.ts` and reused
(`.impeccable/design.json` → `extensions.motion`, one entry named
`state-transition`, "the only motion in the system"). DESIGN.md states the ban
twice: no entrance animations, no decorative motion, no gradients or blur.

That rule was written for the cockpit's working surfaces — dense rows of state
a user scans many times a day, where motion is latency. The connect gate
(ADR-0015) is not one of them. It is the first screen of a fresh install, it is
seen roughly once, and it exists to say one thing: nothing is connected yet.
Its content is three elements and a button on an otherwise empty canvas.

An `/impeccable animate` session on 2026-08-03 produced an arrival sequence for
that screen. The code review that followed found it in breach of the ban on all
counts, correctly. The question the ban does not answer: does the one screen
whose subject *is* emptiness get to say so in motion?

## Decision

**The connect gate's welcome screen gets one authored arrival. Every other
surface keeps the ban unchanged.**

1. **Scope is the screen, not the pattern.** `WelcomeView` only. A second
   surface wanting entrance motion amends this ADR; it does not cite it.
2. **Gradient and blur are allowed, in motion, on this screen only.** The rule
   fades out at both ends with a gradient, and the three elements resolve from
   blurred to sharp. Both are bans elsewhere for the same reason as the shadow
   ban: on a working surface they are decoration that costs legibility. Here
   they are the sequence itself — the gradient is what makes a 1px line read as
   a signal rather than a divider, and the blur is what makes the text arrive
   rather than appear. Neither may sit on a static surface anywhere, including
   this one: outside the animation the gate is flat fills, and the shadow ban
   is untouched.
3. **Nothing loops.** The sequence runs once on mount and ends. No ambient
   pulse, no infinite animation anywhere in the cockpit.
4. **Duration and easing are declared once**, next to the rules that use them,
   the same way `hover-transition.ts` owns the colour transition. The arrival's
   window is 500–600ms — long enough to read as authored, and it never gates a
   control the user is waiting on.
5. **Gated behind `prefers-reduced-motion`.** The reduced alternative is the
   finished screen, immediately. The default state is fully visible, so a
   stylesheet that never loads cannot hide the screen.

## Consequences

- DESIGN.md's "Don't add entrance animations" and its gradient/blur ban both now
  read "except the connect gate (ADR-0022)", and `design.json` carries a second
  motion entry, `gate-arrival`, scoped to that screen.
- Two "Don't" lines now carry an exception. That is the ceiling: a third would
  mean the bans describe a system nobody follows, and the honest move then is to
  rewrite them, not to add a fourth ADR.
- The design system's single-motion claim is gone. The replacement claim is
  narrower and still checkable: **two motions, each named, each owned by one
  file.** A third needs an ADR.
- The gate is now the one screen where a jsdom test proves nothing. Its motion
  is verified by a browser screenshot, per `.claude/rules/design.md`.

## Rejected alternatives

- **Keep the ban, drop the work.** The cheapest option and the honest default
  for any working surface. Rejected only here: the empty state is the one place
  where "nothing yet" is the message, and stating it in motion costs a user who
  sees the screen once, not one who lives in it.
- **Lift the ban generally** — allow entrance motion wherever a designer judges
  it earned. Rejected: that is the rule the system removed on purpose, and
  judgement per surface is how the 150ms window drifted before.
- **Keep the ambient pulse** — the amber rule idling as a carrier with no
  signal on it. The strongest version of the idea, and the first thing to
  irritate someone who leaves the screen open. An infinite animation is a
  standing cost for a one-time message.
- **Drop the gradient rule and the entrance blur** to keep this ADR down to one
  amended rule. Cheaper to argue and weaker on screen: a flat 1px line is a
  divider, and text that fades without resolving does not arrive. The sequence
  is the reason for the exception, so it is worth stating in full rather than
  trimming to whatever needed the least permission.
