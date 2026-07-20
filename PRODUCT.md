# Product

Strategic design context for Maestro. The full product thesis lives in
`docs/brief.md`; this file carries the design-relevant distillation and the
decisions that only exist here (register, platform, anti-references,
accessibility). On any conflict about product scope or the MVP1 bet,
`docs/brief.md` wins.

## Register

product

## Platform

web

## Users

One power-user running many repositories and more than one agent tool, working
locally on their own machine. Today that is a single person — Maestro is
solo-first by design (`docs/brief.md`), and team and organisation use are
deliberately deferred.

Their context is a working session, not a browsing session. They arrive with a
concrete errand: a new project needs a bundle, a skill just changed, something
somewhere is running an old version. The cockpit is opened, read, acted on, and
closed. It sits beside an editor and a terminal, never in front of them.

The job to be done: know what capabilities exist centrally and what is deployed
where at which version, then change that state without editing pins by hand in
each repository.

## Product Purpose

Maestro is the cockpit above APM. APM owns distribution — install, sync,
pinning, lockfiles, multi-tool targeting — and Maestro never reimplements it
(ADR-0001). What APM leaves scattered across per-repo lockfiles and tool
configs, Maestro gathers into one view and makes actionable.

Three views carry the product: the central inventory, the deploy-state across
targets, and compose-and-deploy. **Drift** — a target running an older version
than the inventory — is the core signal and the loudest thing on screen.

Success is behavioural, not a metric: the user reaches for Maestro instead of
hand-editing their setup, because it is faster and clearer. If they still open
a lockfile to learn the truth, the product has failed.

## Positioning

One place to see and steer the whole agent setup. Every screen answers *what do
I have centrally* and *what is deployed where, at which version* — and lets the
user act on that answer without leaving. Seeing without steering is a report,
not a cockpit.

## Brand Personality

Gereedschappelijk, onopvallend, snel — a tool, self-effacing, fast. Maestro has
no ambition to be noticed. Everything is subordinate to how quickly state can be
read, and how directly it can be changed. Character comes from restraint: calm
near-black surfaces, one signal colour that means *act*, another that means
*rest*.

Voice inside the cockpit is terse and technical, closer to terminal output than
to product copy. No "you" or "we", no marketing tone, no emoji. Data-like text
is lowercase mono; chrome is sentence case. Domain words are fixed —
primitive, bundle, target, deploy-state, drift, in sync — and never given
synonyms.

## Anti-references

- **The generic SaaS dashboard.** Hero metric tiles, gradient accents, pill
  shapes, cards nested in cards, the Vercel/Linear clone look. Maestro's density
  and 1px-border structure exist precisely to avoid this.
- **The friendly consumer app.** Illustrations, emoji, soft rounded surfaces,
  reassuring copy. The cockpit shows state; it does not comfort.
- **The bare CLI dump.** Terminal-flavoured is right; structureless is not. Mono
  type is the voice, but hierarchy, grouping, and alignment still do the work of
  making state readable at a glance.
- **Heavily animated interfaces.** Entrance animations, hover scaling,
  decorative motion. Motion is functional only — 120–160ms ease-out on
  background and border-colour changes, nothing more.

## Design Principles

1. **Inspectable, not magical.** The user can always see what is deployed and
   where it came from. Nothing important happens off-screen or without a trace.
2. **Read speed beats everything.** Density, alignment, and a fixed vocabulary
   serve one goal: state understood in a glance. Decoration that costs read
   speed is removed.
3. **One signal at a time.** Amber means act, green means rest. At most one
   amber-filled action per view. When everything is urgent, nothing is.
4. **Steering is never a detour.** The action lives next to the state that
   demands it. Any flow that sends the user back to the CLI has failed.
5. **Never rebuild the engine.** The interface exposes APM's truth; it does not
   invent a second one (ADR-0001).

## Accessibility & Inclusion

WCAG 2.2 AA. Body text meets 4.5:1 against its surface in both themes; the muted
text ramp is checked against the surface it actually sits on, not against the
darkest background. Every control is keyboard-reachable with a visible focus
state, and forms use real labels tied to their fields.

Motion respects `prefers-reduced-motion`; because motion here is limited to
short colour transitions, the reduced alternative is an instant state change.

Colour is never the only carrier of meaning: drift and in-sync always pair their
colour with a glyph (`▲`, `●`) and with text, so the signal survives without
colour perception.
