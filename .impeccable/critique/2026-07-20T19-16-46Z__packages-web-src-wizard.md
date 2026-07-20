---
target: onboarding / first-run flow
total_score: 21
p0_count: 1
p1_count: 4
timestamp: 2026-07-20T19-16-46Z
slug: packages-web-src-wizard
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Target: the first-run / onboarding wizard — `packages/web/src/wizard/*`, `packages/web/src/shell/first-run-gate.tsx`, `browse-dialog.tsx`, `connect-inventory-form.tsx`.
Measured live against `pnpm smoke` (sandbox `MAESTRO_HOME`, true first-run state, 4 seeded candidate repos).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `WelcomeView` and `WizardConnectView` both render `activeStep={1}`, so the first click advances the screen but not the progress strip. A completed step is styled identically to a not-yet-reached one; nothing ever renders "done". |
| 2 | Match System / Real World | 2 | Browse-dialog breadcrumb reads `~ · home ceiling` — not in the fixed vocabulary, not English anyone speaks. `Global` appears in the sidebar on connect, never introduced. |
| 3 | User Control and Freedom | 1 | No Escape handler anywhere in `packages/web/src/shell/` (grep exit 1, confirmed in-browser twice). No backdrop dismiss, no focus trap, no initial focus into the dialog, no focus restore. No back link between wizard steps. |
| 4 | Consistency and Standards | 2 | Disabled buttons are visually identical to enabled ones (`register 0 selected →`: `disabled: true`, `opacity: 1`, `background: rgb(232,163,61)`). Welcome is centred, every later step left-aligned — the layout lurches on the first click. Error has no glyph; success does. |
| 5 | Error Prevention | 2 | `agent-harness/` — the central inventory itself — is offered as a selectable consuming repo. `scratch-notes/` renders with no checkbox and no explanation. |
| 6 | Recognition Rather Than Recall | 3 | Breadcrumbs, `git` chips and per-row path echo are good. But two distinct repos render in the sidebar as byte-identical truncated strings (`/Users/michielmerks/P…`), because truncation drops the distinguishing tail. |
| 7 | Flexibility and Efficiency | 2 | Filter-this-folder is genuinely fast. No Escape, no keyboard route into the dialog, no shortcut to the paste field, one flat listing for a many-repo user. |
| 8 | Aesthetic and Minimalist Design | 4 | Strongest axis. Nothing decorative anywhere. Detector confirms: only 2 advisory findings in the whole surface, none in the wizard. |
| 9 | Error Recovery | 2 | Copy is correct and terse. Delivery is wrong: 10px, no glyph, positioned below the submit button rather than under the field, and focus drops to `BODY` instead of returning to the invalid input. ARIA wiring (`aria-invalid`, `aria-describedby`, `role="alert"`) is correct — semantics beat visuals. |
| 10 | Help and Documentation | 1 | Zero inline definition of *primitive*, *target*, *deploy-state*, *consuming repo*, or *Global* anywhere in the flow. No link out. |
| **Total** | | **21/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**Not AI slop.** This reads as a deliberately-built tool: near-black canvas, 1px borders, zero shadows (`box-shadow: none` confirmed on the dialog), mono-for-data / sans-for-chrome, no illustrations, no entrance animation. Nothing here looks like a template.

**Deterministic scan** — `detect.mjs` exit 2, **2 advisory findings**, both the same rule, both outside the wizard:

| Rule | File:line | Detail |
|---|---|---|
| `design-system-font-size` | `packages/web/src/ui/button.tsx:25` | `text-[12px]` on the `lg` size — off the DESIGN.md ramp |
| `design-system-font-size` | `packages/web/src/ui/nav-item.tsx:46` | `text-[12px]` on an `aria-hidden` glyph — **false positive**, an icon size, not body type |

Zero findings against `wizard/`, `shell/`, or `index.html`. Zero console errors. Zero failed requests except a deliberate 400 and a missing `favicon.ico`. No horizontal scroll and no clipped text at 1440 / 1024 / 768. The 10px type floor holds.

**Where the two assessments agree, and it matters:** the design review flagged `--text-dim` on judgement; the detector measured it. `#5a6470` on `#0b0d10` = **3.24:1**, against a stated WCAG 2.2 AA floor of 4.5:1. It is not decorative — it carries `agent-harness · 36 primitives` (the only on-screen confirmation of what got connected), `step N of 3 · …`, `registered`, `none yet`, the inactive step chips, and the `⚙` settings button. **Nine further failures** on the same token inside the browse dialog, all on enabled controls.

**Detector caught what the review missed:** the **light theme is materially worse and unreachable**. `index.html:2` hardcodes `data-theme="dark"` and no toggle ships (`grep` for `themeToggle|toggleTheme` returns nothing), yet `tokens.css:61` defines a full light theme. Forced on, **13 of 20 text elements fail AA** — including the primary nav labels (`Deploy-state`, `Inventory` at 4.10:1) and the error message itself (4.06:1). Dead code that would ship a worse product than the one you can see.

**Detector also caught:** no `<h1>` on any wizard step — the document outline starts at level 2, at 16px. Nothing on any screen reaches 18px; 60% of all text renders at ≤11px.

**Overlay:** not injected. No user-visible overlay exists in your browser.

## Overall Impression

The craft is real and the taste is real. Three things are genuinely excellent: the confirmation line, the accessibility semantics, and the restraint. What is broken is not the surface — it is the **shape of the journey**. The flow advertises a third step called `deploy`, spends five interactions on setup, and then deposits the user on four cards that all say `Nothing deployed here.` with no deploy action anywhere on screen. The promised payoff is never delivered.

The single biggest opportunity: **make onboarding end in a deployed primitive, not a registered folder.**

## What's Working

1. **`✓ 36 primitives found · read-only, never writes back`.** The count proves Maestro actually read something rather than merely connecting; the safety clause pre-empts the exact fear a power user has when pasting a filesystem path into a local web app. Terse, technical, no "you"/"we" — the brand voice working exactly as `PRODUCT.md` describes it. Requiring an explicit `Continue` rather than auto-navigating is the right call: it keeps the payload on screen long enough to read.

2. **The `git` chip in the repo picker.** One 10px mono chip does the work of a paragraph — it marks which folders are candidates and silently teaches the rule that a target must be a git repo. Recognition over recall at almost zero pixel cost.

3. **Accessibility semantics are better than the visuals.** `connect-inventory-form.tsx` correctly wires `aria-describedby`, `aria-invalid`, `role="alert"` and a real `<label htmlFor>`. `browse-dialog.tsx` carries `aria-modal` plus a dynamic `aria-label` that changes from `Select repos to register` to `Registration result` when the surface becomes a report. Landmarks are sane; every control is a real `<button>`; no clickable `<div>` exists in app code.

## Priority Issues

### [P0] The flow ends where it promised to begin
**What:** The progress strip advertises `3 · deploy`. `Continue to Deploy-state →` lands on `/` showing four `Nothing deployed here.` cards, zero deploy affordance, and no progress strip.
**Why it matters:** This user arrived with a concrete errand and just spent five interactions on setup. The payoff screen is empty and offers no next move; they must guess that deploying lives under `Inventory`. Peak-end says the last moment carries disproportionate weight — and the last moment is a quadruple empty state. The errand is further away than when they started.
**Fix:** Land on Inventory with the primitive list ready to deploy, or keep the strip visible on `/` with step 3 active and put one amber action in each empty-state body: `Nothing deployed here. · deploy a primitive →`.
**Suggested command:** `/impeccable onboard`

### [P1] Step 2 has no primary action; the progress chip outranks both buttons
**What:** On `/welcome/repos`, `+ repo` is `variant="dashed"` (grey) and `skip →` is `variant="quiet"` (grey). The only amber element on screen is the step indicator `2 · register repos`.
**Why it matters:** A power user scans for amber, finds none in the action band, sees two equal-weight grey buttons and takes the one that ends the screen — `skip →`. The step gets skipped by visual default, the user reaches the cockpit with no targets, and that guarantees the P0 empty state. The two failures compound.
**Fix:** `+ repo` becomes `variant="primary"` while the list is empty (it is the one action on the view), and the step chip drops to an amber outline instead of an amber fill so it stops competing. Keep `skip →` quiet.
**Suggested command:** `/impeccable layout`

### [P1] Escape does not close the browse dialog; focus never enters it
**What:** No `Escape` handler and no `onKeyDown` anywhere in `packages/web/src/shell/` (grep exit 1; confirmed in-browser twice, from `BODY` and from inside the filter input). No backdrop dismiss, no focus trap, no initial focus, no focus restore. Tabbing from the trigger reaches a background control *before* entering the dialog, and escapes to `BODY` after the last dialog control. `role="dialog" aria-modal="true"` sits on the full-screen overlay rather than on the panel.
**Why it matters:** This user sits beside a terminal and reaches for Escape reflexively. A modal that ignores Escape reads as broken, not as strict. Keyboard-only users cannot enter the dialog without tabbing through the page behind it.
**Fix:** Move `role`/`aria-modal`/`aria-label` onto the inner panel; add a keydown listener calling `onClose` on Escape (guarded by `isRegistering`, matching the existing `✕` disable); focus the filter input on mount and restore focus to the trigger on close; make the background inert.
**Suggested command:** `/impeccable harden`

### [P1] Disabled primary buttons are indistinguishable from enabled ones
**What:** Measured on `register 0 selected →`: `disabled: true`, `opacity: 1`, `background: rgb(232,163,61)`. `ui/button.tsx` sets only `disabled:cursor-not-allowed`; no variant carries a disabled colour.
**Why it matters:** A full-saturation amber call-to-action that silently ignores clicks is the single strongest "unfinished interface" signal in the flow. It also breaks the one-amber-action rule twice over: the dialog now shows two amber-filled buttons and one of them is not real.
**Fix:** Add `disabled:bg-transparent disabled:text-dim disabled:border-line-chip` to the shared base in `ui/button.tsx` so every variant is covered at once.
**Suggested command:** `/impeccable harden`

### [P1] `--text-dim` fails AA at 3.24:1 and carries load-bearing text — and the light theme is worse
**What:** `#5a6470` on `#0b0d10` = 3.24:1 against a stated 4.5:1 floor. Nine further failures on the same token in the browse dialog, all on enabled controls. In the (unreachable) light theme, 13 of 20 text elements fail, including primary nav labels at 4.10:1 and the error message at 4.06:1.
**Why it matters:** `PRODUCT.md` states WCAG 2.2 AA as a commitment. The header line carrying `agent-harness · 36 primitives` is the only on-screen confirmation of which inventory got connected, and it is the least readable text in the product.
**Fix:** Lift `--text-dim` to roughly `#7d8794` (≈4.6:1), or promote every meaning-carrying instance to `--text-muted` `#8a94a0` (6.1:1) and reserve dim for pure decoration. Fix the light-theme ramp at the same time, or delete it until a toggle ships.
**Suggested command:** `/impeccable audit`

### [P2] Amber carries "act", "warning" and "error" simultaneously
**What:** There is no danger token in `tokens.css`. The primary CTA, the active step chip, and the validation error are all `--amber`. On `/welcome/connect` three amber surfaces compete at once. The error `No directory exists at that path.` renders as bare amber text at 10px with **no glyph**, while the success state next to it does carry one (`✓ 36 primitives found`).
**Why it matters:** "Act" and "something is wrong" are chromatically identical, which breaks the Two Signals Rule in the direction that costs most. The Never-Colour-Alone rule is broken in the one place it matters most.
**Fix:** Decide whether the palette refuses red on principle. If it does, errors need a different axis entirely — an inverted chip, a `✕` glyph, an outline — not a shared hue.
**Suggested command:** `/impeccable colorize`

### [P2] Long paths truncate at the tail, making distinct targets identical
**What:** Two different registered repos render in the sidebar as byte-identical `/Users/michielmerks/P…`. In the cockpit both `LOCAL` cards truncate as `…/.maestro-sandbox/home/Pr…`.
**Why it matters:** "One power user, many repos" is the stated user. Deep, similarly-prefixed paths are the normal case, not the edge case — and deploy-state is read *per target*.
**Fix:** Basename as the primary label with the parent path as dim secondary text, or middle-truncate (`/Users/…/Projects/checkout-service`). Add `title` for the full string on hover.
**Suggested command:** `/impeccable clarify`

## Cognitive Load — 4 of 8 fail (high)

| Item | Result |
|---|---|
| Single focus | **FAIL** — the destination screen shows four cards all reading `Nothing deployed here.` with no action on any of them |
| Chunking | pass |
| Grouping | **FAIL** — on `/welcome/repos` the `+ repo` button sits inside the card, `skip →` outside it, the progress strip below that: three unrelated bands for one step |
| Visual hierarchy | **FAIL** — the amber step chip is the loudest element on a screen whose two real actions are both grey |
| One thing at a time | pass |
| ≤4 options per decision point | **FLAGGED** — the browse dialog exposes ~11 interactive targets simultaneously |
| Working memory | **FAIL** — on connect success the typed path vanishes entirely; only the basename survives in the header. A user with two clones of `agent-harness` cannot tell which one is live |
| Progressive disclosure | pass |

## Emotional Journey

**Peak:** the connect confirmation. Three simultaneous confirmations from one action — the green line, the header flipping to `agent-harness · 36 primitives`, the status chip to `● connected`. `read-only, never writes back` is exactly the right seven words at the highest-anxiety moment in the flow.

**Valley 1 — the reassurance never repeats.** Registering repos is the *second* filesystem hand-over, and this time the user names folders Maestro will later **write** to. There is no equivalent safety clause. `where local deploys can land` — 10px, 3.24:1 — is the entire disclosure. The high-stakes moment gets less reassurance than the low-stakes one.

**Valley 2 — `cancel` after an irreversible write.** The registration report shows `RESULT · 2 REGISTERED · 0 SKIPPED` alongside `✕`, `cancel` and `done`. The write already happened. `cancel` on a completed, irreversible action promises a rollback that does not exist.

**The end is the worst part.** See P0.

## Persona Red Flags

**Alex (impatient power user)** — Broke on `skip →` in `wizard-repos-view.tsx`: scanned for amber, found none in the action band, took the rightmost control, ended the step, landed in the cockpit with no targets and no idea he skipped anything. Second break: hit **Escape** to dismiss the browse dialog, nothing happened, hit it twice more before reaching for the mouse.

**Jordan (confused first-timer)** — Broke on the breadcrumb string `~ · home ceiling` — unparseable, read as an error. Second break: `scratch-notes/` renders with no checkbox, no disabled styling, no reason given; Jordan clicked the row repeatedly assuming a bug. Third break: `Global — empty` appears in the sidebar the moment the inventory connects; the wizard never mentions a thing called Global and there is nowhere to find out what it is.

**Riley (deliberate stress tester)** — Broke on three things at once in the registration report. (a) `cancel` next to `done` on a completed irreversible write. (b) Long paths render as identical truncated strings. (c) **`first-run-gate.tsx` only guards `pathname === "/welcome"`** — a fully-configured user opening `/welcome/repos` gets the whole wizard step 2 back, complete with `step 2 of 3` and `Continue to Deploy-state →`. `/welcome/connect` guards this correctly; `/welcome/repos` does not. Onboarding is re-enterable after onboarding is finished.

**Sam, the multi-repo maintainer** (derived from `PRODUCT.md`) — Errand: "get my new lint skill into checkout-service". Broke twice on the same thing: the strip promises `3 · deploy`, and after two steps of setup the flow deposits him on Deploy-state with four empty cards and no deploy control. Second break: having already cloned `agent-harness` in a terminal one window over, he pastes the absolute path — and on success **the path he typed is erased**. He maintains two clones. The only way to confirm which one is live is `⚙ Inventory source`, a glyph rendered at 10px, 3.24:1.

## Minor Observations

- `welcome-view.tsx` breaks the stated no-"you"/"we" voice rule three times in two sentences: "Connect **your** central inventory", "until it knows **your** inventory", "reads primitives from **your** agent-harness clone".
- No `<h1>` on any wizard step; the outline starts at `<h2>` rendered at 16px. Nothing on screen reaches 18px; 60% of text is ≤11px.
- Welcome is centred `min-h-[60vh]`, later steps left-aligned `max-w-lg` — a full-layout jump on the first click.
- `↑ up` is disabled at the home root with its reason (`home ceiling`) rendered as a separate chip three elements away. Nothing links the disabled control to its cause.
- `2 hidden items not shown · show` — `show` is a real button styled as inline amber text with no border or underline. Low affordance.
- Buttons have no `focus-visible` style and fall back to the Chrome default blue outline (`rgb(0,95,204)`, 3.20:1 on the near-black canvas). The input's only focus indicator is `focus:border-line-chip` (`#232a33`) — nearly invisible.
- After a failed submit, focus drops to `BODY` rather than returning to the invalid input.
- `agent-harness/` is offered as a selectable consuming repo — the inventory registering itself as a deploy target.
- `RESULT · 2 REGISTERED · 0 SKIPPED` is excellent terminal-register copy that disappears on `done`. It deserves to survive.
- At 768px the sidebar holds its fixed ~256px and does not collapse; the step subtitle wraps mid-phrase. Not a spec violation, but roughly 75% of the viewport below the content is empty.
- `index.html` declares no favicon (`GET /favicon.ico → 404`).

## Questions to Consider

1. **Why is registering repos a wizard step at all?** The user just pointed at `~/Projects/agent-harness`. Every sibling folder with a `.git` is a candidate, and the picker already computes exactly that. What if step 2 were a pre-checked list — "4 git repos found alongside the inventory · register all" — with one amber button and no browse dialog on the happy path? The ~11-option decision point disappears and the dialog becomes the escape hatch rather than the entrance.
2. **What if there were no wizard?** The cockpit is already the destination. Connect could be a single amber row inside the otherwise-inert Deploy-state view; registering could be the `+ repo` button that already lives in the sidebar. The user would never leave the surface they came for, and the strip's broken promise of `3 · deploy` becomes unnecessary.
3. **The palette has amber and green but no red. Is that a principle or an omission?** A tool-like register can absolutely refuse red — but then errors need a different axis entirely. Which is it?
4. **Should the flow end with something deployed rather than something registered?** If step 3 actually deployed one primitive, the final image would be `✓ 1 deployed · in sync` instead of an empty grid. What is the cheapest primitive that could make onboarding end in a real success state?
5. **`read-only, never writes back` is the best sentence in this product. Where else is it missing?** Registering a repo — the moment Maestro is granted a write target — has no equivalent line. Does its absence mean nobody has yet decided what Maestro promises about the folders it can write into?
