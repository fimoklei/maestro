# Maestro Design System — "Control Room"

The design system for **Maestro**, a visual cockpit to see and steer your AI agent setup — skills, hooks, and MCP servers — across repositories and tools, built on top of [APM](https://microsoft.github.io/apm/). APM is the engine (install, sync, pinning, lockfiles); Maestro is the cockpit on top: **see** the central inventory and what is deployed where, **steer** by composing bundles and deploying/updating, and later **curate**. MVP1 is solo-first: one power-user, three views (Inventory · Deploy-state · Compose). **Drift** — a target running an older version than the central inventory — is the product's core signal, and the loudest thing on screen.

This system implements the chosen direction **"A · Control Room"**: a dark, dense, monospace-heavy developer-tool cockpit. Status-first; calm near-black surfaces; amber means *act*, green means *rest*.

## Sources

- Local codebase folder `maestro/` (attached via Import): `docs/brief.md` (product thesis, MVP1 bet), `CONTEXT.md`, `packages/web/` (React app: inventory / deploy-state / registry panels — functional, unstyled at time of writing).
- Design exploration in this project: `Maestro - 3 ontwerprichtingen.html` with `design-dark.jsx` (the chosen Control Room artboard), `design-light.jsx`, `design-paper.jsx`, `mock-data.jsx`.
- Companion repo (not attached): `agent-harness` — the central inventory Maestro conducts.

## CONTENT FUNDAMENTALS

- **Language:** product UI copy is English, terse, technical. No marketing tone inside the cockpit.
- **Casing:** UI chrome (section titles, nav) is sentence case: "Central inventory", "Deploy-state". Everything actionable or data-like is **lowercase mono**: "deploy →", "+ new primitive", "synced 2m ago", "● in sync".
- **Voice:** no "you/we" framing inside the app; copy reads like terminal output. Activity log entries are past-tense fragments: "deployed code-review 1.4.0 → acme-web".
- **Separators:** the middle dot `·` chains meta fragments: "agent-harness · main · 9 primitives", "curated · production-ready".
- **Numbers & versions:** semver everywhere, mono, never rounded. Drift is written as `1.0.0 → 1.2.0`.
- **Emoji:** never. Unicode glyphs only (see ICONOGRAPHY).
- **Vocabulary:** primitive (skill / hook / mcp), bundle, target (local repo / global tool), deploy-state, drift, in sync, central inventory, compose, register. Use these exact words; don't invent synonyms.

## VISUAL FOUNDATIONS

- **Color tone:** cool near-black with a faint blue cast. Five surface steps from `--bg-0 #0b0d10` (app) to `--surface-active #171d24`; hierarchy comes from lightness steps and 1px borders, **never shadows** — there are no box-shadows anywhere in this system.
- **Accents:** two signal colors only. **Amber `#e8a33d`** = brand + drift + primary action (one amber-filled button per view, max). **Green `#62c47e`** = in sync, healthy, final confirm. Tinted chip fills use the color at 10% alpha with a ~25–30% alpha border. Four fixed primitive-type colors (skill blue, hook purple, mcp teal, bundle amber) are reserved exclusively for `TypeTag`.
- **Type:** Space Grotesk for chrome (titles 16/600, nav 13.5); JetBrains Mono for all data — names, versions, paths, buttons, labels, timestamps. Mono is the dominant voice. Micro-labels are 10px uppercase mono with 0.12em tracking. Nothing below 10px.
- **Spacing & density:** cockpit-dense. 14px card padding, 9px row padding, 12px grid gaps, 24px between sections. Layout is a fixed shell: 52px status bar, 208px sidebar, fluid main, 320px compose aside (1440 design width).
- **Corners:** tight 3–6px radius scale (tags 3, controls 4, items 5, cards 6). Nothing pill-shaped, no circles except status dots.
- **Borders:** 1px lines do all structural work; a six-step border ramp from hairline `#13181e` to chip `#232a33`. Dashed `#2a313a` borders mark additive/drop affordances. A card whose contents drift warms its outline to `--border-drift #4a3a1c`.
- **Backgrounds:** flat fills only. No gradients, textures, patterns, blur, or transparency layers (the only alpha is in chip tints).
- **Imagery:** none. The cockpit is pure data UI; no illustrations or photos.
- **States:** hover = one surface step lighter (`--surface-active`) or border one step stronger; active nav = raised surface + `--border-chip` outline + amber glyph; press = no scale effects. Disabled = `--text-dim`.
- **Motion:** minimal and functional — 120–160ms ease-out on background/border-color changes; no entrance animations, bounces, or decorative loops.

## THEMING (dark / light)

The system ships **two themes from one token set** — dark is the default Control Room; light is the same system inverted onto cool near-white surfaces. Same identity: mono-heavy, amber = act/drift, green = in sync, 1px borders do the structural work, **no shadows** in either theme.

- **How to toggle:** the consuming app sets `data-theme` on `<html>` (or any wrapper element). `data-theme="light"` → light cockpit; `data-theme="dark"` or no attribute → dark. Every token is overridden inside the `[data-theme="light"]` scope in `tokens/colors.css`; because components only ever read tokens (never hardcoded hex), the entire UI re-skins from this one switch. Semantic aliases (`--color-brand` etc.) resolve through `var(--amber)` at use-site, so they follow the active theme automatically.
- **Live example:** the cockpit UI kit (`ui_kits/cockpit/`) has a working `◐ light / ◑ dark` toggle in its status bar that flips `data-theme` on the document — copy that pattern.
- **Light surfaces:** grey canvas `--bg-0 #eceef2` → raised chrome `#f5f7f9` → white cards `#ffffff`; borders darken from hairline `#eef1f4` to chip `#ccd3dc`. **Signal fills stay golden / mint with dark text** (`--amber #e0a43c`, `--green #3dba75`, `--on-accent #241d09`) — the same recognisable, soft buttons as the dark theme. Signal *text/glyphs/dots* switch to the deeper `--amber-ink #b0700f` / `--green-ink #178a4c` so they stay legible on white and on pale chip tints. Primitive-type colors deepen to match (skill `#3163cc`, hook `#8a55ce`, mcp `#1a8e82`, bundle `#b0700f`). In the dark theme `*-ink` simply equals the fill colour, so nothing changes there.
- **Do not** add shadows, gradients, or rounded pills in the light theme to "soften" it — that is the separate, unused "Studio" exploration, not this system. Light is Control Room with the lights on.

## ICONOGRAPHY

- **No SVG icon sets, no icon fonts, no emoji.** Iconography is a small fixed vocabulary of unicode glyphs set in the mono font: `▤` inventory, `⇶` deploy-state, `⧉` compose, `▲` drift (always amber), `●` in sync / healthy (green) and status dots, `→` action direction (in button labels: "deploy →"), `+` add, `✕` remove, `✓` done.
- Glyphs are sized 12–16px, colored by role (amber when active/warning, green when healthy, `--text-dim` when idle).
- The logo is typographic: a bold mono "M" on an amber rounded tile (`components/shell/Logo.jsx`); no drawn logomark exists.

## INDEX

- `styles.css` — global entry; imports everything in `tokens/` (fonts · colors · typography · spacing · base utilities `.m-label`, `.m-mono`).
- `tokens/` — all CSS custom properties, commented per token. `colors.css` holds **both themes** (dark default + `[data-theme="light"]` scope); toggle via `data-theme` on `<html>` — see THEMING above.
- `components/core/` — `Button` (primary/success/ghost/quiet/dashed · sm/md/lg), `Chip` (ok/drift/dim), `TypeTag` (skill/hook/mcp/bundle), `StatusDot`.
- `components/shell/` — `Card` (header + kind + status + drift outline), `SectionHeader`, `NavItem`, `Logo`. Each component ships `.jsx` + `.d.ts` + `.prompt.md`.
- `guidelines/` — foundation specimen cards (surfaces, text ramp, signals, type colors, borders, UI/mono type, micro-labels, radii, density, glyphs, logo).
- `ui_kits/cockpit/` — the interactive 1440×1000 main screen composing all components (see its README).
- `ds-loader.js` — runtime loader used by specimen cards and the UI kit (prefers the compiled bundle, falls back to raw `.jsx` sources).
- `SKILL.md` — agent-skill entry point for using this system elsewhere.
- Exploration archive (pre-system): `Maestro - 3 ontwerprichtingen.html` + `design-*.jsx` + `mock-data.jsx`.
