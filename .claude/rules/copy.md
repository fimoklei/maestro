# Copy (project-specific for Maestro)

Applies to every word the cockpit shows, and to the server's request-shape
messages. See ADR-0025 for the decision.

Write simple English for a developer who knows git and a terminal but not APM.
Use short sentences, familiar words and direct instructions, guided by
[ASD-STE100 principles](https://www.asd-ste100.org/about_STE.html).
Full compliance with the standard and its dictionary is not required.

Use **outcome-first copy**. Treat a heading, body, detail and controls as one
message:

1. Check the implemented behaviour. Establish what finished, what did not
   change and what blocks progress.
2. Write a heading that names that outcome or block.
3. State what happened. Then give the next action and name its exact control or
   external place.
4. Put the cause in `detail` when it helps the reader decide or recover.
5. Read the complete message in its screen context. Rewrite anything that
   requires inference.

Use the screen names in `CONTEXT.md` and the exact labels of controls.

The copy review is complete when every changed user-facing string is accounted
for. The reader can tell on the first reading whether the action finished, what
remains unchanged and what to do next.

## Patterns

- Name a control as `Select {control} to {result}`.
- Name the external place when the cockpit has no control for the next action
  (`Merge it on GitHub.`).
- A deletion reads as its own status (`Deletion in draft`), never as a chip or
  clause beside another status.
- Before writing a sentence, grep `packages/web/src` for the control or status
  it names and reuse the form you find. Same meaning, same words.
- Approved sentences live in the copy module's sibling test as exact strings.
  Add a new sentence there; change an existing one there.
- Render changed copy in the cockpit. Read it at a narrow width and at 200% zoom
  as required by `design.md`.

## Calibration

```text
Weak
Local edits in the deployed copy
Nothing was removed.

Outcome-first
Local changes in deployed files
The skill was not removed. Its files changed after deployment.
Deploy again to restore the released files. Then remove the skill.
```

## Forms

| Kind | Form | Example |
|---|---|---|
| Notice | Outcome heading, what happened, useful cause in `detail`, one action | `Status out of date` |
| Detail sentence | Useful cause or recovery context in one or two short sentences | `Pull request #45 was closed without merging. Select Reopen proposal to continue it.` |
| Status chip | Two to four words, no verb, from `CONTEXT.md` | `Not yet proposed` |
| Control label | Verb plus object, from `CONTEXT.md` | `Propose change` |
| Blocked control | Label, em dash, cause in five words or fewer | `Withdraw proposal — no request yet` |
| Meta line | Fact, comma, when it was read | `Compared with main, read just now` |
| Empty state | `No {things} yet`, then one sentence saying what appears here | `No changes yet` |
| Busy label | `{Verb}ing…`, the verb of the control's own label, no object | `Deploying…` |
| Status announcement | Start: the busy label. End: `{Done word} {name}.` A failure is the notice, a toast replaces the end | `Deployed tdd.` |
| Loading text | `Loading the {screen name}…` — heard, not seen; visible only inside a dialog | `Loading the Inventory…` |
| Dialog | Title and confirm button share a verb. A dialog that acts on a subject the reader already chose titles `{Verb} {name}`, or `{Verb} {object} for {name}` where the verb carries its own object. A dialog that asks the reader to choose the subject titles `{Verb} a {thing}`. Confirm button `{Verb} {thing}` | `Delete {skill}` / `Delete skill`; `Withdraw proposal for {skill}` / `Withdraw proposal`; `Update a skill` / `Update skill` |
| Field | Visible label naming the value; a hint adds what a label cannot | `Folder path` |
| Accessible name | Visible words first, in the same order (`design.md`) | `Inventory table` |
| Request-shape message | `Nothing was {done}. Reload the page, then {do it} again.` plus a `detail` naming the expected shape | see `packages/server/src/app.ts` |
