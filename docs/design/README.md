# Design reference

Imported, human-authored design material. **Not wired into the build** and not
linted or formatted (Biome excludes `docs/design/` — see `biome.json`). It is
the source of truth for the design system to **port from**, not live code.

## `control-room/`

The full "Control Room" design system synced from the Claude Design project
**`382d1f68-3ef6-49f3-a058-a6eec53e6a86`** ("Maestro Design System"): design
tokens (colour, type, spacing, both dark + light themes), component contracts
(`.jsx` + `.d.ts` + `.prompt.md`), the specimen catalogue (`guidelines/`), and
an interactive cockpit UI kit (`ui_kits/cockpit/`).

These files lean on browser globals, a runtime `ds-loader.js`, and Babel-in-the-
page — they are a **specification to port into** the Vite + TypeScript + Tailwind
app (ADR-0008, "adopt and own"), not modules to import. When porting, treat
`control-room/readme.md` and `tokens/` as the canonical contract; treat the
Maestro flow screens (Claude Design project `e93b032d-...`) as direction, not a
1:1 copy.

To re-pull or keep this copy in sync, use the DesignSync MCP connector
(`/design-sync`). The repo copy is canonical; the MCP connection is a supplement
for anything not synced here (it needs claude.ai design auth, which a headless
agent may lack).
