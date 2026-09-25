# Design source (project-specific for Maestro)

## Sources

- **Design system** — `.impeccable/design.json` (ADR-0033), managed via `/impeccable`. Chain: `design.json` → `packages/web/src/styles/tokens.css` (ships) → `DESIGN.md` (regenerated, never hand-edited). On token conflict, `design.json` wins.
- **Flow screens** — Claude Design, via `DesignSync` (`list_projects`, `get_file`), read live by default. A static export under `docs/design/` is frozen; re-fetch via DesignSync for current state.

Never take design values (colour, size, spacing) from a flow screen; build from the tokens.

- **Copy** — `.claude/rules/copy.md` (ADR-0025). Every user-facing word the cockpit shows is written and reviewed against it.

## Accessible labels

- Include the visible label's words in the accessible name, in the same order
  and at the start. Name icon-only controls by their action and landmarks by
  their content. Review the name with the control or region it describes.
- Give fields visible labels; hints supplement them. Show status meaning in
  text as well as colour. Name link destinations in the link text.

## Design rules

**Reuse.** Build from an existing pattern. When none fits, measure what
Vercel, Linear and Circle do; add the new pattern to this section before
building it.

**Meaning and emphasis.**
- Give a column, badge, glyph and word one meaning on every screen. Say
  `Re-read` for reading again, never `Refresh` or `Retry check`.
- Use Geist Mono only for a version, tag, path, ref or hash.
- Use colour only for status. Use blue only for focus, selection and links.
  Keep the primary action neutral (slate 12).
- Put at most one coloured mark in a row.

**Status.**
- Show a status badge as a `CONTEXT.md` word plus its family's dot. A mark
  without a visible word keeps its family's glyph.
- Use the five families: Good ✓ green, Attention ↑/⚠ amber, Failed ✕ red,
  Unknown ? slate, Neutral slate. Neutral and Unknown differ by word only.
- Show one badge per row: the worst reading. Put the others in the detail pane.
- Show an unknown reading as an Unknown badge, never as a notice.

**Disclosure.**
- Keep a row to one line. Put the summary in the hover card and the rest in
  the 360px detail pane.
- Open a hover card on focus as well as hover. Put no control in it.
- List in a row's ⋮ menu and pane foot only the actions its state calls for;
  omit the rest. The Status hover card states that state and names the next
  action.
- Build every detail pane in one order: three to seven facts, one paragraph
  explaining the state, the notice, then the sub-list. A fact is a label in
  slate 11 `meta` beside a short value, in a two-column grid. A sub-list row is
  32px: mark, name, machine value, ⋮.
- Fix the pane's foot and scroll only its content. The foot holds the row's ⋮
  items as 32px buttons in the same order; the first enabled one is primary, a
  destructive one stays danger.
- At 1100px and below, show the pane as a full-height sheet over the table's
  right side, `min(360px, 100%)` wide. Esc or ✕ closes it and returns focus to
  the row.

**Failures.**
- State a failure in a `Notice` after its cause, with one action named by its
  exact control label.
- Never move focus to a notice. Never remove a notice on a timer.
- Keep the previous rows on screen after a failed read. Recover with the
  screen's `Re-read {screen name}` control, never a page reload.
- Set `retry: false` on every query.

**Feedback and dialogs.**

Pick the form from this table. Add no other form, and no banner.

| Kind | Form | Placement |
|---|---|---|
| Failure or warning about one control, row or region | `Notice` | After its cause. In a dialog: above the footer. In the detail pane: after the facts and paragraph, before the sub-list |
| Screen-wide failure | `Notice` | Top of the panel content |
| Field hint | One sentence in slate 11 `meta` | Between the label and the field |
| Field error | One `✕` line in red 11. A refusal with a heading and a cause is a `Notice` in the same slot | Under the field |
| Information | `Notice` at `info` | In the region it describes |
| Status of data | Badge in the row, mark in the pane | The row |
| Busy | Spinner | The pressed button, the row's ⋮ icon, or the re-read control |
| Success the reader can see | The row's new status | The row |
| Success the reader may miss | Toast, success only, 5 s, paused on hover and focus | Bottom right |
| Confirmation | Dialog, 480px | Top-aligned at 96px |
| Partial result across several skills | Report in the dialog that ran the action, 640px, worst group first | The dialog stays open |

- Show a field error on submit and clear it once the field is valid. Check a
  field that names a folder right after the pick.
- Confirm only an action that deletes files or writes to GitHub: Remove,
  Delete, Unregister, Propose change, Withdraw proposal, Create a release.
  Deploy and Update run without one. A dialog that collects input is a form.
- Use two dialog widths, 480 and 640, top-aligned at 96px. Give it a 48px
  header with the title and a close control, and a footer with Cancel leading
  and the action trailing.
- Open focus on the first field, else the primary button; on Cancel in a
  destructive dialog. Return focus to the control that opened it.
- Block every way of closing a dialog while its action runs. Ignore a click
  outside once a field has changed.
- Open no dialog, alert or toast on load.

**Waiting and freshness.**
- Show no status before the server confirms it. Lock only what the server
  locks.
- Show nothing under 1 s. Show the spinner in the pressed control at once for a
  write. Show skeleton rows in the table's shape after 1.3 s for at least
  0.5 s; at once for a pressed re-read.
- Redesign any action that would take over 10 s. Show no progress bar without
  real progress.
- Label a busy button `{Verb}ing…` from `busy-copy.ts`. Show no word for a read
  outside a dialog.
- Give every table screen one icon-only `Re-read {screen name}` control.
- Show a freshness line only beside data that ages. Date the oldest reading
  and keep it ticking.
- Re-read unasked only on open, plus Deploy-state's rows on tab return.
- Animate only what floats, by opacity alone. Under reduced motion keep only
  the spinner moving.

**Keyboard and screen reader.**
- Keep focus visible on something at all times.
- Build every table as a grid: one Tab stop, arrows inside, Enter opens the
  row's detail pane.
- Open a menu button with Enter, Space or Down Arrow, landing on the first
  item.
- Keep an unavailable control focusable with `aria-disabled`, and state why.
  A row's ⋮ menu keeps only an item another write locks; it omits the rest.
- Make every pointer target at least 24×24px. Hold every screen at 200% zoom
  and a narrow width.
- Mount one `role="status"` region per screen before its content changes. Set
  `aria-busy` on a region while it reads.
- Announce through that region only: a read when its skeleton appears, then
  `{Screen name} loaded.`; a write's busy label, then `{Done word} {name}.`
  Never announce what a toast or a notice already says. Never rename a busy
  control.

**Frame.**
- Build a screen as one of three frames: sidebar plus panel, the connect gate,
  or Settings.
- Give the panel frame a 244px sidebar, two 48px bands, one table and a 360px
  detail pane. Scroll only the content.
- Put the primary action in band 1, right of the title; Re-read, Filter and
  Display in band 2, icon-only; a row's actions in its ⋮ menu and at the foot
  of its detail pane; actions on a selection in the floating selection bar.
- Put no button in a table row.

**Tokens.**
- Use only the documented colour pairs. A new pairing enters `design.json` and
  the contrast test first.
- Check every changed screen in both themes once Light is reachable.

**Rebuild (ADR-0033).**
- Never remove a function in a rebuild job. Keep an old dialog reachable from
  the new frame until its own job.
- Land a shared component in the first job that needs it. Retire it in the job
  that rebuilds its last user, after its behavioural claims moved to the
  successor's test.

## Verify before "done"

Mandatory for any change that alters what `packages/web` renders:

1. Start `pnpm smoke` in the background. It seeds the sandbox HOME and connects
   nothing (ADR-0010), so the cockpit comes up on the connect gate.
   - Verifying a first-run screen → stop here; that is the state you need.
   - Verifying anything the cockpit shows once connected → run `pnpm smoke:ready`,
     which waits for the cockpit, connects the inventory and registers one repo.
2. Screenshot the changed UI with `agent-browser`, in each theme.
3. Read changed copy at a narrow width and at 200% zoom, in one theme.
4. Compare against the design source; on mismatch, fix before claiming done.
5. Run the `verify-in-smoke` checks before treating the screenshot as proof.
6. Record the evidence in the commit body: every absolute screenshot path and the
   cockpit URL from `pnpm cockpit:url`.

Only a screenshot proves visual fidelity — the vitest/happy-dom suite renders without CSS.
