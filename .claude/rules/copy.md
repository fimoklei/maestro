---
paths:
  - "packages/web/src/**"
  - "packages/server/src/**"
---

# Copy (project-specific for Maestro)

Applies to every word the cockpit shows, and to the server's request-shape
messages. See ADR-0025 for the decision.

Write simple English for a developer who knows git and a terminal but not APM.
Use short sentences, familiar words and direct instructions, guided by
[ASD-STE100 principles](https://www.asd-ste100.org/about_STE.html).
Full compliance with the standard and its dictionary is not required.

For shipped strings this file outranks `unslop` and
`writing-clearly-and-concisely`. Where they disagree, follow this file.

Use **outcome-first copy**. Treat a heading, body, detail and controls as one
message:

1. Check the implemented behaviour. Establish what finished, what did not
   change and what blocks progress.
2. Write a heading that names that outcome or block.
3. State what happened. Then give the next action and name its exact control or
   external place.
4. Put the cause in `detail` when it helps the reader decide or recover.
5. Run every draft through the `writing-clearly-and-concisely` skill before
   showing it: in code, a spec, a ticket or a proposal in chat.
6. Read the complete message in its screen context. Rewrite anything that
   requires inference.

Give every surface **one idea**: a screen answers one question, and each band,
hover card, hint, dialog body and sentence carries one part of it.

Use the screen names in `CONTEXT.md` and the exact labels of controls.

The copy review is complete when every changed user-facing string is accounted
for and has passed the `writing-clearly-and-concisely` skill. The reader can tell on the first reading whether the action finished, what
remains unchanged and what to do next.

When you retire a screen word, add the old word to `scripts/copy-guard.mjs`.
List only a word that is wrong in every screen use; a word with a second
meaning stays with review.

## Sentences (ASD-STE100)

- Write one instruction per sentence, in the imperative. Put the goal or
  condition first: `To keep them, commit them first.`
- Write in the simple present, past or future, in the active voice.
- Use one-word verbs: `replaces`, `restores`, `changes`.
- Write a warning as a command plus its reason.
- Keep a sentence to 12 words; 20 is the ceiling.

## Patterns

- Name a control as `Select {control} to {result}`, with `{control}` read from
  its label constant. Add its screen when the control sits on another screen.
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

## Register

Write level statements and commands that end in a full stop.
`scripts/copy-guard.mjs` lists the words and marks this register leaves out.

## Calibration

Each pair is a shipped string and its fix. Match the right-hand form.

```text
Notice: the outcome alone hides the next step
  Weak           Local edits in the deployed copy
                 Nothing was removed.
  Outcome-first  Local changes in deployed files
                 The skill was not removed. Its files changed after deployment.
                 Deploy again to restore the released files. Then remove the skill.

Notice: the control is named with Press (#860)
  Weak           Status out of date
                 Press Retry check to read GitHub again.
  Outcome-first  Status out of date
                 Select Re-read Harness to read GitHub again.

Detail sentence: cause without the next step (#857)
  Weak           The proposal branch is pushed, but no pull request opens it.
  Outcome-first  The proposal branch is on GitHub without a pull request.
                 Select Create pull request to open one.

Empty state: off-form, with a control label that differs from the button (#867)
  Weak           Nothing to propose
                 Edit a skill in your clone, or press Import skill, to propose a change.
  Outcome-first  No changes yet
                 Skills you import or edit in your clone will appear here.

Status chip: the word disagrees with what happened (#889)
  Weak           Pull request missing   (shown after the pull request was merged)
  Outcome-first  Proposal merged
```

## Forms

| Kind | Form | Example |
|---|---|---|
| Notice | A failure or a block, one per band: the one that blocks most. Notices that share an action merge, the parts in `detail`. Outcome heading, what happened, useful cause in `detail`, one action | `Status out of date` |
| Detail sentence | Useful cause or recovery context in one or two short sentences | `Pull request #45 was closed without merging. Select Reopen proposal to continue it.` |
| Hover card | The status reason in one sentence, then the read age | `2 of 5 deployed skills changed in v1.4.0.` |
| Status chip | Two to four words, no verb, from `CONTEXT.md` | `Not yet proposed` |
| Control label | Verb plus object, from `CONTEXT.md`; a reach beyond the row in words | `Propose change`, `Remove from all 3 targets` |
| Blocked control | Label, em dash, cause in five words or fewer | `Update target — no GitHub origin` |
| Group header meta | The fact, no routine read age | `Compared with main` |
| Empty state | `No {things} yet`, then one sentence saying what appears here | `No changes yet` |
| Busy label | `{Verb}ing…`, the verb of the control's own label, no object | `Deploying…` |
| Status announcement | Start: the busy label. End: `{Done word} {name}.` A failure is the notice, a toast replaces the end | `Deployed tdd.` |
| Loading text | `Loading the {screen name}…` — heard, not seen; visible only inside a dialog | `Loading the Inventory…` |
| Dialog | Title and confirm button share a verb. A dialog that acts on a subject the reader already chose titles `{Verb} {name}`, or `{Verb} {object} for {name}` where the verb carries its own object. A dialog that asks the reader to choose the subject titles `{Verb} a {thing}`. Confirm button `{Verb} {thing}`. The body states what changes, then what stays | `Delete {skill}` / `Delete skill`; `Withdraw proposal for {skill}` / `Withdraw proposal`; `Update a skill` / `Update skill`; `Nobody loses the skill until the pull request is merged.` |
| Field | Visible label naming the value; a hint adds what a label cannot | `Folder path` |
| Accessible name | Visible words first, in the same order (`design.md`) | `Inventory table` |
| Request-shape message | `Nothing was {done}. Reload the page, then {do it} again.` plus a `detail` naming the expected shape | see `packages/server/src/app.ts` |
