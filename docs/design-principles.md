# Design principles

Read this before designing a new screen, dialog or use case. The rules an agent
must obey are in `.claude/rules/design.md`; this file says what each rule is for
and shows it on a real screen. The values live in `.impeccable/design.json`;
why the system is this way is in ADR-0033.

## Reuse before you invent

Build a new feature from the patterns below. When none fits, look at what
Vercel, Linear and Circle do with the same problem, and measure it rather than
recall it. A new pattern needs a reason, and it enters this file before it is
built.

## What the reader sees

### 1. One meaning, one form

A column, a badge, a glyph, a typeface and a word each carry one meaning, the
same on every screen. Geist Mono marks a machine value (version, tag, path,
ref, hash) and nothing else. Blue means focus, selection or a link, never a
status.

*Maestro:* the Inventory's old cell showing reach and status together became a
Status badge and a Targets number. *Re-read* is the only word for reading again;
*Refresh* and *Retry check* are retired.

### 2. Emphasis is scarce

The resting state is plain text on a neutral surface. Colour marks what needs
the reader. The primary action is neutral (slate 12), so colour stays free for
status. At most one coloured mark per row.

*Maestro:* Up to date rows carry no colour; Pinned per skill and Other origin
turned neutral because neither asks for an action.

### 3. A status is a word and a shape, then a colour

Every status reads without colour: a word from `CONTEXT.md` plus a glyph. Five
families: Good ✓ green, Attention ↑/⚠ amber, Failed ✕ red, Unknown ? slate,
Neutral slate. Two readings never become two badges; the worst one wins the row
and the rest go to the detail pane. Unknown is a status, never a notice.

*Maestro:* a Deploy-state target with local edits and a newer release shows
Local edits ✎ in the row; the pane lists both.

### 4. Disclose in three steps

The row says one word. The hover card summarises it, opens on focus as well as
hover, and holds no control. The 360px detail pane holds the rest: every
reading, the notice, the actions. Row text stays short; long content never
makes a tall row.

*Maestro:* the Harness's Detail column was retired into the Status hover card
and the pane.

## What happens when the reader acts

### 5. A failure states itself where it happened, and stays

A failure is text beside its cause, with an outcome-first heading, what did not
change, and one next action named by its exact control (`copy.md`, ADR-0024).
It stays until the reader resolves or dismisses it. Focus never moves to it
uninvited. A failed read keeps the previous rows on screen and recovers in
place through the screen's own re-read control, never a page reload. No read
retries silently.

*Maestro:* a failed Re-read Deploy-state puts one notice at the top of the
panel content, above the old rows, with the action **Re-read Deploy-state**.

### 6. Feedback sits after its cause

Pick the form from the table; do not design a new one.

| Kind | Form | Placement |
|---|---|---|
| Failure or warning about one control, row or region | `Notice` | After its cause. In a dialog: above the footer. From a row's ⋮ menu: top of the detail pane. |
| Screen-wide failure | `Notice` | Top of the panel content. No banner. |
| Field hint | One sentence in `meta`, slate 11: what the reader must know before acting | Between the label and the field, as Vercel and Linear place it. Only a refusal sits under the field. |
| Field error | One `✕` line in red 11, shown on submit, cleared once the field is valid. A field that names a folder checks right after the pick, because the fields after it wait on that answer. A refusal with a heading and a cause is a `Notice` in the same slot. | Under the field |
| Information | `Notice` at `info` | In the region it describes |
| Status of data | Badge in the row, mark in the pane | The row |
| Busy | Spinner. A button also reads `{Verb}ing…`, the verb of its own label with no object. A read shows no word outside a dialog. | In the pressed button, the row's ⋮ icon, or the re-read control |
| Success the reader can see | The row's new status | The row, nothing else |
| Success the reader may miss | Toast, success only, 5 s, pauses on hover and focus | Bottom right |
| Confirmation | Dialog, 480px | Top-aligned at 96px |
| Partial result across several skills | Report in the dialog that ran the action, 640px, worst group first | The dialog stays open |

A confirmation dialog exists only for an action that deletes files or writes to
GitHub (Remove, Delete, Unregister, Propose change, Withdraw proposal, Create a
release). Deploy and Update run without one. A dialog that collects input is a
form, not a confirmation.

Dialog anatomy: header 48px with the title and a close control; body; footer
with Cancel leading and the action trailing; title and action share a verb.
Focus opens on the first field, else the primary button, and on **Cancel** in a
destructive dialog; it returns to the control that opened the dialog. Escape,
Cancel, close and a click outside all close it, none while the action runs, and
a click outside does nothing once a field has changed. Nothing opens on load.

### 7. The cockpit waits for the truth

No status shows before the server confirms it. A write locks its own control
and shows the spinner at once; only what the server locks is locked.

| Wait | Shows |
|---|---|
| Under 1 s | Nothing |
| 1–10 s | Spinner in the control; for a region, skeleton rows in the table's own shape after 1.3 s, held at least 0.5 s |
| A pressed re-read | The skeleton at once, held at least 0.5 s |
| Over 10 s | No action takes this long: a bulk deploy is one install. Redesign an action that would; never a progress bar without real progress |

Every table screen has one icon-only control, `Re-read {screen name}`. A
freshness line (`Read 4 min ago`) appears only beside data that ages, dates the
oldest reading on the screen, and ticks. Nothing re-reads unasked except on
open, and Deploy-state's rows on tab return. Only what floats moves, by opacity
alone; under reduced motion everything but the spinner is still.

## How it is built

### 8. Every control works from the keyboard and says its name

Something visible always has focus. A table is a grid: one Tab stop, arrows
move inside it, Enter opens the row's detail pane. A menu button opens with
Enter, Space or Down Arrow and lands on the first item. An unavailable control
stays focusable with `aria-disabled` and says why. The accessible name starts
with the visible words. Targets are at least 24×24px. Everything holds at 200%
zoom and a narrow width. One `role="status"` region per screen exists before
its content changes; a busy region carries `aria-busy`. The region announces a
read only when the skeleton appears, then `{Screen name} loaded.` It announces a
write's busy label, then `{Done word} {name}.` A toast replaces that end and a
failure is its notice, so nothing is heard twice. A busy control keeps its name.

*Maestro:* the Inventory's 36 rows are one Tab stop, not 72.

### 9. Every screen is the same frame

A 244px sidebar and one panel. The panel has two 48px bands, one table, and a
360px detail pane; only the content scrolls. Each kind of action has one place:

| Action | Place |
|---|---|
| The screen's primary action | Band 1, right of the title |
| Re-read, Filter, Display | Band 2, icon-only |
| An action on one row | The row's trailing ⋮ menu, and the foot of its detail pane |
| An action on selected rows | The floating selection bar |

No button sits in a row. The connect gate and Settings are the two other
frames; a new screen is one of the three.

*Maestro:* **Propose change** is the first item of the Harness row's ⋮ menu
and the button at the foot of the pane, never a button in the row.

### 10. Build from the tokens, never a new value

Five type sizes, three weights, six spacing steps, three radii, one shadow,
four motion tokens, and 17 measured colour pairs, all AA in both themes. A
value or a colour pairing outside them is a change to `design.json` with its
contrast measured, never an exception on one screen. Light and dark are equal:
every screen is checked in both, from the job that makes Light reachable.
