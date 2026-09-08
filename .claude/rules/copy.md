# Copy (project-specific for Maestro)

Every word the cockpit shows. The decision behind these rules is ADR-0025; the
resolved anchor rules are in `docs/research/copy-anchors-govuk-polaris.md`.

Not covered here: terminal and dev output, `README`, ADRs and `docs/` — those
have a different reader.

## The reader

Write for a developer teammate with git and a terminal and no APM knowledge.
The sentence must be readable aloud without spelling anything out.

Write sentences in the ASD-STE100 (Simplified Technical English) form the
faults below carry. The standard's approved-word dictionary is out of scope.

## The reviewer's unit

Review the **whole notice** — heading, sentence, `detail` and action label
together. Four of the faults below are undecidable on one string.

For screen-reader text, review the **pair**: the accessible name and the visible
label it names. For a landmark, the region it names.

Apply a rule only where a reviewer reading the unit, without the code and
without the author, reaches the same verdict. Anything softer than that is not
in this file.

Check every claim against the implemented behaviour first. State a cause, a
recovery, a duration or an outcome only where the code establishes it.

## The faults

Never ship any of these.

| # | Fault | The rule | Source |
|---|---|---|---|
| F1 | Lowercase label | Capitalise the first word of every heading, button, badge, empty state and loading state | [GOV.UK][az] · [Polaris][gram] |
| F2 | Heading as assertion | Write the heading as a noun phrase with no finite verb, and never restate the sentence below it | [Polaris][gram] |
| F3 | Over-long | At most two sentences, at most 15 words each | [GOV.UK][cl] |
| F4 | Cause displacing the action | Put the action in the sentence; put the cause in `detail` | [Polaris][err] |
| F5 | Unperformable instruction | Name a place, a command, or the control beside it. Exempt: an instruction whose only action is to wait, provided the sentence names what it waits for | [GOV.UK][gerr] |
| F6 | Anthropomorphism | Never give a system perception, want or intent | **Ours** |
| F7 | Bare verb on a button | Write {verb} + {noun}, except `Save`, `Close`, `Cancel`, `Done`, `OK` | [Polaris][act] · [GOV.UK][btn] |
| F8 | Button does not match the sentence | Run the sentence's last instruction with the same verb and the same object | **Ours** |
| F9 | Negative contraction | Write `cannot`, `did not`, `could not` | [GOV.UK][cl] (conflict 1) |
| F10 | Uppercase status | Never set status text in capitals | [GOV.UK][tag] |
| F11 | Passive voice | Write active where the actor is the reader or a third party. The agentless passive stands where the actor is Maestro and naming it adds nothing | [GOV.UK][cl] |
| F12 | Two words for one concept | Use one word per concept, on every surface | [Polaris][dev] |
| F13 | "valid" / "invalid" | Never write either, in a sentence or in a heading | [GOV.UK][gerr] · [Polaris][err] |
| F14 | Instruction that is not an imperative | Write `Select {control} to {result}` | [ASD-STE100][ste] |
| F15 | `-ing` form as a verb | Write the imperative or the simple present. Exempt: a progress label per R-C | [ASD-STE100][ste] |

Also never: an apology, `please`, `sorry`, an error code, a question-mark
heading, or apm's own prose ([GOV.UK][gerr], [GOV.UK][struct], [Polaris][gram];
`security.md`, ADR-0018). Name the destination in the link text itself, never
`click here` ([GOV.UK][links]).

## The shape of a notice

- **Heading** — the state, as a capitalised noun phrase.
- **Sentence** — at most two sentences of 15 words: the consequence *or* the
  constraint that was broken, then the action. Drop the first whenever the
  screen already shows it. Where the recovery is genuinely multi-step and
  starts in one place, write the action as one ordered sequence.
- **Detail** — at most one sentence, always visible: why this happened, or the
  alternative recovery. Never a second problem, never two lines. A `detail`
  passed at the call site replaces the table's; never both.
- **Action** — at most one, ever. {verb} + {noun}, running the sentence's last
  instruction.

Where no action exists, end on the cause. That notice is complete.

Where the notice is an offer (`level: "info"`), the heading names what is on
offer, not what is wrong.

## The forms

Write toward these.

- **Cause, then instruction** — "A reviewer asked for changes on pull request
  #45. Select Update proposal to send your changes."
- **Fact, then instruction** — "Pull requests #41 and #44 match this branch.
  Close one on GitHub."
- **Outcome only**, where no action exists — "Maestro tagged v1.5.0 and
  refreshed Inventory."
- **Empty state** — "Inventory shows released skills only. Create a release on
  the Harness view to fill it."

Where a form tempts you toward the wrong word, these pairs settle it. They
illustrate wording; take one only where the behaviour and the control match.

| Situation | Never | Write |
|---|---|---|
| A read failed and a retry exists | `Something went wrong. Try again.` | `Skills not read` · "Select {the re-read control} to read the skills again." |
| A search returned nothing | `No skills yet` | `No matching skills` · "Change your search terms." |
| A save is still running | `Saved` | `Saving changes…` |
| A field needs a repository URL | `Invalid input` | "Enter a repository URL." |
| A button opens the release dialog | `Publish release` | `Create a release` |
| A save failed and the cause is unknown | `Change persistence failure` | `Changes not saved` · "Select Save changes to try again." |
| The reader must run a command | "Run the command." | Name the folder and the exact command, and say what it does. ([Microsoft][steps]) |

## Rules per surface

- **R-A — accessible name.** Carry the visible label's words in the same order,
  the label first. Add what a glyph carries; never contradict it. Name an
  icon-only control by its action and a landmark by its content. ([W3C][a11y])
- **R-B — empty state.** Name what would be here and the one step that puts it
  there. First use, no search matches and no filter matches are three states,
  each with its own sentence. A failed or unknown read is not an empty state
  (`CONTEXT.md`).
- **R-C — progress label.** Write `Loading {the thing}…` for a retrieval and
  `{verb}ing {the thing}…` for other work, capitalised. Never a bare
  `Loading…`, and never a second verb for waiting. State a duration or a
  progress figure only where it is known.
- **R-D — control name.** Where a sentence names a control, use that control's
  label, letter for letter.
- **Field label** — short, sentence case, no colon. Hint text is one short
  sentence with no full stop, and never replaces the label. ([GOV.UK][input])
- **Status text** — sentence case, never carrying its meaning in colour alone.
  Started, pending, completed and partly completed are four states, not one.
  ([GOV.UK][tag])
- **Field error** — name the field's unmet requirement and the correction. A
  service failure takes a notice instead; never ask the reader to correct input
  that is already right. ([GOV.UK][gerr])
- **Confirmation** — name the object, the scope and the consequence before the
  action. Claim recovery only where Maestro can perform it. Label the button
  with the specific action beside `Cancel`. ([GOV.UK][btn])

## Terms

- Use the screen name from `CONTEXT.md` → **Screen names**. One concept keeps
  one screen name on every surface.
- Keep a term the reader types or reads in their own tools; send anything they
  would have to spell out to `detail` ([Polaris][fund], conflict 3).
- Where the instruction acts on the file, keep the filename in the sentence.
- A translated verb decides its noun form too; record both in `CONTEXT.md`.
- Explain on first use anything Maestro invented. An inherited tooling term
  needs no explanation. ([GOV.UK][az])
- Name Maestro as the actor where Maestro acted; never write `we`
  ([GOV.UK][tone], conflict 7).

## Where copy lives

- Every user-facing sentence lives in `packages/web`, in its feature's copy
  module, one row per error code carrying heading, sentence and `detail`.
- The server sends the error code and the HTTP status, never a sentence. The
  eight request-shape messages are the only exception.
- Never write one string in two places. A duplicate drifts on its own. Matching
  words alone do not make two messages one string; the meaning and the
  behaviour have to match too.
- Write a dynamic sentence whole, and check it at zero, one and many, and with
  a long name. Joining fragments produces a sentence nobody reviewed.

## Reviewer's checklist

Run this over every new or changed user-facing string, on the unit above.

1. Read it aloud. Anything you had to spell out belongs in `detail`.
2. Capitalised, active, under 15 words, at most two sentences.
3. The heading is a noun phrase and does not repeat the sentence.
4. The instruction is an imperative and names a place, a command, or a control
   by its exact label.
5. The button runs that instruction, with the same verb and the same object.
6. Every concept uses its screen name from `CONTEXT.md`.
7. Empty, unknown, failed, pending and completed each read as themselves.
8. On a UI change, read the string in the browser at a narrow width and at 200%
   zoom, as part of `design.md`'s check.

[cl]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
[az]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/
[struct]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/
[tone]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/
[gerr]: https://design-system.service.gov.uk/components/error-message/
[btn]: https://design-system.service.gov.uk/components/button/
[tag]: https://design-system.service.gov.uk/components/tag/
[input]: https://design-system.service.gov.uk/components/text-input/
[gram]: https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx
[fund]: https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx
[err]: https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx
[act]: https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx
[dev]: https://shopify.dev/docs/apps/design/content
[ste]: https://www.asd-ste100.org/
[links]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/
[a11y]: https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
[steps]: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions
