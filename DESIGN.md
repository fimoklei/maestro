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
  mono-label:
    fontFamily: "Geist Mono Variable, Geist Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    lineHeight: "1rem"
    fontWeight: 400
    letterSpacing: "0.08em"
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
components:
  button-primary:
    backgroundColor: "{colors.dark.gray-12}"
    textColor: "{colors.dark.gray-1}"
    typography: "{typography.row}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2rem"
  button-primary-hover:
    backgroundColor: "{colors.dark.gray-11}"
  button-quiet:
    textColor: "{colors.dark.gray-12}"
    typography: "{typography.row}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2rem"
  button-quiet-hover:
    backgroundColor: "{colors.dark.gray-3}"
  button-danger:
    textColor: "{colors.dark.red-11}"
    typography: "{typography.row}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2rem"
  button-danger-hover:
    backgroundColor: "{colors.dark.red-3}"
  field:
    backgroundColor: "{colors.dark.gray-1}"
    textColor: "{colors.dark.gray-12}"
    typography: "{typography.row}"
    rounded: "{rounded.control}"
    padding: "0 0.5rem"
    height: "2rem"
  nav-item:
    textColor: "{colors.dark.gray-11}"
    typography: "{typography.row}"
    rounded: "{rounded.control}"
    padding: "0 0.5rem"
    height: "2rem"
  nav-item-hover:
    backgroundColor: "{colors.dark.gray-3}"
    textColor: "{colors.dark.gray-12}"
  nav-item-active:
    backgroundColor: "{colors.dark.gray-4}"
    textColor: "{colors.dark.gray-12}"
  status-badge-attention:
    backgroundColor: "{colors.dark.amber-3}"
    textColor: "{colors.dark.amber-12}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "0 0.25rem"
    height: "1.25rem"
  status-badge-failed:
    backgroundColor: "{colors.dark.red-3}"
    textColor: "{colors.dark.red-12}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "0 0.25rem"
    height: "1.25rem"
  card:
    backgroundColor: "{colors.dark.gray-1}"
    textColor: "{colors.dark.gray-12}"
    rounded: "{rounded.control}"
---

# Design System: Maestro

Derived from `.impeccable/design.json` via `/impeccable` and never
hand-edited. On conflict, `design.json` wins; `tokens.css` is what ships.
Density, shadow, motion and breakpoint values live in the `design.json`
sidecar, since the frontmatter schema has no place for them. ADR-0033 records
the decision.

## Overview

**Creative North Star: "A cockpit you can read at a glance and steer without guessing"** — neutral surfaces, one meaning per mark, and every word readable in both themes.

Maestro is a dense local cockpit for an AI agent setup. Its design system is a
neutral Radix-grammar palette in a light and a dark theme, Geist type, one
fixed density and one frame per screen. Colour is the third cue behind the
word and the glyph, never the first.

Both themes ship. The reader picks one with the Interface theme row on
Appearance; System follows the operating system. Component tokens in the
frontmatter reference the dark values; every step number means the same in
light.

**Key Characteristics:**

- Radix Colors 3.0.0 values, unchanged, with light and dark on the same step
  numbers.
- The neutral role is named `gray` and its values are Radix `slate`; five
  scales in total and no sixth.
- Nineteen documented foreground/background pairs are the allowlist, each
  measured at its own floor in both themes.
- Geist and Geist Mono, five sizes in rem, weights 400, 500 and 600.
- One fixed density: every row is 32px, and the Inventory shows at least 18
  rows at 1440x900.
- Only what floats moves, by opacity alone.

## Colors

Five gray steps carry structure (canvas, panel, control, hover, selected),
then separator, border, border-hover, solid, solid-hover, muted text and text.
Blue is reserved for focus, selection and links. Green, amber and red each
carry a surface/border/mark/text set for good, attention and failed states.
Values are in the frontmatter (`colors.light`, `colors.dark`).

### Primary

- **Ink** (gray 12): every word on screen, and the fill of the one primary
  action. Gray 11 is its hover and the muted text step.

### Secondary

- **Focus Blue** (blue 9, blue 11, blue 5): the focus ring (blue 9), links
  (blue 11) and a selected row (blue 5). Nothing else.

### Tertiary

- **Status sets** (green, amber, red, steps 3/7/11/12): surface 3, border 7,
  mark 11, text 12. Amber means Attention only; red means failed or
  destructive.

### Neutral

- **Slate grays** (gray 1–10): 1 canvas, 2 panel, 3 control, 4 hover,
  5 selected, 6 separator, 7 border, 8 border-hover, 9 solid, 10 solid-hover.

### Named Rules

**The Third Cue Rule.** Colour never carries a status alone; the word and the
glyph come first.

**The Blue Is Not An Action Rule.** Use blue only for focus, selection and
links. The primary action stays neutral: gray 12 fill, gray 11 on hover.

**The Allowlist Rule.** A new foreground/background pairing enters
`design.json` and the contrast test before a component uses it.

- Make the destructive button outlined: red 11 text on a red 7 border, on
  gray 1 or 2.
- Give fields and checkboxes a gray 9 border; button borders and separators
  stay on gray 7.
- Put a link on gray 1 or 2 only.
- Put status words on step 12, on the page and inside a status box; never a
  status mark on step 9 (fails contrast in light).
- Give a primitive type its plain word in gray 11, no hue.

## Typography

**Body Font:** Geist (with Helvetica Neue, Helvetica, sans-serif)
**Label/Mono Font:** Geist Mono (with SFMono-Regular, Menlo, monospace)

**Character:** Geist for every word on screen; Geist Mono for a machine value
only. Both are self-hosted; no runtime CDN fetch.

### Hierarchy

- **Title** (600, 20px, 28px line, −0.4px): screen title.
- **Heading** (600, 16px, 24px line, −0.2px): section heading, dialog title.
- **Prose** (400, 14px, 20px line): sentences — a notice, a dialog body.
- **Row** (400, 13px, 20px line): table row, button label, field. Weight 500
  marks the row identifier and nothing else.
- **Meta** (400, 12px, 16px line): meta line, chip, column header, hint.
- **Mono label** (Geist Mono 400, 12px, uppercase, 0.08em): a card's kind
  label or a small section header. A fact label or a dialog group legend
  widens to 0.12em (`tracking-mono-wide`).

### Named Rules

**The Machine Value Rule.** Geist Mono is for a version, tag, path, ref or
commit hash, and nothing else. Outside a mono label it takes the size of its
slot.

**The rem Rule.** Never below 12px, and never a font size in px — the ramp is
in rem, so 200% zoom keeps working.

## Layout

One frame per screen: sidebar plus panel, the connect gate, or Settings. The
design width is 1440px; below 1024px the sidebar folds into a 48px bar.

One fixed density: a table row, header, list row and nav item are all 32px
(20px line plus 6px above and below). A control inside a row is 24px, the WCAG
2.2 2.5.8 floor; a control in a band, dialog or form is 32px. The Inventory is
checked against 18 rows visible at 1440x900.

Spacing runs a six-step scale on a 4px base with no half steps, from tight
(4px, icon beside a word) through inline (8px, between controls), cell (12px,
table cell and card sides), panel (16px, panel and dialog edge) and section
(24px, between blocks) to page (32px, screen edge).

## Elevation & Depth

Flat by default. The page uses tonal steps and borders, never a shadow. There
is one shadow, `float` (0 4px 12px, black at 12% in light and 50% in dark),
always paired with a 1px gray 7 border, and only for a menu, popover or
dialog.

### Motion

Only what floats moves, by opacity alone: 300ms in and 200ms out, ease-out,
for a menu, popover, hover card, dialog, backdrop or the selection bar. A
hover or focus colour change takes 150ms ease-out. The skeleton shimmers on a
1400ms linear loop; the busy spinner turns on 800ms linear and keeps turning
under reduced motion as the one sign of busy. A hover card waits 400ms to open
and 150ms to close; keyboard focus opens it at once.

The connect gate's arrival is the one entrance animation (ADR-0022, amended by
ADR-0033): the whole sequence within 600ms, cubic-bezier(0.16, 1, 0.3, 1), on
opacity, translateY, scaleX and blur, once on mount. Its rule is gray, never
amber.

### Named Rules

**The One Shadow Rule.** Never stack shadow levels, and never put a shadow on
something that does not float.

**The Floating Motion Rule.** Never animate anything that does not float, and
never with scale or overshoot.

## Shapes

Three radii. Chip (4px) for a chip or tag; control (6px) for a button, field,
card or panel; float (12px) for a menu, popover or dialog only. Borders are
1px: gray 7 for buttons, cards and separators, gray 9 for fields and
checkboxes.

## Components

Owned components live in `packages/web/src/ui/`, each with a Storybook story.
Every control shows the same focus ring: 2px blue 9, offset 2px.

### Buttons

- **Shape:** control radius (6px), 1px border, row type at weight 500.
- **Primary:** gray 1 text on a gray 12 fill; gray 11 on hover. 32px high in a
  band or dialog, 24px inside a row.
- **Quiet:** gray 12 text, no fill, gray 7 border; gray 3 on hover.
- **Ghost:** gray 11 text, no fill or border; gray 3 and gray 12 text on hover.
- **Danger:** red 11 text on a red 7 border, no fill; red 3 on hover.
- **Busy:** a spinner beside the `{Verb}ing…` label; the button stays focusable
  with `aria-disabled`.
- **Icon button:** 32px square, named by its action, with a tooltip.

### Chips

- **Status badge:** one per row, the worst reading, 20px high, chip radius,
  meta type at 500, 8px side padding, a 6px dot plus a `CONTEXT.md` word.
  Every family takes the same set: good is green 12 on green 3 with a green 7
  border at half strength and a green 11 dot; attention the same in amber,
  failed in red. Neutral and unknown share gray 11 on gray 3 with a
  half-strength gray 7 border and a gray 11 dot.

### Cards / Containers

- **Corner Style:** control radius (6px).
- **Background:** gray 1, with a 1px gray 7 border that turns amber 7 when the
  card drifts.
- **Header:** a mono label for the kind, the title in Geist Mono, data on the
  right in mono meta; it wraps rather than overflows on a narrow card.
- **Internal Padding:** panel (16px).

### Inputs / Fields

- **Style:** 32px high, gray 1 fill, 1px gray 9 border, control radius. A path
  sets its value in Geist Mono.
- **Label and hint:** a visible label above; the hint sits between label and
  field.
- **Error:** the border turns red 7 and one `✕` line in red 11 appears under
  the field, on submit.

### Navigation

- **Nav item:** 32px high, control radius, row type. Gray 11 at rest; gray 3
  fill and gray 12 text on hover; gray 4 fill, gray 12 text and weight 500 when
  current.
- **Segmented control:** the pressed segment is gray 4 with a gray 7 border;
  hover stays a step below on gray 3.

### Notice

A failure or outcome stated after its cause, with one action named by its
exact control label. The block form is a filled box on step 3 with a step 7
border and status text on step 12; inside a table row it becomes an inline rule on the
left edge instead of a box.

## Do's and Don'ts

### Do:

- **Do** add a new colour pairing to `design.json` and the contrast test
  before a component uses it.
- **Do** write sizes in rem.
- **Do** mark the row identifier with weight 500; let colour carry the rest of
  the rank.
- **Do** right-align a count with tabular figures.
- **Do** fade a floating layer in at 300ms and out at 200ms, on opacity only.
- **Do** keep the spinner turning under reduced motion.
- **Do** stamp `data-theme` and `color-scheme` on the root before first paint,
  so the wrong theme never flashes and native controls follow it.
- **Do** use a tonal step or a border for a surface on the page, never a
  shadow.
- **Do** read a gray step's task from its number: 1 canvas, 2 panel,
  3 control, 4 hover, 5 selected, 6 separator, 7 border, 8 border-hover,
  9 solid, 10 solid-hover, 11 muted text, 12 text.

### Don't:

- **Don't** let colour alone carry a status.
- **Don't** fill a button with blue: white on blue 9 is about 3:1.
- **Don't** let amber decorate; it means Attention.
- **Don't** use a status mark on step 9.
- **Don't** put a link on gray 3 or darker.
- **Don't** write a colour, size or spacing as a literal value in a component.
- **Don't** go below 12px, or set a font size in px.
- **Don't** animate anything that does not float, or add a second entrance
  animation.
- **Don't** stack shadow levels; there is one shadow.
- **Don't** give a primitive type a hue.
- **Don't** edit `tokens.css` or `DESIGN.md` by hand; change `design.json` and
  regenerate.
