# 969 — Is linting in-product UI copy common practice?

Answers issue #969. Read **2026-10-02** against first-party sources only:
official docs, lint configs and rule sources in the orgs' own repos, tool
READMEs, and the orgs' own engineering blogs. Quotes were read on the cited
page or file. **[inferred]** marks my reading, not a source's statement. The
question is judged against ADR-0025 (copy enforcement is review-only; word bans
and length limits dropped 2026-09-08) and `.claude/rules/copy.md`.

## Verdict

- **Docs prose linting is common; UI-wording linting is not.** Every org
  checked that lints prose with Vale scopes it to documentation files. No org
  checked runs a style linter over its UI strings' wording, except Mozilla.
- **The common in-product lint is *externalization*, not wording.** GitLab,
  Grafana, Kibana, Shopify and VS Code fail or warn when a string is not wrapped
  for translation. They do not check what the string says.
- **The one wording-adjacent UI lint found is Mozilla's `fluent-lint`.** It
  checks typography and hard-coded brand names in Firefox's `.ftl` UI
  strings. It does not check clarity or tone.
- **UI wording is reviewed by people.** GitLab requires a technical writer to
  review every UI text change. Mozilla's l10n team reviews new en-US strings.

## 1. Who does it, and on what

| Org | Docs prose | In-product UI strings | Blocking? |
|---|---|---|---|
| GitLab | Vale on `doc/*.md` only ([`.vale.ini`](https://gitlab.com/gitlab-org/gitlab/-/blob/master/.vale.ini) has one `[*.md]` section; [`lefthook.yml`](https://gitlab.com/gitlab-org/gitlab/-/blob/master/lefthook.yml) globs `doc/*.md`) | ESLint [`require-i18n-strings`](https://gitlab.com/gitlab-org/frontend/eslint-plugin/-/blob/main/docs/rules/require-i18n-strings.md) / [`vue-require-i18n-strings`](https://gitlab.com/gitlab-org/frontend/eslint-plugin/-/blob/main/docs/rules/vue-require-i18n-strings.md): "Detect a string which has been hard coded and requires externalization." [`gettext:lint`](https://docs.gitlab.com/development/i18n/externalization/) checks PO syntax, variables and angle brackets. Wording: "all changes and additions to text in the UI must be reviewed by the technical writer" ([workflow](https://docs.gitlab.com/development/documentation/workflow/)) | Vale `error` fails CI; `warning` shows in the MR diff only; `suggestion` shows nowhere in CI ([Vale tests](https://docs.gitlab.com/development/documentation/testing/vale/)) |
| Mozilla (Firefox) | — | [`fluent-lint`](https://firefox-source-docs.mozilla.org/code-quality/lint/linters/fluent-lint.html) on `.ftl` UI strings: straight `'`/`"` → curly quotes (TE01–TE04), `...` → `…` (TE05), hard-coded brand names (CO01), ID and comment format ([source](https://github.com/mozilla-firefox/firefox/blob/main/tools/lint/fluent-lint/__init__.py)). [`moz-l10n-lint`](https://firefox-source-docs.mozilla.org/code-quality/lint/linters/l10n.html) checks parsing, duplicates and ID reuse | Runs as the `text(fluent)` CI job; the docs do not say whether it blocks. l10n warnings "are not making the build fail" |
| Microsoft (VS Code) | Writing Style Guide: no tool named | [`code-no-unexternalized-strings`](https://github.com/microsoft/vscode/blob/main/.eslint-plugin-local/code-no-unexternalized-strings.ts) (externalization, key format, duplicate keys) and [`code-no-icons-in-localized-strings`](https://github.com/microsoft/vscode/blob/main/.eslint-plugin-local/code-no-icons-in-localized-strings.ts) (`$(icon)` syntax inside localized text) | Both `'warn'` in [`eslint.config.js`](https://github.com/microsoft/vscode/blob/main/eslint.config.js) |
| Google | [Developer docs style guide](https://developers.google.com/style): "This guide contains guidelines, not rules." No linter named | None found | — |
| Shopify Polaris | — | [Stylelint Polaris](https://github.com/Shopify/polaris/tree/main/stylelint-polaris) checks CSS, not copy. Shopify's [`jsx-no-hardcoded-content`](https://github.com/Shopify/web-configs/blob/main/packages/eslint-plugin/docs/rules/jsx-no-hardcoded-content.md) flags literal JSX content (externalization). No prose linter at the Polaris repo root | — |
| GOV.UK | [`tech-docs-linter`](https://github.com/alphagov/tech-docs-linter): Vale rules for the technical writing style guide (sentences over 25 words, headings, words to avoid) | None found in a code search of `alphagov` for Vale, textlint, alex or write-good outside tech docs | Per-rule levels |
| Atlassian | — | [`@atlaskit/eslint-plugin-design-system`](https://www.npmjs.com/package/@atlaskit/eslint-plugin-design-system) v16.13.4: 84 rules; text-related ones check that a label *exists* (`no-empty-icon-button-label`, `use-modal-title`, `use-popup-label`), never its wording | — |
| Datadog | [`datadog-vale`](https://github.com/DataDog/datadog-vale) on docs Markdown/HTML; the [engineering blog](https://www.datadoghq.com/blog/engineering/how-we-use-vale-to-improve-our-documentation-editing-process/) reports automated PR comments | None found | Not stated |
| Elastic | [`vale-rules`](https://github.com/elastic/vale-rules): "automating style guide checks in docs-as-code environments" | Kibana [`strings_should_be_translated_with_i18n`](https://github.com/elastic/kibana/blob/main/packages/kbn-eslint-plugin-i18n/README.mdx) on `JSXText`, `label` and `aria-label` (externalization). [EUI plugin](https://github.com/elastic/eui/blob/main/packages/eslint-plugin/README.md): name and caption *presence* rules (`require-aria-label-for-modals`, `require-table-caption`) | Kibana rule "warns" |
| Grafana | [`vale-action`](https://github.com/grafana/writers-toolkit/blob/main/vale-action/action.yml) on `docs/sources/**/*.md`; `fail_on_error` defaults to `"false"`; a PR body with `<!-- vale = NO -->` skips it | [`@grafana/i18n/no-untranslated-strings`](https://github.com/grafana/grafana/blob/main/eslint.config.js) (externalization) | i18n rule `'error'`; Vale advisory by default |
| Red Hat | [`vale-at-red-hat`](https://github.com/redhat-documentation/vale-at-red-hat): "linting Red Hat docs with Vale" | None found | Onboarding advice: report errors only |
| Adobe Spectrum | — | None found (searched 2026-10-02; unknown, not absent) | — |

## 2. Tools: what each can see in a React codebase

| Tool | Reads | Sees JSX text or TS string literals? |
|---|---|---|
| [Vale](https://docs.vale.sh/formats/code) | Markup, plain text; in code "Vale lints the comments in source code" | Not by default. A [tree-sitter View](https://docs.vale.sh/topics/views) runs custom queries over TypeScript source, so a query could capture string literals **[inferred: not shown in the docs for strings]**. A `dasel` View reads JSON/YAML values (fits locale files) |
| [alex](https://github.com/get-alex/alex) | "plain text, HTML, MDX, or markdown" | No; insensitive-wording checks only |
| [write-good](https://github.com/btford/write-good) | A string passed to its API ("Naive linter for English prose") | Only if a script feeds it the strings |
| [textlint](https://github.com/textlint/textlint) | Markdown and text; HTML, rST, AsciiDoc via plugins | No JSX or TS processor in its supported list |
| [retext](https://github.com/retextjs/retext) | Natural-language syntax trees | Only via a custom script that extracts strings |
| [eslint-plugin-i18next `no-literal-string`](https://github.com/edvardchen/eslint-plugin-i18next) | JSX | Yes: flags "plain text in JSX markup" that is not translated. Checks location, not wording |
| [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) | JSX | Yes, two small wording rules: [`img-redundant-alt`](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/img-redundant-alt.md) (alt contains image/photo/picture; recommended) and [`anchor-ambiguous-text`](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/anchor-ambiguous-text.md) (exact "click here", "here", "link", "a link", "learn more"; not in recommended). Biome's [`noRedundantAlt`](https://biomejs.dev/linter/rules/no-redundant-alt/) is the recommended port |
| Custom check (Mozilla `fluent-lint`, VS Code local rules) | The org's own string format | Yes: regexes over each string. The only form that checks UI wording mechanically |

## 3. Mechanical vs judgment

What the tools check, in every case found:

- **Typography:** curly quotes, `…` for `...` (Mozilla TE01–TE05); non-standard
  spaces, dashes and quotes (GitLab `NonStandardSpaces` = error,
  `NonStandardQuotes` = warning, in [`doc/.vale/gitlab_base`](https://gitlab.com/gitlab-org/gitlab/-/tree/master/doc/.vale/gitlab_base)).
- **Names and banned terms:** hard-coded brand names (Mozilla CO01);
  `Substitutions` "misused terms that should never be used at GitLab" and
  `Possessive` "GitLab should not be used in the possessive form" (both `error`).
- **String placement:** externalized or not (GitLab, Grafana, Kibana,
  Shopify, VS Code); label present or not (Atlassian, EUI).

What stays with people or drops to `suggestion`:

- GitLab sets `ReadingLevel`, `SentenceLength` and `Wordy` to `suggestion`, the
  level that shows in no CI output. Its rule for choosing a level: "If the rule
  is too subjective, it cannot be adequately enforced and creates unnecessary
  additional warnings" ([Vale tests](https://docs.gitlab.com/development/documentation/testing/vale/)).
- GitLab's UI text wording goes to a technical writer, not Vale ([workflow](https://docs.gitlab.com/development/documentation/workflow/)).
- Mozilla's en-US string review finds unclear strings "by translating the
  strings, only having the string and comment as context" ([review](https://mozilla-l10n.github.io/documentation/products/firefox_desktop/review.html)).
- Google: "Depart from it when doing so improves your content" ([style guide](https://developers.google.com/style)).

## 4. Costs reported

- **Noise.** GitLab: "we should be mindful of the effort to create and enforce
  a Vale rule, and the noise it creates." A new `error` rule requires fixing all
  existing hits first; otherwise it starts as `warning`.
- **Non-blocking levels are not shown.** Vale: "`error`-level alerts will
  result in a non-zero exit code, while `warning`- and `suggestion`-level alerts
  will not" ([MinAlertLevel](https://docs.vale.sh/keys/minalertlevel)). GitLab
  shows `suggestion` nowhere in CI. Red Hat: "Report only *errors*. Don't report
  *warnings* and *suggestions*" ([onboarding](https://github.com/redhat-documentation/vale-at-red-hat/blob/main/docs/modules/defining-a-vale-onboarding-strategy.adoc)).
- **False positives.** Red Hat: tested "on a corpus of 113000 words. You can
  expect false positives when applying the style to a new corpus." Mozilla
  makes uncertain checks warnings "when we're not completely sure that the
  string contains critical issues (false positives)", and localizers "can save
  a translation anyway" ([Pontoon](https://blog.mozilla.org/l10n/2018/05/08/making-it-hard-to-break-firefox-from-pontoon/)).
  GitLab: a false positive can sometimes be dodged "by tweaking the formatting
  around the change."
- **Suppression comments.** GitLab `<!-- vale off -->`; Grafana docs carry
  per-rule `<!-- vale Grafana.Spelling = NO -->` pairs (for example
  [`mssql/_index.md`](https://github.com/grafana/grafana/blob/main/docs/sources/datasources/mssql/_index.md))
  and a whole-PR opt-out. Mozilla keeps a 203-line [`exclusions.yml`](https://github.com/mozilla-firefox/firefox/blob/main/tools/lint/fluent-lint/exclusions.yml),
  with "it should _not_ be necessary to add new exclusions."
- **Upkeep.** Datadog: "we regularly fine tune the configuration of our
  rules." Red Hat: "Embracing a linter in a project is a long journey."

## 5. Small-team relevance

- **No source measures payoff below docs-team scale.** None found.
- The adopters are large: Datadog reports a 200-developer-to-1-writer ratio and
  20,000+ merged PRs a year ([blog](https://www.datadoghq.com/blog/engineering/how-we-use-vale-to-improve-our-documentation-editing-process/)).
  GitLab maintains 52 + 17 Vale rule files in [`gitlab_base`](https://gitlab.com/gitlab-org/gitlab/-/tree/master/doc/.vale/gitlab_base)
  and `gitlab_docs`.
- **[inferred]** Each linter in section 1 has a reason that does not apply to
  a solo, English-only product: many outside contributors, translators or a
  writer bottleneck. Mozilla's quote and brand checks exist because localizers
  copy the en-US string.
- PostHog (docs, not UI): "LLMs can generate drafts and reviews, but they are
  not reliable linters. They're slow and expensive compared to deterministic
  tools" ([handbook](https://posthog.com/handbook/wizard-and-docs/vale)).

## 6. Measured against Maestro's own copy

Strings were extracted with the TypeScript parser from shipped files in
`packages/web/src` and `packages/server/src` on 2026-10-02: 4,186 literals,
about 1,223 of them copy (heuristic, roughly 90% precision on a hand sample).

**Candidate checks:**

| Check | Real defects | False positives or judgment calls |
|---|---|---|
| Retired screen words from `GLOSSARY.md`, single-meaning only | 7 (4× "Inventory source screen", 2× "refresh … Inventory", "Holds primitives") | 0 on strings that ship. A plain grep gives 60 for `Press\|Click\|Tap` alone, all in code and comments |
| `Press`/`Click` instead of `Select` | 0 today (about 20 before #860) | 0 |
| `…` instead of `...` | 0 | 0; busy labels are already pinned by a test |
| Blocked-control cause, five words or fewer | 0 | Causes built at runtime are invisible to a source scan |
| Status chip: two to four words, no verb | 0 | 11 of 37 chips flagged by word count, 22 by an -ed/-ing rule; all approved forms |
| Empty state `No {things} yet` | 0 | 1 judgment; filter-empty messages would all fire |
| Dialog title verb equals confirm verb | 0 | 8 of 13 titles are built by functions |
| `Select X` names an existing control | 0 | 0; misses a control that exists on another surface |
| Multi-meaning words (`install`, `pinned`, "Reload the page", "Could not read") | 3 by hand | Most hits are correct uses |

**Missed defects.** 21 copy defects were fixed after they shipped (#845,
#848, #850, #857, #860, #867, #889 and direct fixes). 8 were mechanical,
all retired or forbidden words. 13 needed a reader: copy that disagreed with
behaviour or with the screen. All 11 live defects found were already pinned
as approved strings by the exact-string tests.

**Enforcement points.** A source scan in `pnpm lint` sees every literal
(including inline JSX and server messages) but not text built at runtime.
Sibling-test assertions see built text but only inside copy modules (about
63% of web copy). A CI-only step sees nothing that lint and tests do not.

## What this means for Maestro

- No org lints UI copy for clarity, tone, length or comprehension. ADR-0025
  keeps those judgments in review, as GitLab and Mozilla do.
- Maestro's one recurring mechanical defect is a retired screen word that
  survives a rename. A check scoped to shipped strings finds it with no
  false positives, so it can block without suppressions.
- Form and style checks fire mostly on approved copy. They stay with review.
- **Decision (2026-10-02):** one blocking check for retired screen words in
  `pnpm lint`; everything else stays review-only. ADR-0025 records it.
