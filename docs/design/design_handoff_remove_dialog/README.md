# Handoff: Remove-primitive confirmation dialog

## Overview
Redesign of the confirmation shown before a deployed primitive (skill / hook / mcp) is removed from a target. It replaces `packages/web/src/deploy-state/remove-skill-dialog.tsx`. The current dialog explains the removal in three stacked prose layers; this design states one question and then answers only "what disappears, and where" as a scannable ledger of targets.

## About the design files
`Remove dialog states.dc.html` in this bundle is a **design reference written in HTML** — a static prototype of the intended look, not production code to copy. Recreate it inside the existing `packages/web` React + Tailwind codebase, using its own components (`ui/button`, `ui/cn`, the `useModalDialog` hook, the `text-*` / `border-*` semantic classes). The bundled `_ds/` folder is the Maestro design-system source the prototype reads its tokens from; use it to look values up, not to ship.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing and copy are final. Structure and behavior of the existing dialog (modal contract, focus trap, escape, preflight props) stay exactly as they are — only the panel body changes.

## The one rule this design follows
The user needs two facts: *what am I deleting* and *what does that cost me*. Everything that is neither (apm's lack of a per-tool remove, "deployed files and its lockfile entry go", the redeploy caveat) is dropped from the panel. If a target carries a real cost — local edits, an unreachable leftover copy — the cost is stated **on that target's row**, not as a paragraph underneath.

## States (five, all in the HTML file)

### 3a · default, global scope
- Title: `Remove <name> <version>?` — "Remove" and "?" in the UI font, name+version in mono. Right of the title, the primitive's `TypeTag` (`skill` / `hook` / `mcp`).
- Lead-in: "Primitive will be removed from:" — 12.5px, `--text-muted`.
- Ledger: one bordered box, one row per detected tool, mono 13px, `--surface-inset`, rows split by a `--border-faint` hairline. No per-row glyph and no per-row control — there is no per-tool remove, so nothing on a row may look actionable.
- Footer: `cancel` (quiet, sm) and `remove →` (primary, sm). The confirm label no longer carries the skill name — the title already does, so it can never overflow.

### 3b · repo scope
Identical, one row containing the repo path (`~/dev/acme-web`, mono, `overflow-wrap: anywhere`).

### 3c · local edits found
Same ledger; the affected row gets `--amber-bg`, a leading `▲` in `--amber-ink`, and a right-aligned `local edits — deleted too` (11.5px, `--amber-ink`). Panel outline warms to `--border-drift`. No separate warning block, no extra sentence. Same treatment for an unreachable leftover copy (row label: `not installed — copy deleted in full`).
While the local-edits check is still running, keep today's behavior: the confirm stays disabled with the reason beside it in the footer.

### 3d · refused before confirm
Server already said the removal cannot happen, so there is nothing to consent to:
- The ledger is not rendered — nothing will be removed.
- One error block (see below) carrying label `can't be removed` and the server's own sentence.
- Footer has `close` only. No disabled confirm button.

### 3e · failed after confirm
The important change: report the outcome **per target** instead of "the repo may be in a mixed state".
- Lead-in becomes `Removed from 1 of 2 targets:`.
- Ledger rows keep their order; a succeeded target dims to `--text-muted` with `✓ removed` in `--green-ink`; a failed target keeps `--text-1`, gets a red row fill and `✕ not removed`.
- Below it, the error block: mono label = the failure in apm's terms (`apm exited 1`), body = the raw reason (`permission denied: ~/.codex/skills/secret-scan/`), plus one dim mono line `retry removes only what is left`.
  - **Not built, and not to be built: ADR-0018 refuses apm's terms here.** apm's output can carry a token and a path outside the target, and the remove path has no non-zero exit code to state. Shipped as a fixed label plus the server's curated sentence (#417).
- Footer: `close` + `retry →`.

### Error block (shared by 3d and 3e)
`display:flex; gap:9px; padding:10px 11px`, radius `--radius-control`, background `rgba(224,112,95,0.10)`, border `1px solid rgba(224,112,95,0.30)`. Leading `✕` mono 12px in `#e0705f`; then a column: mono 11px label with `0.06em` tracking in `#e0705f`, and the message at 12.5px/1.5 in `--text-2`. The panel outline switches to the same red border.

## Design tokens
Everything comes from the Maestro tokens except the error red, which the system does not define yet.

| Use | Value |
| --- | --- |
| Panel background | `--bg-1` |
| Panel border | `--border-strong` (drift state: `--border-drift`) |
| Ledger row background | `--surface-inset`, dividers `--border-faint`, box border `--border-row` |
| Title | UI font 15px/600 `--text-1`; name+version mono |
| Type tag | mono 10px, `0.08em`, `--type-skill` / `--type-hook` / `--type-mcp`, border `--border-chip`, radius 3px, padding 2px 6px |
| Lead-in | 12.5px `--text-muted` |
| Ledger text | mono 13px `--text-1` |
| Row status text | 11.5px, `--amber-ink` / `--green-ink` / `#e0705f` |
| Warning row fill | `--amber-bg` |
| **Error ink / fill / border (proposed)** | `#e0705f` / `rgba(224,112,95,0.10)` / `rgba(224,112,95,0.30)` — add as `--danger-ink` / `--danger-bg` / `--danger-border` |
| Panel width | 380px |
| Padding | body `15px 15px 14px`, footer `10px 15px`, ledger row `9px 11px` |
| Gaps | body stack 11px, footer 8px |
| Radii | panel `--radius-card` (6), ledger `--radius-item` (5), error block `--radius-control` (4), tag 3 |

## Behavior (unchanged from today unless noted)
- Modal contract via `useModalDialog`: focus into the panel, Escape closes, focus restored, Tab trapped, closing blocked while `isRemoving`.
- `aria-describedby` now points at the lead-in line and the ledger, not at three prose lines.
- Ledger rows are static text — never focusable, never clickable.
- Confirm disabled while the local-edits check runs or the removal is in flight; **absent** when the preflight refused.
- Removed copy (delete from the component): "This takes it off X and Y in one go. There is no per-tool remove.", "Its deployed files and its lockfile entry go.", and the mixed-state paragraph — 3e's per-target ledger replaces it.

## Files
- `Remove dialog states.dc.html` — all five states side by side (open in a browser).
- `_ds/…` — Maestro design-system tokens + component bundle the prototype loads.
- Code being replaced: `packages/web/src/deploy-state/remove-skill-dialog.tsx` (+ its tests and stories).
