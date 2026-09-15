# The 12-step scale: what each step does, and how light and dark both reach AA

Answers issue #985 (parent map #984). Primary sources only, read **2026-09-14**.
Measurements were run against `@radix-ui/colors@3.0.0` sRGB hex values with the
WCAG 2.2 contrast-ratio formula; the script is reproduced at the end.

## 1. The Radix 12-step grammar

Source: [Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale).

| Step | Task (Radix wording) | Group |
|---|---|---|
| 1 | App background | Backgrounds |
| 2 | Subtle background | Backgrounds |
| 3 | UI element background | Component backgrounds (normal) |
| 4 | Hovered UI element background | Component backgrounds (hover) |
| 5 | Active / Selected UI element background | Component backgrounds (pressed, selected) |
| 6 | Subtle borders and separators | Borders (non-interactive) |
| 7 | UI element border and focus rings | Borders (interactive) |
| 8 | Hovered UI element border | Borders (strong, focus rings) |
| 9 | Solid backgrounds | Solid fills; "highest chroma of all steps in the scale" |
| 10 | Hovered solid backgrounds | Solid fill hover, "where step 9 is the component's normal state background" |
| 11 | Low-contrast text | Text |
| 12 | High-contrast text | Text |

Text rules on the same page:

- "Steps 11 and 12 are designed for text." They "are guaranteed to Lc 60 and
  Lc 90 APCA contrast ratio on top of a step 2 background from the same scale."
  That is the only contrast guarantee Radix documents, and it is APCA, not
  WCAG 2.
- Text over step 9: most step-9 colours take white text; "Sky, Mint, Lime,
  Yellow, and Amber are designed for dark foreground text" on steps 9 and 10.
- Light/dark: in light mode use white as the page background; in dark mode use
  step 1 or 2 of the relevant scale, through mutable aliases.

Alpha variants ([Scales](https://www.radix-ui.com/colors/docs/palette-composition/scales),
[Radix Themes › Color](https://www.radix-ui.com/themes/docs/theme/color)):

- Every scale ships as base, Alpha, Dark and Dark Alpha, 12 steps each; the
  package also exports P3 and P3-alpha variants
  ([Releases](https://www.radix-ui.com/colors/docs/overview/releases): 3.0.0
  "Add P3 colorspace versions of all scales").
- "Every color has an alpha variant which is designed to appear visually the
  same when placed over the page background. This is a powerful tool that
  allows colors to look naturally when overlayed over another background."
- Black Alpha and White Alpha "are designed for overlays and don't change
  across light and dark theme."
- Mechanism (custom-palette source, `getAlphaColor`): the alpha step is solved
  from `target = background * (1 - alpha) + foreground * alpha` so that the
  alpha colour composited on the page background reproduces the solid step
  ([generate-radix-colors.tsx](https://github.com/radix-ui/website/blob/main/components/generate-radix-colors.tsx)).

CSS shape ([Usage](https://www.radix-ui.com/colors/docs/overview/usage)):
`--[color]-[number]`; light scales bind to `:root`, `.light`, `.light-theme`;
dark scales to `.dark`, `.dark-theme`. Same variable name, both themes: the
step number is the API and the theme class swaps the value.

## 2. AA on both ramps

### What the standards say

- WCAG 2.2 SC 1.4.3 (AA): text "has a contrast ratio of at least 4.5:1";
  large text (≥ 18 pt, or 14 pt bold) at least 3:1. SC 1.4.11 (AA): UI
  components and graphical objects 3:1 against adjacent colours. SC 1.4.6
  (AAA): 7:1 / 4.5:1 ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum)).
- Contrast ratio = `(L1 + 0.05) / (L2 + 0.05)` on relative luminance
  ([definition](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)).
- APCA reports Lc 0–105+; Lc 90 preferred body text, Lc 75 minimum body text,
  Lc 60 minimum for other readable content text, Lc 45 headlines, Lc 30
  spot-readable, Lc 15 non-text minimum. It states WCAG 2 "overstates contrast
  for dark colors" and is "the candidate contrast method for the future
  WCAG 3" ([APCA in a Nutshell](https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA_in_a_Nutshell.md)).
- WCAG 3.0 Working Draft (10 September 2026): "The contrast algorithm used in
  WCAG 3 is yet to be determined." APCA is normative nowhere
  ([WCAG 3.0 WD](https://www.w3.org/TR/wcag-3.0/)).

So: the legal/conformance target today is WCAG 2 4.5:1. Radix's guarantee is
APCA. The two do not agree, and the measurement below shows where.

### Measured: Radix 3.0.0, WCAG 2 ratio, all 31 colour scales

Columns: text step / background step. `text/9` is white on step 9, except
sky, mint, lime, yellow, amber where it is step 12 on step 9 (per Radix).

| Scale | L 11/1 | L 11/2 | L 11/3 | L 12/1 | L 12/2 | L 12/3 | L text/9 | D 11/1 | D 11/2 | D 11/3 | D 12/1 | D 12/2 | D 12/3 | D text/9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| amber | 4.54 | 4.43 | 4.25 | 11.19 | 10.93 | 10.47 | 7.21 | 12.18 | 11.52 | 10.26 | 15.39 | 14.57 | 12.98 | 1.30 |
| blue | 4.67 | 4.53 | 4.25 | 12.38 | 12.00 | 11.26 | 3.26 | 8.72 | 8.38 | 7.08 | 14.02 | 13.47 | 11.37 | 3.26 |
| bronze | 5.69 | 5.50 | 5.06 | 12.09 | 11.67 | 10.74 | 3.59 | 9.66 | 8.99 | 8.10 | 14.56 | 13.55 | 12.21 | 3.59 |
| brown | 5.71 | 5.53 | 5.05 | 12.03 | 11.65 | 10.65 | 3.53 | 9.93 | 9.27 | 8.34 | 14.74 | 13.76 | 12.37 | 3.53 |
| crimson | 5.29 | 5.11 | 4.66 | 12.16 | 11.74 | 10.73 | 3.85 | 8.81 | 8.54 | 7.65 | 13.84 | 13.41 | 12.03 | 3.85 |
| cyan | 4.66 | 4.50 | 4.26 | 11.69 | 11.29 | 10.69 | 3.00 | 9.69 | 9.24 | 7.79 | 14.28 | 13.61 | 11.47 | 3.00 |
| gold | 5.81 | 5.60 | 5.18 | 11.93 | 11.50 | 10.63 | 3.65 | 9.80 | 9.10 | 8.22 | 14.56 | 13.52 | 12.22 | 3.65 |
| grass | 4.99 | 4.82 | 4.54 | 11.92 | 11.53 | 10.85 | 3.03 | 9.75 | 9.30 | 7.91 | 14.58 | 13.92 | 11.84 | 3.03 |
| gray | 5.77 | 5.62 | 5.19 | 15.88 | 15.48 | 14.30 | 3.32 | 9.11 | 8.48 | 7.67 | 16.28 | 15.15 | 13.71 | 5.10 |
| green | 4.65 | 4.49 | 4.21 | 12.13 | 11.72 | 11.00 | 3.16 | 9.87 | 9.37 | 7.86 | 14.38 | 13.65 | 11.45 | 3.16 |
| indigo | 5.90 | 5.70 | 5.35 | 13.01 | 12.56 | 11.80 | 5.21 | 8.96 | 8.63 | 7.34 | 14.14 | 13.62 | 11.59 | 5.21 |
| iris | 5.98 | 5.74 | 5.41 | 13.08 | 12.57 | 11.85 | 5.37 | 8.77 | 8.48 | 7.22 | 14.18 | 13.72 | 11.67 | 5.37 |
| jade | 4.59 | 4.43 | 4.19 | 12.02 | 11.61 | 10.97 | 3.15 | 10.08 | 9.47 | 7.96 | 14.29 | 13.44 | 11.29 | 3.15 |
| lime | 4.70 | 4.56 | 4.29 | 10.75 | 10.44 | 9.82 | 8.14 | 13.00 | 12.29 | 10.51 | 16.29 | 15.40 | 13.17 | 1.17 |
| mauve | 5.77 | 5.62 | 5.17 | 15.92 | 15.53 | 14.29 | 3.30 | 9.02 | 8.39 | 7.58 | 16.25 | 15.12 | 13.66 | 5.08 |
| mint | 5.32 | 5.15 | 4.88 | 10.84 | 10.48 | 9.94 | 7.75 | 10.24 | 9.76 | 8.28 | 15.39 | 14.67 | 12.44 | 1.19 |
| olive | 5.84 | 5.68 | 5.25 | 16.01 | 15.56 | 14.38 | 3.34 | 8.98 | 8.43 | 7.64 | 16.11 | 15.13 | 13.70 | 5.12 |
| orange | 4.41 | 4.25 | 3.99 | 11.36 | 10.94 | 10.27 | 2.97 | 9.23 | 8.85 | 7.83 | 14.78 | 14.18 | 12.54 | 2.97 |
| pink | 5.18 | 5.01 | 4.57 | 11.87 | 11.47 | 10.48 | 4.12 | 8.76 | 8.50 | 7.49 | 13.66 | 13.25 | 11.68 | 4.12 |
| plum | 5.89 | 5.69 | 5.26 | 12.36 | 11.95 | 11.04 | 4.75 | 8.88 | 8.55 | 7.44 | 13.75 | 13.25 | 11.53 | 4.75 |
| purple | 5.96 | 5.75 | 5.36 | 12.91 | 12.45 | 11.61 | 5.18 | 8.79 | 8.41 | 7.36 | 13.99 | 13.37 | 11.71 | 5.18 |
| red | 5.11 | 4.94 | 4.54 | 12.19 | 11.78 | 10.84 | 3.91 | 8.82 | 8.56 | 7.75 | 13.61 | 13.20 | 11.95 | 3.91 |
| ruby | 5.32 | 5.14 | 4.70 | 12.12 | 11.72 | 10.71 | 3.89 | 8.82 | 8.49 | 7.68 | 13.72 | 13.21 | 11.95 | 3.89 |
| sage | 5.83 | 5.63 | 5.24 | 16.06 | 15.51 | 14.43 | 3.36 | 8.98 | 8.44 | 7.64 | 16.14 | 15.16 | 13.73 | 5.17 |
| sand | 5.93 | 5.73 | 5.31 | 16.02 | 15.48 | 14.32 | 3.34 | 9.01 | 8.39 | 7.60 | 16.26 | 15.14 | 13.71 | 5.18 |
| sky | 5.17 | 4.97 | 4.71 | 11.01 | 10.57 | 10.02 | 7.55 | 9.84 | 9.31 | 7.98 | 15.44 | 14.62 | 12.53 | 1.24 |
| slate | 5.79 | 5.65 | 5.22 | 15.98 | 15.58 | 14.41 | 3.30 | 9.06 | 8.45 | 7.64 | 16.25 | 15.15 | 13.70 | 5.13 |
| teal | 4.49 | 4.34 | 4.10 | 11.86 | 11.47 | 10.85 | 3.07 | 10.15 | 9.55 | 8.07 | 14.35 | 13.51 | 11.42 | 3.07 |
| tomato | 4.89 | 4.75 | 4.33 | 11.66 | 11.34 | 10.34 | 3.87 | 8.85 | 8.49 | 7.63 | 13.56 | 13.01 | 11.70 | 3.87 |
| violet | 6.04 | 5.86 | 5.51 | 13.13 | 12.75 | 11.99 | 5.39 | 8.85 | 8.52 | 7.34 | 14.09 | 13.56 | 11.67 | 5.39 |
| yellow | 4.48 | 4.42 | 4.27 | 10.76 | 10.62 | 10.25 | 8.68 | 14.04 | 13.30 | 11.63 | 15.88 | 15.04 | 13.15 | 1.07 |

### AA-safe pairs (WCAG 2, measured, all 31 scales)

| Pair | Light | Dark | Verdict |
|---|---|---|---|
| 12 on 1, 2, 3 | min 9.82 | min 11.29 | AA and AAA everywhere, both themes |
| 11 on 1 | min 4.41 (orange only fails) | min 8.72 | Dark: AA everywhere. Light: AA except orange |
| 11 on 2 | min 4.25; **fails** amber 4.43, green 4.49, jade 4.43, orange 4.25, teal 4.34, yellow 4.42 | min 8.38 | Dark: AA everywhere. Light: AA on 25 of 31 scales |
| 11 on 3 | min 3.99; 13 scales under 4.5 | min 7.08 | Dark: AA. Light: large text only (≥ 3:1) |
| white on 9 | ≥ 4.5 only for indigo, iris, plum, purple, violet, and gray-family in dark; most 3.0–3.9 | same hex, same values; 5 dark-text scales 1.1–1.3 | Large text / UI component (3:1) on most; body text AA on 5 hues only |

Reading: **the dark ramp is comfortably AA on every documented text pair. The
light ramp's step 11 is the risk.** Radix's Lc 60 promise on step 2 does not
carry a WCAG 2 4.5:1 promise; six of the 31 light scales land at 4.25–4.49.
Step 12 is safe everywhere. For a first version that must pass AA in both
themes, put body text on 12, restrict 11 to hues that measure ≥ 4.5 (gray
family, blue, red, crimson, ruby, tomato, pink, purple, violet, indigo, iris,
plum, sky, mint, lime, cyan, grass, gold, bronze, brown all pass on 2), or
measure the chosen hue.

### Custom hues: does the guarantee hold?

- Radix says its own scales "are not intended to be customised" and that custom
  brand colours should be "custom scales alongside Radix scales"
  ([Composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette)).
- The [custom palette tool](https://www.radix-ui.com/colors/custom) takes
  Accent, Gray and Background, and outputs 12-step light and dark scales
  grouped as Backgrounds / Interactive components / Borders and separators /
  Solid colors / Accessible text. Its page states no contrast number.
- Its source ([generate-radix-colors.tsx](https://github.com/radix-ui/website/blob/main/components/generate-radix-colors.tsx))
  shows the method: `colorjs.io` in **OKLCH**; the accent is matched by
  `deltaEOK` distance to the nearest built-in P3 scales, those scales are mixed,
  hue/chroma are set from the source, and the lightness curve is re-eased from
  the background lightness (`transposeProgressionStart` with a bezier easing).
  Step 9 is the accent itself unless it is within ΔE 25 of the background. The
  only contrast check is `getTextColor`: white text on step 9 unless
  `|APCA| < 40`, then a dark OKLCH L 0.25 text. Steps 11/12 inherit the built-in
  scales' lightness; no contrast is verified for a custom hue. So the guarantee
  is **inherited, not checked**; a custom scale must be measured.
- Formulas available to generate or check: WCAG 2 ratio (above), APCA
  (`colorjs.io` `contrastAPCA`, as the Radix tool uses), OKLCH for perceptually
  even lightness steps (the Radix tool's working space). None of the primary
  sources publishes an OKLCH-lightness-to-AA lookup; the reliable path is
  generate in OKLCH, then measure every text pair with the WCAG 2 formula.

## 3. The Vercel DESIGN.md (shadcn.io) mapped onto Radix steps

Source: Vercel Inspired DESIGN.md, shadcn.io, lastUpdated 2026-05-12, author
Dov Azencot ([shadcn.io/design/vercel](https://www.shadcn.io/design/vercel);
`version: alpha`, "an inspired interpretation" — not published by Vercel).
Its `colors:` block holds 36 tokens (the prose says 40; the six gradient stops
are counted as three pairs there), light only; no dark values.

Its own **Known Gaps** section limits what it can supply: "only the
marketing-surface tones (`100`, `1000`, `700`-level) are documented; the
in-product step values are not" of the 100–1000 gray scale and the parallel
blue / red / amber / green / teal / purple / pink scales; the dashboard's
"denser inner surfaces — deployment tables, log viewers, project sidebars" use
"additional gray-scale steps not captured here"; hover tokens, focus-ring
colour and width, and skeleton stops are not captured either. So the file
cannot supply the cockpit's scale steps on its own — it gives three or four
anchor tones per role, and the ramp between them has to come from Radix or be
generated and measured.

| Vercel token | Value | Radix step / role | Note |
|---|---|---|---|
| canvas | #ffffff | 1 (app background) | Radix light mode also uses white |
| canvas-soft | #fafafa | 2 (subtle background) | |
| canvas-soft-2 | #f5f5f5 | 3 (UI element background) | |
| hairline | #ebebeb | 6 (subtle border) | 1.19:1 on canvas; decorative only |
| hairline-strong | #a1a1a1 | 7–8 (interactive border) | 2.58:1 on canvas; under 1.4.11's 3:1 |
| mute | #888888 | 11 (low-contrast text) | **3.54:1 on canvas — fails AA**; large text only |
| body | #4d4d4d | 11–12 | 8.45:1, AAA |
| ink | #171717 | 12 (high-contrast text) | 17.93:1 |
| primary | #171717 | 9 (solid fill) of the neutral | white on it 17.93:1; "the ink IS the brand" |
| on-primary | #ffffff | text over 9 | |
| selection-bg / selection-fg | #171717 / #f2f2f2 | 9 / text over 9 | 16.01:1 |
| link | #0070f3 | blue 11 (text) and blue 9 (fill) at once | 4.55:1 on white — AA by 0.05; white on it 4.55 |
| link-deep | #0761d1 | blue 11 hover / 12 | 5.77:1; 4.51 on link-bg-soft |
| link-bg-soft | #d3e5ff | blue 3–4 | |
| success | #0070f3 | status, same hex as link | see § 4 |
| error | #ee0000 | red 9 / 11 | 4.53:1 on white; 3.31 on error-soft |
| error-deep | #c50000 | red 11–12 | 6.22:1 on white; 4.55 on error-soft |
| error-soft | #f7d4d6 | red 3 | |
| warning | #f5a623 | amber 9 | **2.03:1 on white, 1.79 on warning-soft — not text**; ink on it 8.85 |
| warning-deep | #ab570a | amber 11 | 5.12:1 on white; 4.51 on warning-soft |
| warning-soft | #ffefcf | amber 3 | |
| violet | #7928ca | violet 9 / 11 | 7.07:1; 4.66 on violet-soft |
| violet-deep | #4c2889 | violet 12 | 7.01 on violet-soft |
| violet-soft | #d8ccf1 | violet 3–4 | |
| cyan | #50e3c2 | mint/teal 9 | 1.60:1 on white; dark-text hue like Radix mint |
| cyan-deep | #29bc9b | mint 10 | 2.40:1 — not text; 2.08 on cyan-soft |
| cyan-soft | #aaffec | mint 3–4 | |
| highlight-pink | #ff0080 | pink/crimson 9 | 3.77:1 — large text only |
| highlight-magenta | #eb367f | pink 9–10 | |
| gradient-develop-start/end | #007cf0 / #00dfd8 | none | decorative gradient stops |
| gradient-preview-start/end | #7928ca / #ff0080 | none | |
| gradient-ship-start/end | #ff4d4d / #f9cb28 | none | |

No Radix equivalent: the six gradient stops, and a dark ramp (the file has
none). No Vercel equivalent for Radix steps 4, 5, 8, 10 (hover/active
surfaces and borders, hover fills) and for alpha scales. Vercel's own Geist
site uses a different structure again: 10 scales × 10 steps (100 default
background … 400 default border … 700 high-contrast background … 900
secondary text, 1000 primary text), "P3 colors are used on supported browsers
and displays", values shown only in the UI
([vercel.com/geist/colors](https://vercel.com/geist/colors)). Its 100–1000
grammar maps 1:1 onto Radix 1–3 / 6–8 / 9–10 / 11–12 with steps 4–5 (hover
and active component surfaces) folded into 200–300.

## 4. Status colours

| Status | Radix ([Composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette)) | Vercel Geist Badge ([vercel.com/geist/badge](https://vercel.com/geist/badge)) | shadcn.io DESIGN.md |
|---|---|---|---|
| Success | green, teal, jade, grass, mint | green ("healthy") | `success: #0070f3` (blue, same hex as `link`) |
| Warning | yellow, amber, orange | amber | `warning: #f5a623` (amber) |
| Error | red, ruby, tomato, crimson | red | `error: #ee0000` (red) |
| Info | blue, indigo, sky, cyan | blue ("informational or production") | no info token; `link` blue |

Disagreement: the shadcn.io file names success **blue** (#0070f3, Vercel's
historic brand blue; its opening says "the link blue #0070f3 only surfaces
inside inline body links and form-state semantics"); Vercel's current Geist
Badge guidance says "`green` for
healthy, `red` for error, `amber` for warning, `blue` for informational or
production, `gray` for neutral", which matches Radix. Geist's Note component
has `success`, `error`, `warning`, `secondary`, `violet`, `cyan` variants with
no colour named in the text ([vercel.com/geist/note](https://vercel.com/geist/note)).
Treat "success = blue" as a curator's reading of the old Vercel palette, not a
Vercel rule.

## 5. Geist and Geist Mono

| Fact | Value | Source |
|---|---|---|
| Licence | SIL Open Font License 1.1; "Copyright (c) 2023 Vercel, in collaboration with basement.studio" | [LICENSE.txt](https://github.com/vercel/geist-font/blob/main/LICENSE.txt), [vercel.com/font](https://vercel.com/font) "Licensed under OFL" |
| Latest release | v1.7.2, 2026-06-01, one asset `geist-font-v1.7.2.zip` | [releases/latest](https://github.com/vercel/geist-font/releases/latest) |
| npm | `geist@1.7.2`, `license: "SIL OPEN FONT LICENSE"`; `GeistSans` from `geist/font/sans`, `GeistMono` from `geist/font/mono`, both `NextFontWithVariable`; CSS vars `--font-geist-sans`, `--font-geist-mono` | [packages/next/README.md](https://github.com/vercel/geist-font/blob/main/packages/next/README.md), [package.json](https://github.com/vercel/geist-font/blob/main/packages/next/package.json) |
| Shipped files (npm `dist/fonts/geist-sans`, `geist-mono`) | `Geist-Variable.woff2` (70 KB) and `.ttf`, plus static Thin, UltraLight, Light, Regular, Medium, SemiBold, Bold, Black, UltraBlack as `.woff2` and `.ttf`; same set for `GeistMono-*` | repo listing via GitHub API, path `packages/next/dist/fonts/` |
| Repo `fonts/` | `Geist/`, `GeistMono/`, `GeistPixel/` each with `otf`, `ttf`, `variable`, `webfonts` | [fonts/](https://github.com/vercel/geist-font/tree/main/fonts) |
| Weights | Thin, Ultra Light, Light, Regular, Medium, Semi Bold, Bold, Black, Ultra Black (nine) | [vercel.com/font](https://vercel.com/font) |
| Three install routes | npm (recommended: full glyph set + `font-feature-settings`), Google Fonts (`Geist`, `Geist_Mono` via `next/font/google`, "without full glyph set or font-feature-settings"), ZIP | [vercel.com/font](https://vercel.com/font) |
| Self-hosting form for Maestro | one variable `woff2` per family (`Geist-Variable.woff2`, `GeistMono-Variable.woff2`) covers all nine weights; static files only if a single weight is wanted | derived from the file listing above |
| Optical size | none published; the `Geist-Variable` axis set is not stated on the site or README, and no `opsz` guidance exists on vercel.com/font | not sourced — see § 6 |
| Line-height / size guidance | 15 styles: 48/48 −2.4px (display-xl), 32/40 −1.28, 24/32 −0.96, 20/28 −0.6, 18/28, 16/24 (body-md, -strong), 14/20 −0.28 (body-sm, -strong), 12/16 (caption, caption-mono), 13/20 (code), 14/20 and 16/24 (button-md, -lg); weights 400–600 only, "the display ceiling is 600, never 700+" | Vercel Inspired DESIGN.md, shadcn.io, lastUpdated 2026-05-12, author Dov Azencot — curated, not Vercel |
| Vercel's own text styles | classes `text-heading-72` … `text-label-14`, `text-copy-16`, `text-button-14` that "pre-set a combination of font-size, line-height, letter-spacing, and font-weight", values kept in "the Geist Core Figma system" | [vercel.com/geist/text](https://vercel.com/geist/text) |

## 6. Not sourced

- Vercel publishes no numeric line-height, letter-spacing or optical-size
  guidance in text; the values live in Figma. The DESIGN.md numbers are a
  third party's reading (Vercel Inspired DESIGN.md, shadcn.io, lastUpdated
  2026-05-12, author Dov Azencot).
- The variable font's axis list was not read from the binary; the fetch of
  `vercel.com/font` shows only the nine weight names.
- Geist colour hex values are not in the page text (right-click to copy in
  the UI), so Vercel's "steps 9–10 are designed for accessible text" claim
  was not measured.
- `radix-ui.com/colors/docs/overview/accessibility` returns 404; Radix's
  contrast claim exists only on the "Understanding the scale" page.

## Measurement script

```js
// WCAG 2.2 contrast ratio over @radix-ui/colors@3.0.0 sRGB hex values.
const c = require("@radix-ui/colors");
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const cr = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const darkText = new Set(["sky", "mint", "lime", "yellow", "amber"]);
for (const name of Object.keys(c).filter((k) => /^[a-z]+$/.test(k) && !/^(black|white)/.test(k))) {
  for (const [side, s] of [["L", Object.values(c[name])], ["D", Object.values(c[name + "Dark"])]]) {
    const on9 = darkText.has(name) ? cr(s[11], s[8]) : cr("#ffffff", s[8]);
    console.log(name, side, [cr(s[10], s[0]), cr(s[10], s[1]), cr(s[10], s[2]),
      cr(s[11], s[0]), cr(s[11], s[1]), cr(s[11], s[2]), on9].map((n) => n.toFixed(2)).join(" "));
  }
}
```
