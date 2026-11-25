---
paths:
  - "packages/web/src/**/*-copy*.ts"
  - "packages/web/src/ui/control-labels.ts"
  - "packages/server/src/request-bodies.ts"
---

# Copy

Applies to every word the cockpit shows, and to the server's request-shape
messages, not their `detail`.

Write for a developer who knows git and a terminal but not APM. Each text lets
that reader understand what is happening, what their action changes and what
they can do next.

For shipped strings this file outranks `unslop` and
`writing-clearly-and-concisely`. Where they disagree, follow this file.

Where this file is silent, follow the
[Microsoft Writing Style Guide](https://learn.microsoft.com/style-guide/welcome/).
This file and `GLOSSARY.md` win where they differ from it.

## Write a screen

Write copy one screen at a time, with every state of that screen in view.

1. Check the implemented behaviour: what each control does, what finished, what
   stays unchanged and what blocks progress. Trace each fact a text states to
   the code line that makes it true. A fact that neither code nor a decision
   settles is `unverified`; list it as an open question.
2. Fill the **term table**: one row per action and per thing on the screen,
   with the one word it gets and every place that word shows. Before a word
   enters the table, grep `packages/web/src/ui/control-labels.ts` and
   `GLOSSARY.md` for it. When the word already names another action or thing,
   choose a different word or give the conflict to the author as an open
   question.
3. Write every text of every state from the term table. Write a sentence that
   holds a count as a whole sentence for zero, for one and for many, and check
   it with the longest realistic name.
4. Read each text as the reader meets it: in its place on the screen, with the
   texts around it. It reads as natural English that a well-made app prints,
   in whole sentences, with no telegram fragments and no stilted negatives.
5. Ask the three questions of each text. Rewrite until each answer is yes, or
   the question does not apply to that text.
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
7. **Make a failure recoverable.** Say what the product could not do and the
   next step that is available. Give the cause only when the reader needs it
   to act or to choose.
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
- Name a control in a sentence only when the reader cannot see it beside that
  sentence: an icon-only control, a menu item, or a control on another screen.
  Write `Select {label}`, and add the screen when the control is on another
  screen. Where the control sits beside the sentence, say what the reader can
  do and let the control name itself.
- A failure notice is the exception. Its body names the control that recovers,
  as `Select {label}`, also when that control is the notice's own button.
- Name the external place when the cockpit has no control for the next action
  (`Merge it on GitHub.`).
- The Change column states what a change does; the Status states only where it
  stands.
- Before writing a sentence, read the screen's copy module, and grep
  `packages/web/src` for the control, status or thing the sentence names. Reuse
  a shipped sentence with the same meaning word for word when it passes the
  three questions. When it fails, write a new one and report the shipped one to
  the author, who files a tracker issue for it.
- Approved sentences live in the copy module's sibling test as exact strings.
  Add a new sentence there; change an existing one there.
- When you retire a screen word, add the old word to `scripts/copy-guard.mjs`.
  List only a word that is wrong in every screen use; a word with a second
  meaning stays with review.

## Register

- Write calm, factual statements and commands.
- End a sentence in a full stop. A heading, title, label, chip and legend take
  none.
- Write sentence case: a capital for the first word, for a `GLOSSARY.md` name
  and for a control label named in a sentence.
- Contract a negative: `couldn't`, `doesn't`, `can't`, `isn't`, `wasn't`,
  `won't`.
- `scripts/copy-guard.mjs` lists the words and marks this register leaves out.

## Forms

| Kind | Form | Example |
|---|---|---|
| Notice | A failure or a block. A band shows one notice: the one that blocks most. Notices with the same action become one notice that lists each part in `detail`. The heading names what the product could not do, or the step that fixes it. The body gives the next step available, and the cause when the reader needs it | `Couldn't read Harness categories` |
| Detail sentence | Useful cause or recovery context in one or two sentences | `Pull request #45 was closed without merging. Select Reopen proposal to continue it.` |
| Hover card | The status reason in one sentence, then the read age | `2 of 5 deployed skills changed in v1.4.0.` |
| Status chip | The word `GLOSSARY.md` gives the reading. A new word is short, has no verb and enters `GLOSSARY.md` first | `Not yet proposed`, `Behind` |
| Control label | Verb plus object, naming the result. One word where the row or dialog beside it names the object; the accessible name then carries the object. A control that acts on more than its own row says how far in words | `Create pull request`; `Copy` in the row `Copy Harness categories`; `Remove from all 3 targets` |
| Row sentence | One or two sentences beside a row's control: what the control does, then what it leaves alone | `Copies the Harness categories into your list. Your list stays as it is when the Harness changes.` |
| Blocked control | A button keeps its plain label, and its tooltip is one short command that says what to do first. Where a row sentence sits beside the button, that sentence says in this state what to do first; add no separate cause line (`design.md`). A menu item keeps its plain label and no cause | `Create pull request`, beside it `Add or copy at least one category before creating a pull request.`, tooltip `Add a category.` |
| Group header meta | The fact, no routine read age | `Compared with the next release` |
| Empty state | `No {things} yet`, then one short sentence that says how to begin. It names the first step, and leaves out a route that applies only under a condition | `Add a category or copy categories from the Harness.` |
| Busy label | `{Verb}ing…`, the verb of the control's own label, no object | `Deploying…` |
| Tooltip cause | A blocked button's tooltip and description: one short command that says what to do first, or the cause when the reader can do nothing. The detail belongs in the sentence beside the button | `Add a category.`; `Wait for pull request #46.` |
| Status announcement | Start: the busy label. End: `{Done word} {name}.` A failure is the notice, a toast replaces the end | `Deployed tdd.` |
| Loading text | `Loading the {screen name}…` — heard, not seen; visible only inside a dialog | `Loading the Skills…` |
| Dialog | Title and confirm button share a verb with the control that opens the dialog. A dialog that acts on a subject the reader already chose titles `{Verb} {name}`, or `{Verb} {object} for {name}` where the verb carries its own object; where the control label ends in a phrase, wrap the name inside it: `Withdraw {name} from release`. A dialog that asks the reader to choose the subject titles `{Verb} a {thing}`. Confirm button `{Verb} {thing}`. The body states what changes, then what stays | `Delete {skill}` / `Delete skill`; `Withdraw proposal for {skill}` / `Withdraw proposal`; `Withdraw {skill} from release` / `Withdraw from release`; `Add a category` / `Add category`; `Your targets keep the skill until you update them.` |
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

Row sentence: a negative that reads stilted
  Weak    Copies them into your categories. Your list does not follow the
          Harness afterwards.
  Better  Copies the Harness categories into your list. Your list stays as it is
          when the Harness changes.

Blocked control: the sentence beside it still describes the action
  Weak    Uploads your categories to the connected Harness.
  Better  Add or copy at least one category before creating a pull request.

Dialog: the title has no verb, so it differs from the control and the confirm
  Weak    Release acme/team-harness     (opened by Create a release,
                                         confirmed by Publish release)
  Better  Publish release for acme/team-harness

Empty state: says what will appear, not how to begin
  Weak    Categories appear here.
  Better  Add a category or copy categories from the Harness.

Notice: a clipped heading and a body that sends the reader to a control
  Weak    Harness categories not read
          The categories file in v1.5.0 has an error. Select Upload to open a
          pull request with your categories.
  Better  Couldn't read Harness categories
          The categories file in Harness release v1.5.0 contains an error. You
          can still propose your own categories for review.

Notice: the outcome alone hides the next step
  Weak    Local edits in the deployed copy
          Nothing was removed.
  Better  Local changes in deployed files
          The skill wasn't removed. Its files changed after deployment.
          Deploy again to restore the released files. Then remove the skill.

Detail sentence: an internal word for what the reader deployed
  Weak    Part of the selection is not on disk.
  Better  Some deployed skills are missing from the target.

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
  Better  Install Claude Code or Codex and start it once to deploy skills
          globally.

Detail sentence: clipped fragments instead of one joined sentence
  Weak    code-review waits too. One deploy writes every Global skill at once.
  Better  Global skills deploy together, so local edits to commit-message
          also prevented code-review from being deployed.

Detail sentence: a filler word that reads stilted
  Weak    Restore or delete the copy there yourself.
  Better  Delete the copy yourself.
```
