---
target: the new experience delivered via spec 827
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/Users/dev/Projects/maestro/packages/web/src/harness/harness-view.tsx"
target_fingerprint: "sha256:c21950dcc5b3116c186af034b00162bfa989f32591d9cb991900b7b055722e9a"
target_path: /Users/dev/Projects/maestro/packages/web/src/harness/harness-view.tsx
timestamp: 2026-09-09T17-50-38Z
slug: packages-web-src-harness-harness-view-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

# Critique — Harness journey (spec #827)

Target: `packages/web/src/harness/harness-view.tsx` and its collaborators (`stage-table.tsx`, `stage-copy.ts`, `row-actions.ts`, `notice-copy.ts`, `withdraw-dialog.tsx`, `import-dialog.tsx`, `use-harness.ts`, `harness-view-model.ts`) plus the Inventory and status-bar changes. Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No `aria-live` anywhere in `stage-table.tsx` / `harness-view.tsx`; rows appear, change stage and disappear unannounced. The meta line refreshes silently. Inventory does this correctly (`bulk-deploy-report.tsx:48`). |
| 2 | Match system / real world | 3 | "proposal" and "pull request" alternate inside one row: `Withdraw proposal` closes `pull request #45`. |
| 3 | User control and freedom | 3 | Withdraw and Reopen are real ways back; `Multiple pull requests` offers a menu where every item is a link or disabled. |
| 4 | Consistency and standards | 2 | `Press` in every notice vs `Select` in every Detail sentence; chips carry no glyph against `DESIGN.md:303`; scroll container is not focusable while Inventory's is. |
| 5 | Error prevention | 3 | Blocked actions stay visible with their cause (`row-actions.ts:17`) — best in class. But `Propose change` pushes with no preview of the content. |
| 6 | Recognition rather than recall | 2 | "Also in Pending review and Pending release." is prose, not a link. |
| 7 | Flexibility and efficiency | 2 | Inventory has search, type filter and sortable headers; Harness has none. No keyboard path to a row. |
| 8 | Aesthetic and minimalist design | 3 | The `RELEASE_SUMMARIES` card restates in one sentence what the table below says with rows. A Detail cell can stack five blocks. |
| 9 | Error recovery | 3 | The notice table is the strongest code in this repo. But the `gh auth login` fix only appears after a failed mutation. |
| 10 | Help and documentation | 3 | No inline help and none needed; the Detail sentences carry it. Correct for a power user. |
| **Total** | | **26/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**Strongly specific in structure and language, generic-to-contradictory in visual signalling.**

The three stacked stage tables are not a generic "kanban of pull requests" — they are three different questions about the same artifact, and the implementation commits hard enough to let one skill hold three rows. The refusal to render a zero (`harness-view.tsx:287`) is a rare honest decision: a stage nobody could read keeps its heading and draws no card, no count, no rows. That is "Inspectable, not magical" enforced in control flow rather than asserted in a doc. `notice-copy.ts` is a typed exhaustive table where a new core error code fails typecheck until someone writes its sentence.

Strip the copy away, though, and what remains is a facts strip, a summary card, and three grey-bordered tables with a status chip and a `⋯` menu — the Linear/GitHub row-with-kebab pattern, unchanged. And where Maestro's own system had something to say, colour, this view contradicts it (issue 5).

**Deterministic scan:** `impeccable detect --json` over `harness/`, `inventory/` and `shell/` returned exit 0, 0 findings. The clean result was proved live (a probe stylesheet with `Inter` and bounce easing produced 2 findings), but it is weak evidence: a probe `.tsx` with inline `#ff0000` and `outline-none` also produced zero. The TSX pass is regex-based and covers neither inline colour nor focus suppression. No false positives to report.

**Browser evidence:** four screenshots at 1440px, 420px, 200% zoom and with keyboard focus. Provenance caveat: the smoke run was evicted mid-session by a `pnpm dev` from the same checkout, so the rendered code is this working tree but the data is the real `~/.maestro`. Two stage tables were visible, not three — Pending release was empty. Populating Pending review needs real GitHub pull requests and was not measured.

## Overall Impression

The language layer is exceptional and the state logic is more honest than almost anything in this category. What sits under it is not finished: the interaction the spec designed to orient the author (import, then highlight and focus the row) actively disorients them for exactly the skill that matters. The biggest opportunity is not more design — it is carrying the existing decisions through consistently: one verb, one chip grammar, one accessibility precedent.

## What's Working

1. **The unknown/zero distinction, made structural.** `journeyConfirmedEmpty` requires all three stages to have answered for themselves before "No changes yet" is allowed (`harness-view-model.ts:176`). Most products show a `0` and quietly lie.
2. **Blocked actions kept visible with their reason in the label.** `Withdraw proposal — no request yet` instead of removing the item. Removal teaches nothing; a disabled item with a five-word cause teaches the model and keeps the menu shape stable across states.
3. **Reassurance at the high-stakes moment.** Withdraw leads with consequences before facts: "This closes the pull request. Your local files and proposal branch remain unchanged." Deletion goes further: "Nobody loses the skill until the pull request is merged." Both name the exact branch and ref the confirmation is bound to.

## Priority Issues

### [P1] Focus and highlight are keyed on skill name, not on stage

`harness-view.tsx:372` builds one `actions` object and hands it to every `StageTable`. `StageTable` matches on `actions.focus === row.skill` (`stage-table.tsx:77,135`) — the name alone. The row label is correctly stage-qualified (`:133`), so the author knew rows collide; the focus and highlight keys were missed.

**Why it matters:** user story 9 of the spec is literally "one skill represented in every applicable stage". For that skill, one press paints three rows on the active surface at once and calls `.focus()` on three triggers in the same effect flush — the last mount wins, so the keyboard lands in Pending release, not the stage the press came from. The import highlight has the same defect.

**Fix:** make `focus` and `highlight` `{ stage, skill } | null` and compare both, exactly as the label already does.
**Suggested command:** `/impeccable harden`

### [P1] An unreadable stage is a dead end with no cause and no control

When a stage read fails, `harness-view.tsx:296` renders a heading with three words under it (`Review status unavailable`) — no card, no detail, no action. The cause and its fix already exist, written and tested: `"Sign in with gh auth login, then press Retry check."` (`notice-copy.ts:232`) — but that string is only reachable by attempting a mutation and being refused.

**Why it matters:** `copy.md` requires every Detail to be "cause, then step". This state has neither. The only visible control (`Retry check`) will fail identically forever, because the real fix is a terminal command the cockpit knows and declines to say.

**Fix:** render the unreadable stage as a `Notice` inside the section, reusing the `review-unavailable` row with `Retry check` as its action.
**Suggested command:** `/impeccable harden`

### [P1] Two verbs for pressing a control, plus two unapproved sentences

`copy.md` states: `Select {control} to {result}` — never Press, Click or Use. Every Detail sentence obeys. Every notice violates it: `Press Retry check` appears at seventeen sites in `notice-copy.ts`, plus `Press Change folder`, `Press Close` and `press Import skill`. One row can show both at once: the Detail cell says "Select Update proposal…" and eight lines below, in the same cell, the notice says "Press Retry check".

On top of that, two user-facing strings are hardcoded in the view and nowhere else: `"Nothing to propose"` and `"Edit a skill in your clone, or press Import skill, to propose a change."` (`harness-view.tsx:324,329`). No copy module, no test, wrong empty-state form (`No {things} yet`), and they name the button "Import skill" while it reads "Import skill…". This is also the most common Harness state for a working author, so the most-read string is the only unreviewed one.

**Fix:** rewrite every `Press X` to `Select X` and update the exact strings in `notice-copy.test.ts`; move both loose sentences into `stage-copy.ts` with a sibling test.
**Suggested command:** `/impeccable clarify`

### [P1] Accessibility falls behind the precedent this repo set itself

Measured, not assumed:
- **Row actions trigger `⋯` is 20 × 16 px** — below the WCAG 2.2 SC 2.5.8 minimum of 24 × 24, on every row.
- **The table scroll container is a bare `<div className="overflow-x-auto">`** (`stage-table.tsx:56`): no `tabIndex`, no `role`, no label. Inventory does the opposite one directory over, with a `biome-ignore` citing WCAG 2.1.1. At 420px the table scrolls 760px inside a 114px window and is keyboard-unreachable.
- **No `aria-live` in the view.** axe-core: 1 violation (`page-has-heading-one` — the view starts at `h2`).
- **At 420px the whole page scrolls horizontally**, not just the table: `scrollWidth 1027` vs `clientWidth 420`, because the sidebar holds a fixed 256px. At 200% zoom the Detail column is off-screen.

What is right: contrast passes AA everywhere (chip 5.49:1, Detail 6.06:1), the focus ring is 2px amber at 8.6:1, and `prefers-reduced-motion` is covered centrally through `motion-safe:`.

**Fix:** `⋯` to at least 24×24; `tabIndex={0}` plus `aria-label` on the scroll container as Inventory does; `role="status"` on the stage meta; restore an `h1`.
**Suggested command:** `/impeccable audit`

### [P2] The chips break the design system's own Never-Colour-Alone rule and invert its two signals

`DESIGN.md:303` requires "a glyph and a word" (`● in sync`, `▲ 2 drift`), and every other chip in the cockpit obeys. The fourteen stage chips carry no glyph at all (`stage-copy.ts:38`). Worse, `DESIGN.md:211` justifies the whole narrow palette on "a single amber chip in a long list is impossible to miss" — this view assigns amber to six of fourteen readings, and green to the four Pending release readings whose Detail sentence literally says "Select Create a release to publish it." Green means rest; these rows are not resting.

**Fix:** prefix the readings with the existing glyph vocabulary (`▲` on the six amber, `●` on the four green) — a `stage-copy.ts` change only. Raise the amber/green assignment itself as a tracker issue against `DESIGN.md:293`; it is a spec decision, not a build defect.
**Suggested command:** `/impeccable colorize`

## Persona Red Flags

**Alex (power user, many repos, arrives with an errand):** no search, filter or sort on any stage table while Inventory has all three. A Harness with forty skills mid-migration is three unsortable scroll regions; the most likely errand — "where is `tdd`?" — has no affordance. `Propose change` on a deletion row opens a dialog headed `Delete tdd`, and the failure notice then sends him to "Delete skill again", a control that only exists inside a dialog that has since closed.

**Sam (accessibility-dependent):** the 20×16 `⋯` fails SC 2.5.8. `Open pull request` opens a new tab without the accessible name saying so (WCAG 3.2.5). Disabled menu items fall back to `text-dim`, the palette's lowest contrast step, while those items carry the sentence explaining why she cannot act. The 3-second highlight uses `bg-active`, the surface `DESIGN.md:281` reserves for "a standing choice, never a passing pointer".

**Riley (stress tester):** `multiple-pull-requests` with three matches produces a 5+ item menu where none are actionable, inside a `DropdownMenu.Content` with no `max-h` and no scroll. `proposal-closed` with several closed requests emits one `Reopen proposal #N` per request plus `Propose change` — an unbounded list where #41 and #38 look identical. `Deletion approved, awaiting merge` is 33 characters `whitespace-nowrap` in a `w-56` (224px) column; by arithmetic ~234px of chip in a 224px cell. Not measured in the browser — that state could not be produced in smoke.

## Minor Observations

- **`pending-release.tsx` is dead product code.** Only its own story and test import it, and it still renders an Author column the shipped table does not have. Anyone opening Storybook to see Pending release gets the pre-#827 design. Delete component, story and test.
- **The `RELEASE_SUMMARIES` card** is a card holding one muted sentence, stacked under the strip, saying what the table below now says with rows. It is not in the spec's screen design either.
- **The focus ring animates in.** Immediately after `.focus()`, `outlineColor` is still `currentColor` and only settles to amber after ~150ms, because Tailwind v4's `transition-colors` includes `outline-color`. Motion-safe, so reduced-motion users get it instantly.
- **The withdraw confirm button is amber-primary** — the same colour as `Create a release`. Nothing in the palette separates "publish" from "retract".
- **No total count anywhere.** The spec rightly forbade zero counts; the implementation removed all of them. "How much is waiting on me?" is now answered by counting rows.
- **An Agentation dev toolbar v3.0.2 is injected into the dev/smoke page** — hidden during screenshots, but present.

## Questions to Consider

1. If `Multiple pull requests` and `Review status unavailable` both end in "go do it on GitHub", what is the honest name for those states — and does principle 4 ("Steering is never a detour") survive them, or should it name which detours Maestro accepts?
2. Amber marks six readings here. At what row count does `DESIGN.md:211`'s promise stop being true, and has anyone looked at a Harness with twenty rows in a browser?
3. Green marks the four readings whose Detail sentence is an instruction to act. Is green still "rest", or has this view redefined it as "merged"?
4. The deletion path shows the exact tree hash it is confirmed against. The edit path, used a hundred times more often, shows nothing before pushing. Which of those two got the design attention it deserved?
5. The `Press` / `Select` split runs exactly along the notice/detail seam. Does that mean two people wrote this view, or that the rule arrived after the notices did — and which answer is more worrying?
