# Copy (project-specific for Maestro)

Write and review every word the cockpit shows using these rules. ADR-0025
owns the product decisions; `docs/research/copy-anchors-govuk-polaris.md`
records the original source review.

Not covered here: terminal and dev output, `README`, ADRs and `docs/`. Those
have a different reader.

## The reader

Write for someone using Maestro to manage their AI tools, without assuming
programming, git, terminal or APM knowledge. Use everyday English and explain
necessary technical terms where they first appear. Keep exact screen names;
explain what they mean rather than inventing synonyms.

The reader must understand what happened, what it means for their task and
what to do next, using the visible text alone. Include only the answers that
matter in that state. Prefer a natural sentence over a shorter fragment that
makes the reader work out the meaning.

## The reviewer's unit

Review the **whole notice**, including heading, body, `detail` and action
label. Include the field or screen it refers to. Judge each rule against
that visible context.

For screen-reader text, review the **pair**: the accessible name and the visible
label it names. For a landmark, the region it names.

Apply a rule only where a reviewer reading the unit, without the code and
without the author, reaches the same verdict. Before review, check factual
claims against the implemented behavior. Do not invent a cause, recovery,
duration, or successful outcome.

## The faults

These rules combine source guidance with Maestro conventions. **Ours** marks
a local restriction, not a universal UI writing rule. The fault IDs remain
stable for existing reviews.

| # | Fault | The rule | Source |
|---|---|---|---|
| F1 | Lowercase label | Use sentence case. Preserve proper names, acronyms, filenames and exact control labels | [GOV.UK][az] · [Polaris][gram] |
| F2 | Unclear or repetitive heading | State the main fact in familiar words. A short phrase or full sentence is allowed, such as `Changes have not been saved`. Let the body add information | **Ours** |
| F3 | Over-long | Give each sentence one idea. Aim for 15 words; split sentences over 25 words. Keep notice bodies to two sentences without dropping necessary instructions | [GOV.UK][cl]; 15-word target and notice limit are **ours** |
| F4 | Cause displacing the action | Keep the consequence or broken constraint and next step in the body. Put a supporting cause in `detail` | **Ours**, informed by [Polaris][err] |
| F5 | Unperformable instruction | Name a place, a command, or the control beside it. Exempt: an instruction whose only action is to wait, provided the sentence names what it waits for | [GOV.UK][gerr] |
| F6 | Anthropomorphism | Never give a system perception, want or intent | **Ours** |
| F7 | Bare verb on a button | Name the action and object. `Save`, `Close`, `Cancel`, `Done` and `OK` may stand alone when unambiguous; never use `OK` to confirm removal | [GOV.UK][btn]; exception list is **ours** |
| F8 | Button does not match the sentence | Use the same verb and object for the final instruction and its button. The button performs that step only | **Ours** |
| F9 | Negative contraction | Write `cannot`, `did not`, `could not` | [GOV.UK][cl] (conflict 1) |
| F10 | Uppercase status | Use sentence case for statuses; preserve acronyms and proper names | [GOV.UK][tag] |
| F11 | Passive voice | Write active where the actor is the reader or a third party. The agentless passive stands where the actor is Maestro and naming it adds nothing | [GOV.UK][cl] |
| F12 | Two words for one concept | Use one word per concept, on every surface | [Polaris][dev] |
| F13 | "valid" / "invalid" | State the requirement and correction instead of `valid` or `invalid`, for example `Enter a repository URL` | [GOV.UK][gerr]; blanket word ban is **ours** |

Use direct instructions without `please`, `sorry` or an apology. Name the
problem in user language, without error codes or apm's raw prose. These are
Maestro conventions under ADR-0025 and `security.md`. Use descriptive link
text instead of `click here` ([GOV.UK][links]).

## The shape of a notice

- **Heading** states the main fact. For an offer, name what is available.
  Use a phrase or sentence, whichever makes the meaning clearer. Use a
  question only when the reader is being asked to make a choice.
- **Body** states the consequence or unmet requirement, then the next step.
  Omit facts already clear from the heading. Keep essential recovery steps
  here, even when they need more than 15 words.
- **Detail** is optional, one always-visible sentence giving the known cause
  or an alternative recovery. A call-site `detail` replaces the table's.
  Let it wrap; line count depends on width and text size.
- **Action** is optional, at most one under ADR-0025. Name what the button
  actually does, including when it only opens a dialog.

For recovery with prerequisites, state them in order before the button's
step. Name the location or exact command for work outside Maestro. Never
imply that the button performs those manual steps ([Microsoft][steps]).
When no recovery is available, state the known limit or cause and stop.
Only ask the reader to wait when work is actually continuing.

## Rules per surface

| Surface | Write and review |
|---|---|
| Accessible name | Include the visible label's words in the same order, preferably first. Add context only when needed, such as `Remove skill tdd`. Name icon-only controls by their action and landmarks by their content. Put long explanations in descriptions ([W3C][a11y]). |
| Empty state | Distinguish first use, no search matches, and no filter matches. Name what is absent and an available next step. Failed or unknown data is not empty (`CONTEXT.md`). |
| Loading state | Use `Loading {thing}…` for retrieval. Name other work accurately, such as `Deploying skill…`. State duration or progress only when known. |
| Success and status | State the verified outcome. Started, pending, completed and partly completed are different states. Use sentence case and words that carry meaning without colour ([GOV.UK][tag]). |
| Control reference | Use the visible label exactly. Identify controls by name rather than position, colour or input device ([Microsoft][steps]). |
| Field label and hint | Keep the label visible, sentence case, without a colon. Put requirements and examples in nearby hint text before entry. Use a short hint without a final full stop. A placeholder replaces neither label nor hint ([GOV.UK][input]). |
| Field error | Name the field's unmet requirement and how to correct it. Use a service notice for a service failure; do not ask the reader to fix correct input ([GOV.UK][gerr]). |
| Confirmation | State the affected object, scope and consequence before the action. Say whether recovery is possible only when verified. Use the specific action label, such as `Remove skill`, with `Cancel` ([GOV.UK][btn], Maestro convention). |

### Examples

These illustrate wording; use them only when the behavior and controls match.

| Situation | Avoid | Use |
|---|---|---|
| Read failure with a reload action | `Something went wrong. Try again.` | Heading: `Skills not read`. Body and button: `Reload the page`. |
| Search returned no matches | `No skills yet` | `No matching skills`. `Change your search terms`. |
| A save is still running | `Saved` | `Saving changes…` |
| Field requires a URL | `Invalid input` | `Enter a repository URL` |
| Button opens release planning | `Publish release` | `Plan release` |
| Save failed, cause unknown, retry available | `Change persistence failure` | Heading: `Changes have not been saved`. Body: `Save changes again`. Button: `Save changes`. |
| A manual command is required | `Run the command` | Name the app to open, the folder to use and the exact command. Explain what the command does before asking the reader to run it. |

## Terms

- Use the screen name from `CONTEXT.md` → **Screen names**. One concept keeps
  one screen name on every surface.
- Keep terms the reader needs in their own tools. Put exact APM terminology
  in `detail`; keep a filename in the body when the instruction acts on that
  file (ADR-0025).
- A translated verb decides its noun form too; record both in `CONTEXT.md`.
- Explain unfamiliar terms on first use, including terms inherited from git,
  the terminal and APM. For example, explain a repository as a project folder
  whose changes are tracked with git ([GOV.UK][cl]).
- Name Maestro as the actor where Maestro acted; never write `we`
  ([GOV.UK][tone], conflict 7).

## Where copy lives

- Every user-facing sentence lives in `packages/web`, in its feature's copy
  module. Error rows carry the heading, body, `detail` and action label together.
- The server sends the error code and the HTTP status, never a sentence. The
  eight request-shape messages are the only exception.
- Reuse copy for the same meaning and behavior. Matching words alone do not
  make two messages the same. Keep dynamic messages complete; check zero, one,
  many and long names rather than joining sentence fragments (Maestro convention).

## Reviewer's checklist

Run this over every new or changed user-facing string, on the unit above.

1. Read the whole interaction as someone without technical training. Using
   only the visible text, answer: what happened, what does it mean for this
   task, and what can I do next? If an answer requires unexplained jargon or
   a guessed step, rewrite the text. For a state needing no action, do not
   invent one. This check takes priority over shortening or grammatical form.
2. Confirm that heading, body and detail each add information. Split long
   sentences without dropping prerequisites, consequences or recovery.
3. Follow the instruction using only the named place, command or control.
   Confirm that the button performs the promised step.
4. Check that empty, unknown, failed, pending and completed states are distinct.
   Verify every claim about causes, timing, scope and reversibility.
5. Compare accessible names with visible labels. Check field requirements,
   error corrections, counts and long dynamic values.
6. For UI changes, inspect the rendered result at narrow widths and 200% zoom
   as part of `design.md`'s browser check. Essential text must remain readable.

## Sources

Live GOV.UK, Shopify and W3C guidance checked on 2026-09-06. Archived Polaris
links retain the original rationale; they are historical references. The
research file records the 2026-08-21 review, not a current copy of each source.
GOV.UK remains the language anchor, Polaris the product-pattern anchor under
ADR-0025. W3C supplies the accessible-name requirement.

[cl]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
[az]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/
[tone]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/
[gerr]: https://design-system.service.gov.uk/components/error-message/
[btn]: https://design-system.service.gov.uk/components/button/
[tag]: https://design-system.service.gov.uk/components/tag/
[input]: https://design-system.service.gov.uk/components/text-input/
[gram]: https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx
[err]: https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx
[dev]: https://shopify.dev/docs/apps/design/content
[links]: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/
[a11y]: https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
[steps]: https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions
