# Copy (project-specific for Maestro)

Every word the cockpit shows. The decision behind these rules is ADR-0025; the
resolved anchor rules are in `docs/research/copy-anchors-govuk-polaris.md`.

Not covered here: terminal and dev output, `README`, ADRs and `docs/` — those
have a different reader.

## The reader

Write for a developer teammate with git and a terminal and no APM knowledge.
The sentence must be readable aloud without spelling anything out.

## The reviewer's unit

Review the **whole notice** — heading, sentence, `detail` and action label
together. Four of the faults below are undecidable on one string.

For screen-reader text, review the **pair**: the accessible name and the visible
label it names. For a landmark, the region it names.

Apply a rule only where a reviewer reading the unit, without the code and
without the author, reaches the same verdict. Anything softer than that is not
in this file.

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

Also never: an apology, `please`, `sorry`, an error code, a question-mark
heading, `click here`, or apm's own prose ([GOV.UK][gerr], [GOV.UK][struct],
[Polaris][gram]; `security.md`, ADR-0018).

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

## Rules per surface

- **R-A — accessible name.** State the same fact as the visible label beside it,
  in the same words. Add what a glyph carries; never contradict it.
- **R-B — empty state.** Name what would be here and the one step that puts it
  there.
- **R-C — loading state.** Write `Loading {the thing}…`, capitalised. Never a
  bare `Loading…`, and never a second verb for waiting.
- **R-D — control name.** Where a sentence names a control, use that control's
  label, letter for letter.
- **Field label** — short, sentence case, no colon. Hint text is one short
  sentence with no full stop, and never replaces the label. ([GOV.UK][input])
- **Status text** — sentence case, never carrying its meaning in colour alone.
  ([GOV.UK][tag])

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
- Never write one string in two places. A duplicate drifts on its own.

## Reviewer's checklist

Run this over every new or changed user-facing string, on the unit above.

1. Read it aloud. Anything you had to spell out belongs in `detail`.
2. Capitalised, active, under 15 words, at most two sentences.
3. The heading is a noun phrase and does not repeat the sentence.
4. The instruction names a place, a command, or a control by its exact label.
5. The button runs that instruction, with the same verb and the same object.
6. Every concept uses its screen name from `CONTEXT.md`.

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
