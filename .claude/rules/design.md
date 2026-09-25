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

The principle behind each block is in `docs/design-principles.md`, by number.
Read it before designing a new screen, dialog or use case.

**Reuse.** Build from an existing pattern. When none fits, measure what
Vercel, Linear and Circle do; add the new pattern to `docs/design-principles.md`
before building it.

**Meaning and emphasis (1, 2).**
- Give a column, badge, glyph and word one meaning on every screen.
- Use Geist Mono only for a version, tag, path, ref or hash.
- Use blue only for focus, selection and links. Keep the primary action neutral.
- Put at most one coloured mark in a row. Leave a resting state uncoloured.

**Status (3).**
- Show every status as a `CONTEXT.md` word plus its family's glyph.
- Show one badge per row: the worst reading. Put the others in the detail pane.
- Show an unknown reading as a `?` badge, never as a notice.

**Disclosure (4).**
- Keep a row to one line. Put the summary in the hover card and the rest in
  the detail pane.
- Open a hover card on focus as well as hover. Put no control in it.

**Failures (5).**
- State a failure in a `Notice` after its cause, with one action named by its
  exact control label.
- Never move focus to a notice. Never remove a notice on a timer.
- Keep the previous rows on screen after a failed read. Recover with the
  screen's `Re-read {screen name}` control, never a page reload.
- Set `retry: false` on every query.

**Feedback and dialogs (6).**
- Pick the form from the kind → form → placement table. Add no banner.
- Put a field's hint between its label and the field. Only a refusal sits under
  the field.
- Show a field error on submit, as one `✕` line under the field. Clear it once
  the field is valid. Check a field that names a folder right after the pick.
- Use a toast only for a success the reader may miss. Never for an error, a
  warning or anything with an action.
- Confirm only an action that deletes files or writes to GitHub.
- Use two dialog widths, 480 and 640, top-aligned at 96px. Put Cancel on the
  leading side. Open a destructive dialog with focus on Cancel.
- Block every way of closing a dialog while its action runs. Ignore a click
  outside once a field has changed.
- Open no dialog, alert or toast on load.

**Waiting and freshness (7).**
- Show no status before the server confirms it.
- Show nothing under 1 s. Show the spinner in the pressed control at once for a
  write. Show skeleton rows after 1.3 s for at least 0.5 s; at once for a
  pressed re-read.
- Lock only what the server locks.
- Label a busy button `{Verb}ing…` from `busy-copy.ts`. Show no word for a read
  outside a dialog.
- Show a freshness line only beside data that ages. Date the oldest reading.
- Re-read unasked only on open, plus Deploy-state's rows on tab return.
- Animate only what floats, by opacity alone. Under reduced motion keep only
  the spinner moving.

**Keyboard and screen reader (8).**
- Build every table as a grid: one Tab stop, arrows inside, Enter opens the
  row's detail pane.
- Keep an unavailable control focusable with `aria-disabled`, and state why.
- Make every pointer target at least 24×24px.
- Mount one `role="status"` region per screen before its content changes. Set
  `aria-busy` on a region while it reads.
- Announce through that region only: a read when its skeleton appears, a
  write's busy label and its done sentence. Never announce what a toast or a
  notice already says. Never rename a busy control.

**Frame (9).**
- Build a screen as one of three frames: sidebar plus panel, the connect gate,
  or Settings.
- Put the primary action in band 1, Re-read, Filter and Display in band 2, a
  row's actions in its ⋮ menu and at the foot of its detail pane, and actions
  on a selection in the floating selection bar.
- Put no button in a table row.

**Tokens (10).**
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
