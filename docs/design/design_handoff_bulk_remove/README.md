# Handoff: Bulk remove a primitive from every target

## Overview
New capability for issue **#409**: remove a deployed primitive from *all* of its targets in one decision, instead of opening the single-remove dialog once per target. It adds a `REMOVE` section to `packages/web/src/inventory/skill-detail-pane.tsx`, a new grouped confirmation dialog, and a post-run report. The existing single-target dialog (`deploy-state/remove-skill-dialog.tsx`) is **not** touched — this is a second, wider panel that reuses its preflight, its row vocabulary and bulk-deploy's report shape.

## About the design files
`Bulk remove states.dc.html` in this bundle is a **design reference written in HTML** — a static prototype of the intended look, not production code to copy. Recreate it inside `packages/web` with its own React + Tailwind components (`ui/button`, `ui/type-tag`, `ui/cn`, the `useModalDialog` hook, the `text-*` / `border-*` semantic classes). The bundled `_ds/` folder is the Maestro design-system source the prototype reads its tokens from; use it to look values up, not to ship.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing and copy are final. The modal contract (focus trap, escape, restore) is inherited from `useModalDialog` unchanged. The entry point is drawn against the real detail pane, so its section order and row shape are as-is.

## The one rule this design follows
A bulk action is only safe if the cost is visible **before** the decision and the outcome is legible **after** it. So: a clean target is a *number*, never a row — it costs no attention. A target that costs something, or that can't be touched at all, is a *row* with its reason on it. Nothing else appears in the panel.

---

## 1a · Entry point — skill detail pane

Bulk remove is offered where the deployed-to list already lives, so it needs no new read and cannot act on targets that are off-screen.

- A new footer section `REMOVE` sits directly under the existing `DEPLOY` section, mirroring it exactly: 10px uppercase mono micro-label (`0.12em`, `--text-dim`), 8px gap, one full-width control. Both sections live in the part of the pane that does not scroll.
- The control is `Button variant="quiet" size="sm"`, full width, label `remove from all <n> →`.
- **Rendered only when the primitive is deployed to 2 or more targets.** At exactly 1 target the section is absent — that target's own remove already exists. At 0 targets the pane keeps today's `not deployed to any target yet` line and no section.
- A target whose deploy-state is still loading is not in the deployed-to list, so it is not in the bulk either (J04).
- Not offered on a deploy-state row: that view is target-first, and acting there would destroy copies the user cannot see (ADR-0016).

---

## 2 · Grouped confirmation dialog — 460px

Same panel anatomy as the single-remove dialog (title row with `TypeTag`, body stack, bordered footer) at **460px** instead of 380 — a target name, its version and its reason must fit on one line.

**Title:** `Remove <name> from <n> targets?` — UI font 15/600, name in mono. `TypeTag` right-aligned. No version in the title: a bulk spans several versions.

**Body — up to three blocks, in this order.** Any block with a count of 0 is not rendered.

### Clean summary (always, when > 0)
One inset row: green `●` + `<n> clean copies`. When *every* target is clean the line extends to `<n> clean copies — nothing but the deployed files goes` and it is the only body content.

### ▲ LOSES WORK · n
- Group header: 10px uppercase mono, `0.12em`, `--amber-ink`, glyph included in the label.
- Box: border `--amber-border`, rows `--amber-bg`, hairline dividers `--amber-border`.
- Row: target name (mono 12.5, `--text-1`) + its deployed version (11.5, `--text-dim`) on the left; the reason right-aligned in `--amber-ink` at 11.5. Version appears **only** in this group — it is where "which version am I destroying" is a real question.
- Reasons seen today: `local edits — deleted too`, `check did not run`.
- Panel outline warms to `--border-drift` whenever this group exists.

### ✕ CAN'T BE REMOVED · n
- Same shape, red: header `#e0705f`, box border `rgba(224,112,95,0.30)`, rows `rgba(224,112,95,0.10)`, reason in `#e0705f`.
- These targets are **skipped by the run and never block confirm** — the count in the confirm label still names all targets; the skipped ones reappear in the report.

### Footer
- `cancel` (quiet, sm) + primary confirm, right-aligned, 8px gap.
- Confirm label: `remove from <n> →`, and when the cost group exists `remove from <n> · <k> lose local edits →`. The cost travels on the button, so it cannot be missed by someone who confirms without reading.

### Checking state
Preflights run per target. Until every one answers: one inset row with a dim `◐` and `checking <n> targets — <k> answered`; confirm disabled; cancel live.

### Running state
- Title becomes `Removing <name>`; body is one inset row, amber `◐`, `walking <n> targets, one at a time`, where n excludes the refused ones.
- **No per-target progress and no abort.** Both buttons disabled; escape and the backdrop are blocked. There is no partial-state exit.

---

## 3 · Report

Replaces the dialog body when the run finishes; announce it in a live region.

- **Clean:** title `Removed <name>`; one inset row, green `✓`, `removed <n> · refused 0 · failed 0`. Footer: `done` (success, sm) only.
- **Partial:** title `Removed <name> from <k> of <n>`; the same counts row; then a group `✕ LEFT ALONE · m` whose rows stack two lines — target name with `refused` / `failed` right-aligned in `#e0705f`, then the reason at 11.5 in `--text-2` on its own line (`repo not registered`, `apm exited 1 — permission denied: …`, `target is held by another operation`). Panel outline red. Footer: `close` only.
- **No retry control.** The pane recounts on close and the same `remove from all n →` action removes whatever is left.
- **Request failed:** the run never started, so no counts are shown — the confirm body returns with the shared error block (label `the run never started`, message `Maestro could not reach its server, so nothing was removed anywhere. Try again.`) and the footer keeps `close` + a live confirm.

---

## Design tokens
Everything comes from the Maestro tokens except the error red, which the system still does not define.

| Use | Value |
| --- | --- |
| Panel background / border | `--bg-1` / `--border-strong` (cost present: `--border-drift`; failed: red border) |
| Panel width | **460px** (single-remove stays 380) |
| Title | UI font 15px/600 `--text-1`, line-height 1.45; name in mono |
| Type tag | the DS `TypeTag` component (`ui/type-tag.tsx`) — never hand-styled; the four primitive-type colors are reserved to it |
| Summary row | `--surface-inset`, border `--border-row`, radius `--radius-item`, padding 10px 12px, mono 12.5 `--text-2` |
| Group header | mono 10px/600, `0.12em`, `--amber-ink` or `#e0705f`, glyph inline |
| Cost group | border/divider `--amber-border`, fill `--amber-bg`, reason 11.5 `--amber-ink` |
| Refusal group | border/divider `rgba(224,112,95,0.30)`, fill `rgba(224,112,95,0.10)`, reason 11.5 `#e0705f` |
| Row text / version | mono 12.5 `--text-1` / 11.5 `--text-dim` |
| **Error ink / fill / border (proposed)** | `#e0705f` / `rgba(224,112,95,0.10)` / `rgba(224,112,95,0.30)` — add as `--danger-ink` / `--danger-bg` / `--danger-border` |
| Padding | body `15px 15px 14px`, footer `10px 15px`, group row `9px 11px` |
| Gaps | body stack 11px (12px when groups present), group header→box 7px, footer 8px |
| Radii | panel `--radius-card` (6), boxes `--radius-item` (5), error block `--radius-control` (4), tag 3 |
| Pane section | micro-label 10px mono `0.12em` `--text-dim`, 8px below, full-width `quiet sm` button |
| Pane list row | DS `StatusDot` for ok / drift + DS `Chip` (`drift` for `behind`, `dim` for `unknown`) |
| **Unknown-state dot (gap)** | `StatusDot` has no dim state — it falls through to green, which reads as "in sync". Drawn here as a plain 6px `--text-dim` dot; **`StatusDot` needs a third `unknown` status** before this ships |

## Behavior
- Modal contract via `useModalDialog`; closing blocked while the run is in flight.
- `aria-describedby` points at the clean-summary row plus any group boxes; group rows are static text — never focusable, never clickable.
- Confirm disabled while preflights run and while removing; never absent — a refusal group does not block the rest.
- The run is sequential, server-side, one target at a time, and always reports; the client shows no intermediate target.
- Report is announced in a live region.

## Open questions
- The pane's deployed-to list scrolls in full today. With 12 targets the `REMOVE` section stays pinned, but is a list that long still readable there?
- Confirm label above ~12 targets: keep the literal count, or switch to `all`?
- `--danger-*` is still un-tokenised; proposed in the earlier remove-dialog handoff and used again here.
- `StatusDot` only knows `ok` and `drift`, and defaults to green. Any unknown deploy-state currently signals "in sync" — the loudest possible wrong signal. Add an `unknown` status to the component rather than overriding its fill per use-site.

## Files
- `Bulk remove states.dc.html` — entry point, confirm states and report side by side (open in a browser).
- `_ds/…` — Maestro design-system tokens + component bundle the prototype loads.
- Code touched: `packages/web/src/inventory/skill-detail-pane.tsx` (new section), new bulk-remove dialog component, `packages/server/src/app.ts` (a bulk counterpart to `/api/deploy/remove`, shaped like `/api/deploy/bulk`).
