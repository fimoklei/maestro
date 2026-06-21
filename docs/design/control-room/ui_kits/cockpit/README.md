# UI kit — Cockpit

The Maestro main screen ("Control Room" direction): one 1440×1000 cockpit with the three MVP1 views.

- **Status bar** — logo lockup, inventory context, drift + health chips, sync timestamp.
- **Sidebar** — view nav (Inventory / Deploy-state / Compose) + target list with sync dots.
- **Main column** — swaps per view: inventory table · deploy-state target cards · compose picker.
- **Compose aside** — persistent bundle draft, target selector, deploy CTA, recent activity log.

Interactive in `index.html`: switch views, press `update` on drifted items (drift resolves and is logged), add/remove draft items, deploy the bundle.

Files: `CockpitParts.jsx` (shell + view pieces), `CockpitApp.jsx` (state + layout + scale-to-fit stage), `cockpit-data.js` (demo data). All primitives come from the design-system components via `ds-loader.js` — nothing is re-implemented here.
