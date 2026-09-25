# ADR-0033 — A neutral, two-theme design system replaces Control Room

- **Status:** Accepted
- **Date:** 2026-09-21 (decided across the tickets of wayfinder map
  [#984](https://github.com/fimoklei/maestro/issues/984), 2026-09-14 to
  2026-09-21)
- **Supersedes** ADR-0008 (Control Room).
- **Amends** ADR-0024 (a success toast, the warning glyph) and ADR-0022 (the
  gate's rule turns slate).
- **Stands:** ADR-0004 (Tailwind v4 `@theme`, shadcn/ui owned in the repo),
  ADR-0025 (copy), ADR-0032 (the folder chooser).

## Context

Control Room was a dark, monospace system imported whole from a design tool.
It had one theme. The light theme was cut in #209 because 13 of 20 text
elements failed AA. Amber meant "act", "attention" and decoration at once.
Spacing ran on half steps, radii on 3/4/5/6, text went down to 10px, and rows
were 38px. `index.html` hard-coded `data-theme="dark"`. Each screen had grown
its own layout, so an agent building the next one copied a neighbour and the
neighbours disagreed.

The map replaced the palette, the typography and the screen layout instead of
extending them. Requirements it did not reopen: the cockpit stays dense, every
text reaches WCAG 2.2 AA in both themes from the first version, status reads
without colour, and the chain `design.json` → `tokens.css` → `DESIGN.md` stays.

## Decision

**Maestro's design system is a neutral Radix-grammar palette in a light and a
dark theme, Geist type, one fixed density, and one frame for every screen.
Vercel gives the look; Vercel, Linear and Circle are the references a new
pattern is measured against.**

The values below are the record until the first build job writes them into
`.impeccable/design.json`. After that `design.json` wins (`design.md`).

1. **Token grammar.** Radix Colors 3.0.0, values unchanged, light and dark
   ramps on the same step numbers. Each step has one task: 1 canvas, 2 panel,
   3 control, 4 hover, 5 selected, 6 separator, 7 border, 8 border-hover,
   9 solid, 10 solid-hover, 11 text-muted, 12 text. The neutral role is named
   `gray` and its values are `slate`, all 12 steps. `gray` itself misses AA by
   0.02 in light. Status scales `green`, `amber` and `red` keep steps 3, 7, 11
   and 12, with text on 12 and the mark on 11. `blue` keeps 5, 9 and 11 for
   selection, the focus ring and links, and never fills a button or carries a
   status. One black alpha, `rgba(0, 0, 0, 0.5)`, is the dialog backdrop. The
   list closes at these five scales. The hex table and the contrast
   measurements are in [#988](https://github.com/fimoklei/maestro/issues/988).
2. **Roles.** The primary action is neutral: slate 12 fill, slate 11 on hover.
   The destructive button is outlined, red 11 text on a red 7 border. Fields
   and checkboxes take a slate 9 border, which is the 3:1 that SC 1.4.11 asks;
   button borders and separators stay on 7. A link sits on slate 1 or 2 only.
   Amber means Attention and never decorates, so the logo and the connect
   gate's rule turn slate. That amends ADR-0022, whose arrival otherwise
   stands.
3. **Status.** Five families: Good green ✓, Attention amber ↑ or ⚠, Failed
   red ✕, Unknown slate ?, Neutral slate. The word is the first cue, the glyph
   the second, the colour the third. No Radix good/fail pair stays apart under
   deuteranopia, so colour alone never carries a status. A badge takes
   Spectrum's calm data-table form: step 3 fill, step 7 border at half
   strength, a dot on 11 and the word on 12; Neutral and Unknown share the
   slate badge with the word on 11 (#1069). The word carries the status, so a
   badge drops the glyph; a mark without a visible word keeps it. A primitive type is
   its plain word in slate 11, with no hue and no icon.
4. **The allowlist.** Seventeen foreground and background pairs are documented
   and measured, each at its own floor (4.5:1 text, 3:1 mark, field border and
   focus ring). `tokens-contrast.test.ts` checks them once per theme, read from
   both blocks of `tokens.css`, in the web lane. A pairing outside the list is
   not used in a component. It enters the list, and passes, first.
5. **Two themes and the switch.** Light and dark are equal. The cockpit opens
   in the operating system's theme. The reader can pin **System**, **Light** or
   **Dark** in one place, the **Interface theme** row on Settings →
   Appearance. The pin lives in `localStorage`, because only that is readable
   before first paint. `data-theme` and `color-scheme` sit on `<html>`, stamped
   by an inline script in `index.html`, and follow the media query live while
   on *System*. Storybook gets a Light / Dark toolbar on the same attribute,
   opens in Light, and has no per-theme stories. CI renders no theme.
6. **Typography.** Geist and Geist Mono (OFL 1.1), one variable woff2 per
   family, sizes in `rem`. Five sizes: `meta` 12/16, `row` 13/20, `prose`
   14/20, `heading` 16/24 at 600 and −0.2px, `title` 20/28 at 600 and −0.4px.
   Weights 400, 500 and 600. In a row colour carries rank, and 500 marks the
   identifier only. Geist Mono is for a machine value (version, tag, path, ref,
   hash) at the size of its slot. Headers are sentence-case Geist, and counts
   use tabular figures.
7. **Density.** One fixed density. Every row is 32px, and at 1440×900 the
   Inventory shows at least 18 rows. Controls are 24px in a row and 32px
   elsewhere. Spacing has a 4px base and six steps: `tight` 4, `inline` 8,
   `cell` 12, `panel` 16, `section` 24, `page` 32. Radius is 4 for a chip, 6
   for a control, card or panel, and 12 only for what floats. The page uses
   borders and tonal steps. One shadow exists, for menu, popover and dialog.
8. **Motion.** Only what floats fades, by opacity alone. Four tokens: `quick`
   150 ms, `float` 300 ms in and 200 ms out, `loop` 1400 ms, `spin` 800 ms.
   All are `ease-out`, and the two loops are `linear`. Two hover-card delays,
   400 ms to open and 150 ms to close. Under reduced motion everything is
   instant or still except the spinner.
9. **The frame.** Three frames: a 244px sidebar plus one panel, the connect
   gate, and Settings. The panel has two 48px bands, one table and a 360px
   detail pane, and only its content scrolls. Each kind of action has one
   place, and no button sits in a table row. The design rules for
   agents carry the rest.
10. **The cockpit waits for the server.** No status shows before the server
    confirms it, for every class of action. Only UI-state that never reaches
    the server (selection, filter, theme, a closing menu) reacts at once. A
    write locks its own control and shows the spinner at once. Only what the
    server locks is locked. Busy lives in the button, in a dialog that stays
    open with Escape blocked, or in the row's ⋮ icon. A failure states itself
    where the press was made and stays. Vercel does the same, and the code
    already did: no hook uses `onMutate`.
11. **Re-reading.** Every table screen has one icon-only control,
    `Re-read {screen name}`. Nothing re-reads unasked except on open, plus
    Deploy-state's rows on tab return. The Harness's `git fetch` on window
    focus goes, which reverses #889. It blocked the row actions for 2 to 4 s
    without being asked. No read retries (`retry: false`), so a failure states
    itself at once instead of about 7 s late. A failed read keeps the previous
    rows and recovers through a notice action carrying the control's own
    label. *Reload the page* survives only in the server's request-shape
    messages. *Refresh* stays retired and **Retry check** retires.
12. **Where a component comes from.** shadcn/ui first, copied in and restyled
    (ADR-0004). Spectrum UI second, copied in under Apache-2.0: the repo gains
    `THIRD-PARTY-NOTICES.md`, and each copied file opens with
    `Adapted from Spectrum UI (Apache-2.0)`. Circle is read, never copied.
    Owned from scratch last. Accepted dependencies: `@tanstack/react-table`,
    `sonner`, `lucide-react`, Radix primitives, `class-variance-authority`,
    `clsx`, `tailwind-merge`, and `motion`. `motion` came in by the owner's
    call, against the recommendation, for later animation. Every `motion`
    animation takes its duration and easing from the four motion tokens and
    honours `prefers-reduced-motion`. Lucide draws controls at 16px and stroke
    1.5. Status marks are plain text glyphs.
13. **ADR-0024 is amended twice.** A **toast** exists, bottom right, for a
    success the reader may miss, such as a removed row or a result on another
    screen. It is success only, never the only copy of a fact, stays 5 s,
    pauses on hover and focus, and announces through the polite region. It
    replaces the `success` notice after Deploy and the removal trace. The
    warning glyph changes from `▲` to `⚠` (§6). The notice contract, its
    levels and its derived role stand.

## Consequences

- The rebuild runs in the existing tree in eleven jobs
  ([#1002](https://github.com/fimoklei/maestro/issues/1002)). Tokens come
  first, with the cockpit pinned to dark and the old token names kept as
  aliases. The pin comes off and the aliases go in job 11. No job removes a
  function. Of 71 components 33 retire, and each one's behavioural claims move
  to its successor's test first (`testing.md`).
- Proof per job is a dark screenshot plus a narrow width and 200% zoom. Both
  themes are proven at job 11, because the reader cannot reach Light before it.
- Approved sentences stand, with three exceptions where the named control or
  act no longer exists: sentences naming **Retry check** or a reload after a
  failed read, two sentences naming the retired browse controls, and the
  visible `Loading …` sentences outside a dialog.
- `theme.css` carries two `@theme` blocks. `@theme inline` holds the colours and
  the one shadow, so a utility points at the raw token and flipping `data-theme`
  re-skins the cockpit; the plain `@theme` holds the constants that never switch
  (fonts, type ramp, density, spacing, radii, motion), which Tailwind needs
  declared there to emit utilities. The two font faces are declared in that file
  rather than through `@fontsource-variable/geist{,-mono}`'s `index.css`, which
  carries five subsets and would ship all five; a runtime CDN fetch would break
  the offline scope.
- `DESIGN.md` still describes Control Room until job 1 regenerates it.
- Claude Design mirrors the system and is never upstream of the repo.

## Rejected alternatives

- **Radix `gray` as the neutral.** Muted text on step 5 measures 4.48 in light,
  and on blue 5 it measures 4.49. `slate` passes every pair with no exception
  rule.
- **Status marks on step 9.** In light, green 9 on green 3 is 2.82 and amber 9
  is 1.45. Step 11 is at least 4.21 in both themes.
- **Vercel's blue for success.** Geist's own guidance and Radix both use green,
  and blue stays free for focus and selection.
- **A coloured primary action.** White on blue 9 is about 3:1, and any hue on
  the primary button competes with status.
- **Follow the system theme with no switch** (Apple). That advice is for native
  apps. Vercel, Linear and Circle all offer the three-way choice in a browser.
- **The theme in `~/.maestro/config.json`.** A server read flashes the wrong
  theme, and the theme is a screen preference, not Harness data.
- **Showing a result before the server answers** (Linear). Almost nothing in
  Linear can fail. Every Maestro action can, and the cockpit exists to report
  verified state.
- **Dimmed or quiet loading.** Dimmed loses on legibility, and quiet leaves a
  first load empty. Skeleton rows in the table's own shape won.
- **Vercel's 0.96 scale and overshoot easing, and Radix's 700/300 hover
  delay.** Both lost in the playground on a 23-row table.
- **Spectrum UI and Circle as package dependencies.** ADR-0004 stands, so
  everything is rewritten to the tokens before it enters.
