---
name: Maestro
description: A dense local cockpit for seeing and steering an AI agent setup, in a neutral two-theme system.
colors:
  light:
    gray-1: "#fcfcfd"
    gray-2: "#f9f9fb"
    gray-3: "#f0f0f3"
    gray-4: "#e8e8ec"
    gray-5: "#e0e1e6"
    gray-6: "#d9d9e0"
    gray-7: "#cdced6"
    gray-8: "#b9bbc6"
    gray-9: "#8b8d98"
    gray-10: "#80838d"
    gray-11: "#60646c"
    gray-12: "#1c2024"
    blue-5: "#c2e5ff"
    blue-9: "#0090ff"
    blue-11: "#0d74ce"
    green-3: "#e6f6eb"
    green-7: "#8eceaa"
    green-11: "#218358"
    green-12: "#193b2d"
    amber-3: "#fff7c2"
    amber-7: "#e9c162"
    amber-11: "#ab6400"
    amber-12: "#4f3422"
    red-3: "#feebec"
    red-7: "#f4a9aa"
    red-11: "#ce2c31"
    red-12: "#641723"
    backdrop: "rgba(0, 0, 0, 0.5)"
  dark:
    gray-1: "#111113"
    gray-2: "#18191b"
    gray-3: "#212225"
    gray-4: "#272a2d"
    gray-5: "#2e3135"
    gray-6: "#363a3f"
    gray-7: "#43484e"
    gray-8: "#5a6169"
    gray-9: "#696e77"
    gray-10: "#777b84"
    gray-11: "#b0b4ba"
    gray-12: "#edeef0"
    blue-5: "#004074"
    blue-9: "#0090ff"
    blue-11: "#70b8ff"
    green-3: "#132d21"
    green-7: "#28684a"
    green-11: "#3dd68c"
    green-12: "#b1f1cb"
    amber-3: "#302008"
    amber-7: "#714f19"
    amber-11: "#ffca16"
    amber-12: "#ffe7b3"
    red-3: "#3b1219"
    red-7: "#8c333a"
    red-11: "#ff9592"
    red-12: "#ffd1d9"
    backdrop: "rgba(0, 0, 0, 0.5)"
typography:
  meta:
    fontFamily: "Geist Variable, Geist, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.75rem"
    lineHeight: "1rem"
    fontWeight: 400
    letterSpacing: "0"
  row:
    fontFamily: "Geist Variable, Geist, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: "1.25rem"
    fontWeight: 400
    letterSpacing: "0"
  prose:
    fontFamily: "Geist Variable, Geist, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.875rem"
    lineHeight: "1.25rem"
    fontWeight: 400
    letterSpacing: "0"
  heading:
    fontFamily: "Geist Variable, Geist, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "1rem"
    lineHeight: "1.5rem"
    fontWeight: 600
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Geist Variable, Geist, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "1.25rem"
    lineHeight: "1.75rem"
    fontWeight: 600
    letterSpacing: "-0.4px"
rounded:
  chip: "4px"
  control: "6px"
  float: "12px"
spacing:
  tight: "0.25rem"
  inline: "0.5rem"
  cell: "0.75rem"
  panel: "1rem"
  section: "1.5rem"
  page: "2rem"
density:
  row: "2rem"
  control-in-row: "1.5rem"
  control: "2rem"
  measure: "18 rows at 1440x900"
shadow:
  float:
    light: "0 4px 12px rgba(0, 0, 0, 0.12)"
    dark: "0 4px 12px rgba(0, 0, 0, 0.5)"
motion:
  quick: "150ms ease-out"
  float-in: "300ms ease-out"
  float-out: "200ms ease-out"
  loop: "1400ms linear"
  spin: "800ms linear"
  hover-open: "400ms"
  hover-close: "150ms"
  gate-arrival: "600ms cubic-bezier(0.16, 1, 0.3, 1), once on mount, connect gate only"
---

# Design System: Maestro

This file is derived from `.impeccable/design.json` via `/impeccable` and is
never hand-edited. On conflict, `design.json` wins; `tokens.css` is what
ships. See ADR-0033 for the decision that replaced the retired "Control Room"
system with this one.

## 1. Overview

A cockpit you can read at a glance and steer without guessing: neutral
surfaces, one meaning per mark, and every word readable in both themes.

Maestro is a dense local cockpit for an AI agent setup. Its design system is a
neutral Radix-grammar palette in a light and a dark theme, Geist type, one
fixed density and one frame per screen. Colour is the third cue behind the
word and the glyph, never the first.

Both themes ship. The cockpit is pinned to dark until the Interface theme row
lands in the last rebuild job — this is a rollout order, not a dark-only
design.

Key characteristics:

- Radix Colors 3.0.0 values, unchanged, with light and dark on the same step
  numbers.
- The neutral role is named `gray` and its values are Radix `slate`; five
  scales in total and no sixth.
- Seventeen documented foreground/background pairs are the allowlist, each
  measured at its own floor in both themes.
- Geist and Geist Mono, five sizes in rem, weights 400, 500 and 600.
- One fixed density: every row is 32px, and the Inventory shows at least 18
  rows at 1440x900.
- Only what floats moves, by opacity alone.

## 2. Colors

Five gray steps carry structure (canvas, panel, control, hover, selected),
then separator, border, border-hover, solid, solid-hover, muted text and text.
Blue is reserved for focus, selection and links. Green, amber and red each
carry a surface/border/mark/text set for good, attention and failed states.
Values are in the frontmatter (`colors.light`, `colors.dark`).

Rules:

- Take every colour from a token; a mock is never the source.
- Use blue only for focus, selection and links; keep the primary action
  neutral (gray 12 fill, gray 11 on hover).
- Make the destructive button outlined: red 11 text on a red 7 border, on
  gray 1 or 2.
- Give fields and checkboxes a gray 9 border; button borders and separators
  stay on gray 7.
- Put a link on gray 1 or 2 only; never on gray 3 or darker.
- Never let colour alone carry a status; never fill a button with blue; never
  let amber decorate — amber means Attention only.
- Never use a status mark on step 9 (fails contrast in light).
- Give a primitive type its plain word in gray 11, no hue.
- A new pairing enters `design.json` and the contrast test before a component
  uses it.

## 3. Typography

Geist (`ui`) for every word on screen; Geist Mono (`mono`) for a machine
value only — version, tag, path, ref, commit hash, and nothing else. Both
self-hosted, no runtime CDN fetch.

Five sizes, all in rem (frontmatter `typography`): meta (12px, chips/column
headers/hints), row (13px, table row/button label/field — weight 500 marks
the row identifier and nothing else), prose (14px, sentences), heading (16px,
section/dialog title), title (20px, screen title).

Rules: never below 12px; never a font size in px — the ramp is in rem, so
200% zoom keeps working.

## 4. Density and elevation

One fixed density: a table row, header, list row and nav item are all 32px
(20px line plus 6px above and below); a control inside a row is 24px (the
WCAG 2.2 2.5.8 floor); a control in a band, dialog or form is 32px. The
Inventory is checked against 18 rows visible at 1440x900.

Spacing runs a six-step scale from tight (4px, icon beside a word) to page
(32px, screen outer edge) — see frontmatter `spacing`.

Radii: chip 4px, control 6px (button/field/card/panel), float 12px
(menu/popover/dialog only).

There is one shadow, `float`, always paired with a 1px gray-7 border, used
only for a menu, popover or dialog. The page itself uses tonal steps and
borders, never a shadow. Never stack shadow levels.

## 5. Motion

Only what floats moves, by opacity alone: 150ms ease-out for a hover/focus
colour change; 300ms in / 200ms out for a floating layer's opacity; 1400ms
linear loop for the skeleton shimmer; 800ms linear spin for a busy spinner,
which keeps turning under reduced motion as the one sign of busy. A hover
card waits 400ms to open and 150ms to close on pointer rest.

The connect gate's arrival is the one entrance animation in the cockpit
(ADR-0022, amended by ADR-0033): 600ms, cubic-bezier(0.16, 1, 0.3, 1), on
opacity, translateY, scaleX and blur, once on mount. Its rule is gray, never
amber — amber means Attention and never decorates.

Never animate anything that does not float, and never with scale or
overshoot. Never add a second entrance animation.

## 6. Components

No owned component set has landed yet. It arrives area by area over the
rebuild jobs — shadcn/ui components first, restyled to these tokens, and
owned-from-scratch components last (ADR-0033 §12). Every new component lands
with a Storybook story. `theme.css` keeps the retired Control Room token
names alive as aliases onto these values until each component's own rebuild
job touches it — that alias layer is scaffolding, not part of this system.

## 7. Do's and Don'ts

Do:

- Add a new colour pairing to `design.json` and the contrast test before a
  component uses it.
- Write sizes in rem.
- Mark the row identifier with weight 500; let colour carry the rest of the
  rank.
- Right-align a count with tabular figures.
- Fade a floating layer in at 300ms and out at 200ms, on opacity only.
- Keep the spinner turning under reduced motion.
- Stamp `data-theme` and `color-scheme` on the root before first paint, so
  the wrong theme never flashes and native controls follow it.
- Use a tonal step or a border for a surface on the page, never a shadow.
- Read a gray step's task from its number: 1 canvas, 2 panel, 3 control, 4
  hover, 5 selected, 6 separator, 7 border, 8 border-hover, 9 solid, 10
  solid-hover, 11 muted text, 12 text.

Don't:

- Never let colour alone carry a status.
- Never fill a button with blue.
- Never let amber decorate.
- Never use a status mark on step 9.
- Never put a link on gray 3 or darker.
- Never write a colour, size or spacing as a literal value in a component.
- Never go below 12px, and never set a font size in px.
- Never animate anything that does not float, or add a second entrance
  animation.
- Never stack shadow levels — there is one shadow.
- Never give a primitive type a hue.
- Never edit `tokens.css` or `DESIGN.md` by hand; change `design.json` and
  regenerate.
