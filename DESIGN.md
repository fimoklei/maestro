---
name: Maestro
description: A dense, dark, monospace-heavy cockpit for seeing and steering an AI agent setup.
colors:
  bg-0: "#0b0d10"
  bg-1: "#0d1014"
  surface-card: "#0f1318"
  surface-inset: "#11161c"
  surface-active: "#171d24"
  border-faint: "#13181e"
  border-row: "#161b22"
  border-strong: "#1d232b"
  border-chip: "#232a33"
  border-dashed: "#2a313a"
  border-drift: "#4a3a1c"
  border-amber-dim: "#3a3327"
  text-1: "#e6e9ed"
  text-2: "#c3cad2"
  text-3: "#aeb6bf"
  text-muted: "#8a94a0"
  text-dim: "#7d8794"
  amber: "#e8a33d"
  green: "#62c47e"
  on-accent: "#0b0d10"
  type-skill: "#7aa5d8"
  type-hook: "#b48ad6"
  type-mcp: "#5fbfb0"
  type-bundle: "#e8a33d"
typography:
  title:
    fontFamily: "Space Grotesk Variable, Space Grotesk, Helvetica Neue, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  subtitle:
    fontFamily: "Space Grotesk Variable, Space Grotesk, Helvetica Neue, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Space Grotesk Variable, Space Grotesk, Helvetica Neue, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  chip:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, SFMono-Regular, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.12em"
    lineHeight: 1.4
rounded:
  tag: "3px"
  control: "4px"
  item: "5px"
  card: "6px"
spacing:
  card-x: "14px"
  row-y: "9px"
  header-y: "10px"
  grid-gap: "12px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-accent}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-success:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-accent}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "#00000000"
    textColor: "{colors.amber}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-quiet:
    backgroundColor: "#00000000"
    textColor: "{colors.text-muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-dashed:
    backgroundColor: "#00000000"
    textColor: "{colors.text-muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.card}"
    padding: "14px"
  card-drift:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.card}"
    padding: "14px"
  chip-ok:
    backgroundColor: "#62c47e1a"
    textColor: "{colors.green}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "2px 7px"
  chip-drift:
    backgroundColor: "#e8a33d1a"
    textColor: "{colors.amber}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "2px 7px"
  chip-dim:
    backgroundColor: "#8a94a014"
    textColor: "{colors.text-muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "2px 7px"
---

# Design System: Maestro

The "Control Room" system is designed in Claude Design (project
`382d1f68-3ef6-49f3-a058-a6eec53e6a86`, "Maestro Design System") and read
through the DesignSync tool. It is owned in the app as Tailwind v4 `@theme`
tokens (ADR-0008); `packages/web/src/styles/tokens.css` is what the browser
actually loads, and therefore what ships.

This file is the agent-facing summary, regenerated from those tokens with
`/impeccable document`. It is derived, never hand-maintained: on any conflict
the live design project wins, and `tokens.css` wins over the prose here.

## 1. Overview

**Creative North Star: "The Control Room"**

Maestro is a room you step into to read instruments, not a page you browse. The
surfaces are calm near-black with a faint blue cast; structure is drawn with 1px
lines rather than shadows; and almost every piece of text that carries data is
set in monospace. The effect is an instrument panel: nothing competes for
attention until something needs it.

Two colours carry all meaning. Amber means *act* — it marks drift, the brand
mark, and the single primary action in a view. Green means *rest* — in sync,
healthy, confirmed. Everything else is a step on a grey ramp. Because the palette
is this narrow, a single amber chip in a long list is impossible to miss, which
is exactly the product's core signal.

The system explicitly rejects the generic SaaS dashboard (hero metric tiles,
gradients, pill shapes, cards inside cards), the friendly consumer app
(illustrations, emoji, soft rounded surfaces), the structureless terminal dump,
and heavily animated interfaces. Density here is not decoration — it is how a
whole agent setup fits on one screen.

The system ships one theme: dark. A light "lights on" variant is designed
upstream, but it is not shipped — no theme toggle exists yet and its ramp failed
WCAG 2.2 AA, so it was removed from `tokens.css` until a toggle lands and the
light ramp is re-derived to AA (issue #209).

**Key Characteristics:**

- Cool near-black canvas, five surface steps, zero shadows
- Monospace is the dominant voice; the sans is only used for chrome
- Exactly two signal colours, plus four fixed primitive-type colours
- Tight 3–6px radii; nothing pill-shaped, no circles except status dots
- Cockpit density: 14px card padding, 9px rows, 12px gaps, 24px between sections
- Flat fills only — no gradients, textures, blur, or transparency layers

## 2. Colors

A cool near-black grey ramp with two signal colours and four reserved
primitive-type hues; hierarchy comes from lightness steps and borders, never from
shadow.

### Primary

- **Signal Amber** (`#e8a33d`): the brand colour and the act colour. Used for
  drift, the logo tile, and the one amber-filled button per view. Its rarity is
  what makes it work.

### Secondary

- **Signal Green** (`#62c47e`): in sync, healthy, and the final confirm on a
  deploy. Never used decoratively.

### Tertiary

Four fixed hues reserved exclusively for the primitive-type tag — never reused
anywhere else in the interface.

Values below are the shipped dark theme; the light equivalents live upstream and
are deferred (see the note in §1).

- **Skill Blue** (`#7aa5d8`)
- **Hook Purple** (`#b48ad6`)
- **MCP Teal** (`#5fbfb0`)
- **Bundle Amber** (`#e8a33d`)

### Neutral

- **App Canvas** (`#0b0d10`): the page behind everything.
- **Raised Chrome** (`#0d1014`): status bar and sidebar.
- **Card Surface** (`#0f1318`): the standard panel fill.
- **Inset Surface** (`#11161c`): recessed regions inside a card.
- **Active Surface** (`#171d24`): hover and active nav.
- **Text ramp** (`#e6e9ed` → `#7d8794`): five steps from primary text down to dim
  labels. Every step clears WCAG 2.2 AA (≥4.5:1) on every surface it renders on.
  Dim is for micro-labels and disabled states, never for body copy.
- **Border ramp** (`#13181e` → `#232a33`): six steps from hairline to chip
  outline. A dashed border marks an additive affordance (`#2a313a`); a warm
  outline marks a card whose contents drift (`#4a3a1c`). The dim amber outline
  used by the ghost button is `#3a3327`.

### Named Rules

**The Two Signals Rule.** Amber means act, green means rest. No third signal
colour is introduced, and no signal colour is ever used for decoration. At most
one amber-filled button exists per view.

**The Reserved Hue Rule.** Skill blue, hook purple, mcp teal, and bundle amber
belong to the primitive-type tag alone. Borrowing them for anything else breaks
the one place where colour carries a taxonomy.

**The Never-Colour-Alone Rule.** Any state expressed in colour also carries a
glyph and a word: `● in sync`, `▲ 2 drift`. The signal must survive without
colour perception.

## 3. Typography

**Chrome Font:** Space Grotesk Variable (fallback Helvetica Neue, sans-serif)
**Data / Mono Font:** JetBrains Mono Variable (fallback SFMono-Regular, Menlo,
monospace)

Both are self-hosted via `@fontsource-variable`; no runtime CDN fetch, because
the cockpit is local-first and must work offline.

**Character:** A geometric sans handles the few pieces of interface chrome —
section titles and navigation — while everything the user actually reads for
information is monospace. Names, versions, paths, timestamps, button labels, and
micro-labels are all mono, which keeps columns aligned and semver instantly
scannable. The pairing contrasts on a real axis (geometric sans against a
technical mono) rather than mixing two similar sans faces.

### Hierarchy

- **Title** (600, 16px): panel and view titles, sentence case.
- **Subtitle** (500, 14px): navigation items and secondary headings.
- **Body** (400, 13.5px): the small amount of prose the cockpit contains.
- **Data** (400, 13px, mono): primitive names, target names, paths, versions.
- **Description** (400, 12.5px, mono): supporting one-liners under a name.
- **Chip** (400, 11px, mono): status capsules and button labels.
- **Label** (400, 10px, mono, 0.12em tracking, uppercase): micro-labels such as
  `TARGETS` and `DEPLOY TO`.

### Named Rules

**The Mono-Is-Data Rule.** If it is a name, a version, a path, a timestamp, or an
action, it is lowercase mono. If it is interface chrome, it is sentence-case
sans. There is no third case.

**The 10px Floor Rule.** Nothing is set below 10px, ever. Density is bought with
padding and line-height, not by shrinking type past legibility.

**The Fixed Vocabulary Rule.** Primitive, bundle, target, deploy-state, drift, in
sync, central inventory, compose, register. These exact words, no synonyms.
Version drift is written `1.0.0 → 1.2.0`. Never emoji.

## 4. Elevation

This system has **no shadows at all**, in either theme. Depth is expressed
entirely through tonal layering and 1px borders: five surface steps from the app
canvas up to the active surface, plus a six-step border ramp. A panel reads as
raised because it is one lightness step lighter than what surrounds it and is
outlined with a hairline, not because it floats.

Backgrounds are flat fills only. No gradients, textures, patterns, blur, or
backdrop-filter. The single use of alpha is the 10–12% tint inside a status chip,
paired with a ~25–30% alpha border of the same colour.

### Named Rules

**The No-Shadow Rule.** `box-shadow` does not appear in this system. Adding one
to "soften" the light theme produces a different design system, not this one.

**The Borders-Do-The-Work Rule.** Structure, grouping, and separation are all
drawn with 1px lines from the border ramp. When a boundary feels weak, move one
step up the ramp — do not reach for a shadow or a heavier stroke.

## 5. Components

### Buttons

Mono-typeset, compact, never pill-shaped. Five variants, each with a fixed job.

- **Shape:** 4px radius (5px at `lg`), 1px border on every variant.
- **Primary:** amber fill, near-black text, bold. One per view — the main action.
- **Success:** green fill, near-black text, bold. Reserved for confirming a deploy.
- **Ghost:** transparent with a dim amber outline and amber text — the row-level
  `deploy →`.
- **Quiet:** transparent with a grey chip-step outline and muted text.
- **Dashed:** transparent with a dashed outline — additive actions like
  `+ register`.
- **Sizes:** `sm` 10px / `md` 11px / `lg` 12px, with padding scaling from
  `2px 8px` to `10px 16px`.
- **Hover / Focus:** background or border moves one step up its ramp over
  120–160ms ease-out. No scale, no lift, no shadow.
- **Disabled:** text drops to the dim step; the cursor becomes `not-allowed`.

### Chips

- **Style:** 1px border, 4px radius, 11px mono, a 10–12% alpha fill of the tone
  colour with a ~25–30% alpha border.
- **Tones:** `ok` green (`● in sync`), `drift` amber (`▲ 2 drift`), `dim` grey for
  neutral meta such as versions and counts.
- **State:** chips are read-only status, not interactive filters; a chip always
  leads with its glyph.

### Cards

- **Corner Style:** 6px.
- **Background:** card surface, one step above the surrounding chrome.
- **Shadow Strategy:** none — see Elevation.
- **Border:** 1px strong border; warms to `#4a3a1c` when the card's contents
  drift, which is the only structural colour change in the system.
- **Header:** optional mono row with an uppercase kind label (`global` in skill
  blue, `local` in muted grey), a truncating title, and a right-aligned status
  chip, separated by a 1px row border.
- **Internal Padding:** 14px horizontal, 10px on headers, 9px on rows. Rows manage
  their own padding; the card only pads when it holds free content.

### Inputs

- **Style:** inset surface fill, 1px chip-step border, 4px radius, 13px mono.
- **Focus:** border moves to the amber dim step; focus is always visibly
  distinct, never removed.
- **Error:** amber text plus a written message tied to the field — never a red
  border alone.

### Navigation

- **Style:** a 208px sidebar of mono nav items at 13.5px, plus a 52px status bar
  across the top.
- **Default:** muted text with a dim glyph.
- **Hover:** surface moves one step to active.
- **Active:** raised surface, chip-step outline, amber glyph.

### Iconography

There are no icon sets, icon fonts, or emoji. Iconography is a fixed vocabulary
of unicode glyphs set in the mono font at 12–16px: `▤` inventory, `⇶`
deploy-state, `⧉` compose, `▲` drift (always amber), `●` in sync or status dot,
`→` action direction, `+` add, `✕` remove, `✓` done. The logo is typographic — a
bold mono "M" on an amber rounded tile.

## 6. Do's and Don'ts

### Do:

- **Do** express depth with the five surface steps and the six-step border ramp.
- **Do** set every name, version, path, timestamp, and action label in lowercase
  mono; reserve the sans for sentence-case chrome.
- **Do** pair every colour signal with a glyph and a word (`▲ 2 drift`), so the
  meaning survives without colour.
- **Do** keep to one amber-filled primary button per view.
- **Do** chain meta fragments with the middle dot: `agent-harness · main · 9
  primitives`.
- **Do** write drift as a version pair, `1.0.0 → 1.2.0`, in mono, never rounded.
- **Do** keep transitions to 120–160ms ease-out on background and border colour,
  with an instant alternative under `prefers-reduced-motion`.
- **Do** use dashed borders for additive affordances, and only for those.

### Don't:

- **Don't** add a `box-shadow` anywhere, in either theme.
- **Don't** use gradients, textures, blur, backdrop-filter, or glassmorphism.
- **Don't** build hero metric tiles, gradient accents, pill shapes, or cards
  nested inside cards — that is the generic SaaS dashboard this system rejects.
- **Don't** add illustrations, emoji, or reassuring marketing copy; the cockpit
  shows state, it does not comfort.
- **Don't** strip structure down to a bare terminal dump; mono is the voice, but
  hierarchy and alignment still do the reading work.
- **Don't** add entrance animations, hover scaling, or decorative motion.
- **Don't** introduce a third signal colour, or borrow a primitive-type hue for
  anything other than the type tag.
- **Don't** set any text below 10px.
- **Don't** use `border-left` or `border-right` above 1px as a coloured accent
  stripe.
- **Don't** use "you" or "we" inside the cockpit, or invent synonyms for the fixed
  vocabulary.
