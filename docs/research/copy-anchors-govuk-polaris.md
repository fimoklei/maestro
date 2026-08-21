# What GOV.UK and Polaris actually prescribe

Raw material for `.claude/rules/copy.md` — not the rules file itself. Every
rule below is one imperative line with the page it came from. Read against
first-party sources only, fetched **2026-08-21**.

Rules marked **[inferred]** were not read as a rule on any page; they are my
reading of examples or of two rules put together. Everything else is stated on
the cited page.

## Where the sources actually live now

Both anchor URLs in the issue are dead redirects. This matters for citation, so
it is recorded rather than quietly worked around.

- `https://www.gov.uk/guidance/style-guide` → **301** to
  [guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/).
  The prose rules (plain English, active voice, tone, headings) sit under
  [writing-guidelines/](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/),
  not in the A-to-Z.
- `https://polaris.shopify.com/content` → **301** to
  [shopify.dev/docs/api/polaris](https://shopify.dev/docs/api/polaris), which is
  a component-API index with no content guidance. The whole
  `polaris.shopify.com` content section is retired; `legacy.polaris.shopify.com`
  no longer resolves in DNS. The only surviving first-party text is Shopify's
  own source markdown in
  [Shopify/polaris-react-archive](https://github.com/Shopify/polaris-react-archive/tree/main/polaris.shopify.com/content/content)
  (repo archived 2026-01-06). That is what is cited below. `actionable-language.mdx`
  was deleted from `main`, so it is cited at its last living commit.
- The one still-live first-party Polaris content page is
  [shopify.dev/docs/apps/design/content](https://shopify.dev/docs/apps/design/content),
  a short summary for app developers. It is used where it repeats a rule.

**Consequence for Maestro: GOV.UK is a maintained source, Polaris is a frozen
one.** That is the tie-breaker behind several recommendations in section 6.

---

## 1. Sentence shape

**GOV.UK**

- Write in plain English — it is mandatory, not a preference. [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Use the active voice, never the passive ("You need an electronic travel authorisation", not "An electronic travel authorisation is needed"). [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Split any sentence over 25 words. [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Keep a paragraph to at most 5 sentences. [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Choose the shorter word ("buy" not "purchase", "help" not "assist", "about" not "approximately"). [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Use positive contractions like "you'll"; avoid negative contractions like "can't" and "don't". [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Use sentence case everywhere, including page titles and service names. [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)
- Write a field label short, direct and in sentence case, with no colon. [text input](https://design-system.service.gov.uk/components/text-input/)
- Keep hint text to a single short sentence with no full stop. [text input](https://design-system.service.gov.uk/components/text-input/)
- **[inferred]** Allow a full sentence wherever the string is prose (hint, body, error); keep labels and buttons to fragments — GOV.UK never states a fragment/sentence rule, it only demonstrates it through label, hint and button examples. [text input](https://design-system.service.gov.uk/components/text-input/), [button](https://design-system.service.gov.uk/components/button/)

**Polaris**

- Weigh every word — each word and period adds noise to the experience. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- Find the shortest, clearest way to give only the info needed to take action. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- Skip punctuation, except for questions or text of 2+ sentences. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- Do not use periods in interface copy; add them only once the text runs to 2 or more sentences. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Use plain language and aim at a 7th-grade reading level. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx) · restated as "a United States grade 7 reading level" on [shopify.dev](https://shopify.dev/docs/apps/design/content)
- Use contractions, including negative ones ("can't", "doesn't"). [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Start sentences with an imperative verb when telling someone what they can do. [actionable language](https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx)
- Never use permissive phrasing like "you can"; write "add apps", not "you can add apps". [actionable language](https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx), [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- Use sentence case for headings, subheadings, buttons and card titles. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Avoid question marks; reword into an affirmative statement unless the answer is genuinely unknown. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Do not use ampersands; spell out "and". [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Bold only where strong emphasis is required, never to fake a heading. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Read the string out loud; if a human would not say it, rewrite it. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- **[inferred]** Treat a string as allowed to be a full sentence only once it needs 2+ sentences or asks a question — Polaris states the punctuation threshold, not a sentence-shape rule; the shape follows from it. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)

## 2. Errors

**GOV.UK — what is required**

- Describe what has happened and tell the user how to fix it. [error message](https://design-system.service.gov.uk/components/error-message/)
- Be specific; never write "An error occurred", "Answer the question" or "This field is required". [error message](https://design-system.service.gov.uk/components/error-message/)
- Write the message as an instruction when the field is empty ("Enter your first name"). [error message](https://design-system.service.gov.uk/components/error-message/)
- Write the message as a description when a constraint is broken ("Name must be 35 characters or less"). [error message](https://design-system.service.gov.uk/components/error-message/)
- Echo the label's wording in the error ("How many hours do you work a week?" → "Enter how many hours you work a week"). [error message](https://design-system.service.gov.uk/components/error-message/)
- Word the summary entry and the inline message identically. [error summary](https://design-system.service.gov.uk/components/error-summary/), [error message](https://design-system.service.gov.uk/components/error-message/)
- Show an error summary whenever validation fails, even for a single error, headed "There is a problem". [error summary](https://design-system.service.gov.uk/components/error-summary/)
- Put the summary at the top of the main content, above the `<h1>`, and move focus to it. [error summary](https://design-system.service.gov.uk/components/error-summary/)
- Link each summary entry to the field it is about (first erroring field for a multi-field input). [error summary](https://design-system.service.gov.uk/components/error-summary/)
- Prefix the page title with "Error: " so screen readers announce it. [error summary](https://design-system.service.gov.uk/components/error-summary/)
- Put the inline message after the label and hint, with a red border tying it to the field. [error message](https://design-system.service.gov.uk/components/error-message/)

**GOV.UK — what is banned**

- Never use technical jargon or error codes ("form post error", "unspecified error"). [error message](https://design-system.service.gov.uk/components/error-message/)
- Never use "forbidden", "illegal", "prohibited" or "you forgot". [error message](https://design-system.service.gov.uk/components/error-message/)
- Never write "please" — it implies the fix is optional. [error message](https://design-system.service.gov.uk/components/error-message/)
- Never write "sorry" — it does not help fix the problem. [error message](https://design-system.service.gov.uk/components/error-message/)
- Never write "valid" or "invalid" — they add nothing. [error message](https://design-system.service.gov.uk/components/error-message/)
- Never use humorous or informal language like "oops". [error message](https://design-system.service.gov.uk/components/error-message/)

**Polaris — anatomy (which parts are optional is stated outright)**

- Heading: **optional** — state the effect of the error on the reader and command attention. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Body: **required** — state the effect if there is no heading, explain how to fix it, link to help docs. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Call to action: **optional** — offer a one-step solution or take the reader somewhere built to fix it. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Explain what happened behind the scenes **only** when it helps the reader or when no solution can be offered — so "why" is the optional part. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Be specific: use exact numbers, dates, or the reader's own data. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Avoid error jargon like "invalid". [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Do not over-apologise, and do not bring "we"/"us" in unless the product caused the problem. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Place the error close to what needs fixing. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Use red only for what must be dealt with immediately to avoid harm; use yellow for workflow errors and warnings. [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Give a fallback a next step ("Something went wrong. Refresh your browser to try again.", not "Sorry, something went wrong. Learn more."). [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- Keep banner body content to 1–2 sentences and do not repeat the heading. [banner](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/feedback-indicators/banner.mdx)
- Explain how to resolve the issue in the body of every warning and critical banner. [banner](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/feedback-indicators/banner.mdx)
- Summarise multiple errors as an instruction with a count ("To save this product, make 2 changes:"), not as a tally ("There are 2 errors on this page."). [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)

## 3. Buttons and actions

**GOV.UK**

- Write button text in sentence case, describing the action it performs. [button](https://design-system.service.gov.uk/components/button/)
- Make the label match what actually happens; do not fall back on a generic "Submit". [button](https://design-system.service.gov.uk/components/button/)
- Distinguish "Continue" (nothing saved) from "Save and continue" (data saved) from "Save and come back later" (resumable). [button](https://design-system.service.gov.uk/components/button/)
- Use the established label for the established job: "Start now", "Sign in", "Sign out", "Pay", "Add another", "Confirm and send", "Accept and send". [button](https://design-system.service.gov.uk/components/button/)
- Extend the label with a noun when the bare verb is ambiguous ("Add another address"). [button](https://design-system.service.gov.uk/components/button/)
- Start a heading with a verb where possible ("Apply for a driving licence"). [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)
- Make link text descriptive and frontloaded; avoid generic text like "click here" or "more". [add links](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/)
- Start link text with a verb when the link starts a task; use the information's own words when it does not. [add links](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/)
- Never reuse the same link text for two different destinations. [add links](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/add-links/)

**Polaris**

- Lead with a strong, actionable verb. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx), [shopify.dev](https://shopify.dev/docs/apps/design/content)
- Use the {verb} + {noun} formula, except for common actions like Save, Close, Cancel, Done or OK. [actionable language](https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx)
- Never mislabel a button — the reader must be able to predict what happens ("Buy shipping label", not "Buy"). [banner](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/feedback-indicators/banner.mdx), [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Name the real action, not an invitation to it ("Activate Apple Pay", not "Try Apple Pay"). [actionable language](https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx)
- Write button text in sentence case. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Use no articles and no punctuation in a button label ("Add menu item", not "Add a menu item"). [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Drop the verb when the button itself already conveys it — "View", "Go", "Read" are often unnecessary. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Reserve a destructive (red) button for an action that is hard or impossible to undo. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Allow at most one primary action per banner or empty state. [banner](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/feedback-indicators/banner.mdx), [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Use a button for an action and a link for navigation; do not swap them. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx)
- Make link text set the expectation of where it leads ("Order #001", not "Order"). [banner](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/feedback-indicators/banner.mdx)
- Never use "click here" or "here" as link text, and keep at most one "learn more" link per screen. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- **[inferred]** Make a button label repeat the verb of the sentence that promised it — both guides forbid mislabelling and require a predictable label, but neither states the surrounding-sentence match as a rule. [button](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/actions/button.mdx), [button (GOV.UK)](https://design-system.service.gov.uk/components/button/)

## 4. Empty states, headings, status text

**Headings — GOV.UK**

- Frontload the heading: most important information first. [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)
- Make headings descriptive; never use a generic heading like "Introduction". [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)
- Do not write headings as questions — users want answers, not questions. [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)
- Do not put an unexplained technical term in a heading. [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)
- Keep the content readable with the headings removed. [clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)

**Headings — Polaris**

- Keep a heading to a single sentence, in sentence case, with no periods, commas or semicolons. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Make the heading say what the reader will find in the section below. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Drop articles in labels, titles and microcopy ("Create collection"). [actionable language](https://github.com/Shopify/polaris-react-archive/blob/16421c4cd798cdfaf20b72f3cdfc84a767db901f/polaris.shopify.com/content/content/actionable-language.mdx)
- Keep articles in conversational headings — home cards, sell pages and empty states ("Secure your account with two-step authentication"). [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)

**Empty states — Polaris only**

- Explain the benefit and utility of the feature, not just its name. [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Write an action-oriented title ("Create orders and send invoices", not "Orders and invoices"). [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Use the subtitle to describe or explain the title, conversationally, with articles. [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Spell out the steps needed to activate the feature. [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Never make the reader feel unsuccessful or guilty for not having used the feature. [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- Focus on a few key features, not the whole surface. [empty state](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/components/layout-and-structure/empty-state.mdx)
- **GOV.UK prescribes nothing for empty states** — the Design System has no empty-state component and the style guide never mentions one. Verified by reading all 35 components on [the component index](https://design-system.service.gov.uk/components/) — none is an empty state, and the closest neighbours (Panel, Notification banner, Inset text) carry no empty-state guidance.

**Status text**

- Name a status with an adjective, never a verb — a verb makes it look clickable. [tag (GOV.UK)](https://design-system.service.gov.uk/components/tag/)
- Start with the smallest set of statuses that works and add more only on research evidence. [tag (GOV.UK)](https://design-system.service.gov.uk/components/tag/)
- Never carry the meaning in colour alone. [tag (GOV.UK)](https://design-system.service.gov.uk/components/tag/)
- Do not set status text in uppercase — it is harder to read at length. [tag (GOV.UK)](https://design-system.service.gov.uk/components/tag/)
- Use colour and iconography together to signal severity. [error messages (Polaris)](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- **[inferred]** Write status text in sentence case — GOV.UK shows "Completed"/"Active"/"Inactive" as examples and states the sentence-case rule globally, but the tag page never states it. [tag](https://design-system.service.gov.uk/components/tag/), [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)

**Help/hint text**

- Use hint text for what is relevant to most users: how the information is used, or where to find it. [text input (GOV.UK)](https://design-system.service.gov.uk/components/text-input/)
- Keep hint text to one short sentence with no full stop, and put no links in it. [text input (GOV.UK)](https://design-system.service.gov.uk/components/text-input/)
- Never replace a label with placeholder text. [text input (GOV.UK)](https://design-system.service.gov.uk/components/text-input/)
- Add help text only when the label does not already explain the field. [text fields (Polaris)](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/patterns-legacy/text-fields.mdx)
- Never repeat the field label in the help text. [text fields (Polaris)](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/patterns-legacy/text-fields.mdx)
- When there is only room for one, show the example rather than the instruction. [text fields (Polaris)](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/patterns-legacy/text-fields.mdx)
- Give the reader enough to decide on their own. [shopify.dev](https://shopify.dev/docs/apps/design/content)

## 5. Jargon and system voice

**GOV.UK**

- Avoid buzzwords and jargon. [clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/)
- Use a technical term where you need one — a technical term is not jargon — and explain it the first time. [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)
- Expand an abbreviation in full on first use on the page; well-known ones (BBC, NHS, UK) are exempt. [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)
- Address the reader as "you". [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/)
- Use the full name of the organisation before you ever use "we". [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/)
- Keep the tone "brisk, but not terse" and "serious but not pompous". [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/)
- Do not sound like a faceless machine, and do not add emotion or spin with subjective adjectives. [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/)
- Drop "please" and "please note". [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/), [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)
- Use sentence case for a service name; do not capitalise a verb-led service name in a sentence. [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)

**Polaris**

- Some jargon is fine, as long as it is what the reader actually says. [fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)
- Use one noun, verb or phrase per concept and never vary it. [shopify.dev](https://shopify.dev/docs/apps/design/content)
- Always refer to the reader as "you"; never speak for them with "I" or "my", except when they are consenting or granting permission. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Refer to the product as "we", and keep the product out of the sentence unless a human is taking the action. [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Name the app or company in full on first reference; "we" is allowed after that. [shopify.dev](https://shopify.dev/docs/apps/design/content)
- Capitalise product names that are unique to the product; lowercase generic feature terms ("blogs", "navigation", "admin", "page"). [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- Say what happened to the reader, not what the system did internally ("Couldn't deposit payout", not "Invalid bank account"). [error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)
- **[inferred]** Neither guide has a rule against anthropomorphising the system ("the server answers"). GOV.UK's nearest statement is the active-voice rule plus "don't sound like a faceless machine"; Polaris's nearest is keeping the product out of the sentence. Verified by absence across both style guides and the Polaris content set. [right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/), [grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)
- **[inferred]** Neither guide sanctions third-person product voice ("Maestro cannot read…"). Polaris's "we" rule forbids it outright; GOV.UK's "we" rule permits it only after the full name has been established. Recommendation in section 6.

## 6. Where the two anchors conflict

Seven real conflicts. For each: the winner for Maestro and why. The standing
tie-breakers are (a) GOV.UK is maintained and Polaris is frozen, and (b)
Maestro's reader is a developer steering an agent setup, not a shopkeeper.

**1. Negative contractions.** GOV.UK bans "can't"/"don't"
([clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/));
Polaris requires them
([grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)).
→ **GOV.UK wins.** A negation the reader misses in an error message is the
expensive kind of misread; "cannot" costs three characters.

**2. Terminal punctuation.** GOV.UK writes body copy as ordinary sentences with
full stops and only exempts hint text
([text input](https://design-system.service.gov.uk/components/text-input/));
Polaris bans periods in interface copy below 2 sentences
([grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)).
→ **Polaris wins for single-line UI strings, GOV.UK for prose.** Maestro's
cockpit is mostly single-line strings; the split is what both guides actually
practise.

**3. Jargon.** GOV.UK: avoid jargon, explain any technical term on first use
([A to Z](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/));
Polaris: some jargon is fine if the audience says it
([fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)).
→ **Polaris wins.** "Lockfile", "pin", "manifest" and "drift" are the reader's
own vocabulary; expanding them each time would be noise. GOV.UK's first-use
explanation still applies to anything Maestro invented rather than inherited.

**4. Reading level.** GOV.UK gives a mechanical limit (split over 25 words, max
5 sentences per paragraph)
([clear-language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/));
Polaris gives a target (7th-grade)
([fundamentals](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/fundamentals.mdx)).
→ **GOV.UK wins.** A word count is checkable in review; a grade level is not.

**5. Question marks.** GOV.UK ships question-shaped field labels ("How many
hours do you work a week?")
([error message](https://design-system.service.gov.uk/components/error-message/));
Polaris says avoid question marks wherever possible
([grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx)),
and GOV.UK itself bans question headings
([clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/)).
→ **Polaris wins.** GOV.UK's question labels come from one-question-per-page
form journeys, which Maestro does not have.

**6. "Sorry" and blame.** GOV.UK bans "sorry" outright
([error message](https://design-system.service.gov.uk/components/error-message/));
Polaris says do not *over*-apologise and allows "we" when the product caused the
problem
([error messages](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/error-messages.mdx)).
→ **GOV.UK wins on "sorry", Polaris wins on ownership.** Never apologise; do
name the product as the cause when it is the cause.

**7. Product voice: "we" vs third person.** Polaris mandates "we" for the
product ([grammar and mechanics](https://github.com/Shopify/polaris-react-archive/blob/main/polaris.shopify.com/content/content/grammar-and-mechanics.mdx));
GOV.UK allows "we" only once the organisation has been named, and otherwise
prefers the named subject
([right tone](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/)).
→ **GOV.UK wins.** Maestro is a local tool, not a company speaking; "Maestro
cannot read the lockfile" names the actor, which "we can't read it" does not.
Both guides agree on the underlying rule — keep the product out of the sentence
unless it is the actor.

**Near-conflicts that are not conflicts:** both require sentence case; both ban
"click here"; both demand a label that matches the action; both ban "invalid";
both put the error next to what failed. Where only one guide speaks — empty
states (Polaris only), error summaries (GOV.UK only) — that guide simply wins by
default.
