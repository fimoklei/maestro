---
paths:
  - "packages/web/src/**"
  - "packages/server/src/**"
---

# Copy (project-specific for Maestro)

Applies to every word the cockpit shows, and to the server's request-shape
messages, not their `detail`.

Write for a developer who knows git and a terminal but not APM. Each text lets
that reader understand what is happening, what their action changes and what
they can do next.

For shipped strings this file outranks `unslop` and
`writing-clearly-and-concisely`. Where they disagree, follow this file.

## Write a screen

Write copy one screen at a time, with every state of that screen in view.

1. Check the implemented behaviour: what each control does, what finished, what
   stays unchanged and what blocks progress. Trace each fact a text states to
   the code line that makes it true. A fact that neither code nor a decision
   settles is `unverified`; list it as an open question.
2. Fill the **term table**: one row per action and per thing on the screen,
   with the one word it gets and every place that word shows.
3. Write every text of every state from the term table.
4. Read each text aloud in its place on the screen. It is English that an app
   would print.
5. Ask the three questions of each text. Rewrite until each answer is yes, or
   the question has no part in that text.
   - Does the reader understand what this means?
   - Does the reader know what the action changes?
   - Does the reader know what is possible next?
6. Check the whole screen against the term table: an action has the same verb
   in its row name, its sentence, its button, its tooltip and its dialog.

The copy is done when every changed string has a row in the term-table check,
has passed the three questions, and states only traced facts.

```text
Term table
  Action or thing            Word                   Shows in
  Open a pull request        Create pull request    button, row sentence, dialog title, confirm
  Send new changes to it     Update pull request    button, row sentence
```

## Principles

1. **Name the result of an action.** A control label is a verb with its
   object: `Create pull request` for a control that opens one.
2. **Match the words to the behaviour.** A control that changes data reads as a
   change; a control that only shows reads as a view.
3. **One word for one thing.** Different actions get different names:
   `Create pull request`, `Update pull request`.
4. **Write from the reader's task.** Say what the reader can achieve. Describe
   an internal process only when it helps the reader choose.
5. **State the consequence before the action.** Say whether it adds, replaces,
   shares or deletes, and what it leaves alone.
6. **Give each text its own job.** A heading names the subject or the outcome.
   The body adds the context the reader needs. A button names the action. Each
   says what the others leave out.
7. **Make a failure recoverable.** Say what the product could not do, the cause
   when it is known, and the next step that is available.
8. **Make an empty state a starting point.** Say what is missing and how to
   begin.
9. **Keep what clarifies a choice or a consequence; cut the rest.** Use plain
   words and the active voice.
10. **Promise only what the product does.** An unknown cause, recovery or route
    stays out of the text and goes to the author as an open question.
11. **Keep text that already works.** Rewrite for understanding, consistency or
    usability. Taste alone is no reason.

## Names and reuse

- Use the screen names and terms in `GLOSSARY.md`, and the exact label of a
  control, read from its label constant.
- Name the external place when the cockpit has no control for the next action
  (`Merge it on GitHub.`).
- The Change column states what a change does; the Status states only where it
  stands.
- Before writing a sentence, grep `packages/web/src` for a shipped sentence with
  the same meaning. Reuse it word for word when it passes the three questions;
  when it fails, write a new one and file a tracker issue for the shipped one.
- Approved sentences live in the copy module's sibling test as exact strings.
  Add a new sentence there; change an existing one there.
- Run the final texts through the `writing-clearly-and-concisely` skill before
  showing them: in code, a spec, a ticket or a proposal in chat.
- Render changed copy in the cockpit. Read it at a narrow width and at 200% zoom
  as required by `design.md`.
- When you retire a screen word, add the old word to `scripts/copy-guard.mjs`.
  List only a word that is wrong in every screen use; a word with a second
  meaning stays with review.

## Register

Write level statements and commands that end in a full stop.
`scripts/copy-guard.mjs` lists the words and marks this register leaves out.

## Forms

| Kind | Form | Example |
|---|---|---|
| Notice | A failure or a block, one per band: the one that blocks most. Notices that share an action merge, the parts in `detail`. The heading names what the product could not do, or the step that fixes it. The body gives the cause and the next step available | `Couldn't load Harness categories`; `Update Maestro to load Harness categories` |
| Detail sentence | Useful cause or recovery context in one or two sentences | `Pull request #45 was closed without merging. Select Reopen proposal to continue it.` |
| Hover card | The status reason in one sentence, then the read age | `2 of 5 deployed skills changed in v1.4.0.` |
| Status chip | Two to four words, no verb, from `GLOSSARY.md` | `Not yet proposed` |
| Control label | Verb plus object, naming the result; a reach beyond the row in words | `Create pull request`, `Remove from all 3 targets` |
| Blocked control | A button keeps its plain label. The sentence beside it in that state says what to do first; its tooltip says the same in the fewest words. A menu item keeps its plain label and no cause | `Create pull request`, beside it `Update Maestro before creating a pull request.`, tooltip `Update Maestro first.` |
| Group header meta | The fact, no routine read age | `Compared with the next release` |
| Empty state | `No {things} yet`, then one sentence that says how to begin | `Add a category or copy categories from the Harness.` |
| Busy label | `{Verb}ing…`, the verb of the control's own label, no object | `Deploying…` |
| Tooltip cause | A blocked button's tooltip and description: one short command that says what to do first, or the cause when the reader can do nothing. The detail belongs in the sentence beside the button | `Add a category.`; `Wait for pull request #46.` |
| Status announcement | Start: the busy label. End: `{Done word} {name}.` A failure is the notice, a toast replaces the end | `Deployed tdd.` |
| Loading text | `Loading the {screen name}…` — heard, not seen; visible only inside a dialog | `Loading the Skills…` |
| Dialog | Title and confirm button share a verb with the control that opens the dialog. A dialog that acts on a subject the reader already chose titles `{Verb} {name}`, or `{Verb} {object} for {name}` where the verb carries its own object; where the control label ends in a phrase, wrap the name inside it: `Withdraw {name} from release`. A dialog that asks the reader to choose the subject titles `{Verb} a {thing}`. Confirm button `{Verb} {thing}`. The body states what changes, then what stays | `Delete {skill}` / `Delete skill`; `Withdraw proposal for {skill}` / `Withdraw proposal`; `Withdraw {skill} from release` / `Withdraw from release`; `Update a skill` / `Update skill`; `Your targets keep the skill until you update them.` |
| Field | Visible label naming the value; a hint adds what a label cannot | `Folder path` |
| Accessible name | Visible words first, in the same order (`design.md`) | `Skills table` |
| Request-shape message | `Nothing was {done}. Reload the page, then {do it} again.` Its `detail` names the expected shape for a developer; never show it in the cockpit | see `packages/server/src/request-bodies.ts` |

## Calibration

Each pair is a shipped or drafted string and its fix. Match the right-hand form.

```text
Control label: names the gesture, not the result
  Weak    Upload
  Better  Create pull request
          Update pull request   (while the reader's pull request is open)

Row sentence: a process told in fragments
  Weak    Opens a pull request. If the curator merges it, your list becomes the
          Harness categories.
  Better  Propose your categories for the connected Harness. This creates a pull
          request for review.

Row sentence: a negative that reads stilted aloud
  Weak    Copies them into your categories. Your list does not follow the
          Harness afterwards.
  Better  Copies the Harness categories into your list. Your list stays as it is
          when the Harness changes.

Blocked control: the sentence beside it still describes the action
  Weak    Uploads your categories to the connected Harness.
  Better  Update Maestro before creating a pull request.
          Add or copy at least one category before creating a pull request.

Empty state: says what will appear, not how to begin
  Weak    Categories appear here.
  Better  Add a category or copy categories from the Harness.

Notice: a clipped heading and a body that sends the reader to a control
  Weak    Harness categories not read
          The categories file in v1.5.0 has an error. Select Upload to open a
          pull request with your categories.
  Better  Couldn't load Harness categories
          The categories file in Harness release v1.5.0 contains an error. You
          can still propose your own categories for review.

Notice: the cause told from the file's side
  Weak    Harness categories not read
          The categories file in v1.5.0 needs a newer Maestro. Update Maestro to
          read it.
  Better  Update Maestro to load Harness categories
          Harness release v1.5.0 uses a category format this version of Maestro
          doesn't support. Update Maestro to load these categories.

Notice: the outcome alone hides the next step
  Weak    Local edits in the deployed copy
          Nothing was removed.
  Better  Local changes in deployed files
          The skill was not removed. Its files changed after deployment.
          Deploy again to restore the released files. Then remove the skill.

Notice: the control is named with Press
  Weak    Press Retry check to read GitHub again.
  Better  Select Re-read Harness to read GitHub again.

Detail sentence: cause without the next step
  Weak    The proposal branch is pushed, but no pull request opens it.
  Better  The proposal branch is on GitHub without a pull request.
          Select Create pull request to open one.

Status chip: the word disagrees with what happened
  Weak    Pull request missing   (shown after the pull request was merged)
  Better  Proposal merged

Tooltip cause: repeats the sentence beside the button
  Weak    mira has pull request #46 open for the Harness categories. Wait until
          it is merged or closed.
  Better  Wait for pull request #46.

Tooltip cause: names the state, not what to do first
  Weak    Maestro detected no tool for Global on this machine.
  Better  Install Claude Code or Codex to deploy skills globally.

Detail sentence: clipped fragments instead of one joined sentence
  Weak    code-review waits too. One deploy writes every Global skill at once.
  Better  Global skills deploy together, so local edits to commit-message
          also prevented code-review from being deployed.

Instruction: a filler word that reads stilted aloud
  Weak    Restore or delete the copy there yourself.
  Better  Delete the copy yourself.
```
