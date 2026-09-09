# Copy (project-specific for Maestro)

Applies to every word the cockpit shows, and to the server's request-shape
messages. See ADR-0025 for the decision.

Write simple English for a developer who knows git and a terminal but not APM.
Use short sentences, familiar words and direct instructions, guided by
[ASD-STE100 principles](https://www.asd-ste100.org/about_STE.html).
Full compliance with the standard and its dictionary is not required.

Describe what happened and what the reader can do next. Match the actual
behaviour. Use the screen names in `CONTEXT.md` and the exact labels of controls.

Read the whole message in context, including its heading and controls.
The reader should understand it on the first reading.

## Patterns

- Name a control as `Select {control} to {result}`. Never Press, Click or Use.
- State the cause first, then the next step. The step names the control, or
  the place when the cockpit has no control for it (`Merge it on GitHub.`).
- A deletion reads as its own status (`Deletion in draft`), never as a chip or
  clause beside another status.
- Before writing a sentence, grep `packages/web/src` for the control or status
  it names and reuse the form you find. Same meaning, same words.
- Approved sentences live in the copy module's sibling test as exact strings.
  A new sentence is added there; an existing one changes only with an issue.

## Forms

| Kind | Form | Example |
|---|---|---|
| Notice | Heading, one sentence, one `detail` saying why, one action | `Status out of date` |
| Detail sentence | Cause, then step; at most two sentences of fifteen words | `Pull request #45 was closed without merging. Select Reopen proposal to continue it.` |
| Status chip | Two to four words, no verb, from `CONTEXT.md` | `Not yet proposed` |
| Control label | Verb plus object, from `CONTEXT.md` | `Propose change` |
| Blocked control | Label, em dash, cause in five words or fewer | `Withdraw proposal — no request yet` |
| Meta line | Fact, comma, when it was read | `Compared with main, read just now` |
| Empty state | `No {things} yet`, then one sentence saying what appears here | `No changes yet` |
| Loading text | `Loading the {screen name}…` | `Loading the Inventory…` |
| Dialog | Title `{Verb} a {thing}`, confirm button `{Verb} {thing}` | `Update a skill` / `Update skill` |
| Field | Visible label naming the value; a hint adds what a label cannot | `Folder path` |
| Accessible name | Visible words first, in the same order (`design.md`) | `Inventory table` |
| Request-shape message | `Nothing was {done}. Reload the page, then {do it} again.` plus a `detail` naming the expected shape | see `packages/server/src/app.ts` |
