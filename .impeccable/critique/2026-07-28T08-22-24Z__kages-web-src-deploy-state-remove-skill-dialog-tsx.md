---
target: remove skill workflow
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-07-28T08-22-24Z
slug: kages-web-src-deploy-state-remove-skill-dialog-tsx
---
Method: dual-agent (A: a58e31d99d9457af7 · B: af01492cbcc6a0884)

Target: the remove-deployed-skill workflow — row action → actions menu → preflight → confirmation dialog → mutation. Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | In-flight and failure states are well covered; success is invisible — no `role="status"` on the remove path, while the deploy path has one (`deploy-skill-action.tsx:148`). |
| 2 | Match System / Real World | 3 | Strong domain nouns, but "never went through central" (`remove-skill-dialog.tsx:22`) is internal jargon and "you" (`:128`) breaks the product's own voice rule. |
| 3 | User Control and Freedom | 2 | No undo, no redeploy-at-the-removed-version, no multi-target remove. Cancel and Escape are the only exits. |
| 4 | Consistency and Standards | 3 | Tokens, Button variants and the modal contract are consistent; prose is set in mono against the Mono-Is-Data Rule, the error box carries no glyph, and `actions-menu.tsx:58` hovers onto `bg-active`, which DESIGN.md reserves for a standing choice. |
| 5 | Error Prevention | 3 | The preflight plus the held confirm (`remove-skill-dialog.tsx:78`, `:169`) is genuinely strong; a preflight that *refused* drops the server's reason and still enables confirm. |
| 6 | Recognition Rather Than Recall | 3 | Skill and target are named in full; the version being destroyed is dropped between row and dialog. |
| 7 | Flexibility and Efficiency | 1 | Remove is buried in a kebab menu, one skill × one target per dialog, no bulk remove while `/api/deploy/bulk` exists (`app.ts:626`). |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and token-correct, but four flat mono paragraphs and two visually identical amber boxes give the panel no hierarchy. |
| 9 | Error Recovery | 3 | The server's messages are the best copy in the flow; `attempted` misclassifies code-less HTTP errors, and "Check it before trying again" offers no in-cockpit way to check. |
| 10 | Help and Documentation | 2 | None. "Its lockfile entry go[es]" assumes knowledge it never supplies. |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Authored for Maestro at the copy and logic layer, category-interchangeable at the interaction layer — roughly 60/40.

Product-specific and genuinely so: the preflight is a real domain idea rather than a confirmation ritual (`use-remove-preflight.ts:36-42` refuses to cache, because a cached answer is the one lie this check exists to prevent); `remove-warning-view.ts:9-21` splits *cannot-verify* from *check-failed* so the wording never states a cause nothing observed; and "This takes it off Claude Code and Codex in one go. There is no per-tool remove." (`remove-skill-dialog.tsx:120-125`) exists only because `apm uninstall` has no `-t`. That sentence cannot be pasted anywhere else.

Category-interchangeable: the shell is the default destructive modal — centred 480px card, `Remove tdd?`, body paragraph, right-aligned cancel/confirm footer (`:155-174`). The entry point is `⋯` → `remove…` (`deploy-state-list.tsx:154-165`), a kebab menu, sitting beside a named, always-visible `Update tdd` ghost button. PRODUCT.md:92 says steering is never a detour; that is honoured for update and abandoned for remove. And the dialog states no paths, no versions, no counts, in a cockpit whose first design principle is "Inspectable, not magical".

**Deterministic scan.** `detect.mjs --json packages/web/src/deploy-state` → exit 0, zero findings. `packages/web/src/ui/actions-menu.tsx` → exit 0, zero findings. **This clean result is much weaker than it looks.** Assessment B probed the detector: a `.tsx` file containing `shadow-lg transition-colors cursor-pointer text-[8px]` also returns zero findings, while the same file with a CSS-in-JS `cubic-bezier` returns only the cubic-bezier hit. The regex engine has no Tailwind-utility awareness for shadows, transitions, cursor or type scale. Because this flow is styled entirely with Tailwind utilities over semantic tokens, the detector had almost nothing it could read. URL scanning — the one mode that inspects rendered output — needs puppeteer, which is not installed. Read the zero as "no coverage", not "pass".

Manual grep checks filled the gap and the flow holds up well: every transition goes through the single `HOVER_TRANSITION` constant, fully `motion-safe:`-gated; no `box-shadow`; no hardcoded hex; no arbitrary type sizes (smallest is `text-tag` = 10px, exactly the documented floor); every `cursor-pointer` pairs with a hover colour change; every button has an accessible name; no emoji. Two real violations: the `you` at `remove-skill-dialog.tsx:128`, and `actions-menu.tsx:58` using `data-[highlighted]:bg-active` with no `HOVER_TRANSITION`, which both hovers onto the active surface and does it instantly.

**Visual overlays.** No user-visible overlay. Injection was not attempted: the port-owner guard and the missing puppeteer dependency made the overlay path unavailable. Assessment B did start a clean Storybook on port 6007, screenshot `DeployState/RemoveSkillDialog — WithLocalEdits`, and read its accessibility tree, then killed the server (pid 36331, port confirmed free). The rendered dialog matches the documented system: near-black canvas, hairline borders, zero shadows, amber warning block with `▲`, mono throughout. The a11y tree exposes `dialog "Remove tdd?"` → `heading [level=2]`, three paragraphs, a `status` node, and two named buttons.

Note for the record: `agent-browser close --all` also closed a pre-existing `maestro-review` session.

## Overall Impression

The thinking underneath this flow is better than the flow. The preflight, the `attempted` flag, and the refusal to reuse one warning's wording for another's cause are real design work — the kind most products never do. They are wrapped in a generic destructive-modal chassis and then undercut at the two ends: the dialog does not name what it will delete, and after a successful removal the app says nothing at all.

The single biggest opportunity: make the destructive path as inspectable and as loud as the deploy path already is. Name the paths before, confirm the outcome after.

## What's Working

**The preflight is a genuine design invention.** `use-remove-preflight.ts:36-42` sets `gcTime: 0, staleTime: 0`; `remove-warning-view.ts:28-30` turns a failed check into `check-failed` rather than silence; `remove-deployed-skill.ts:118-123` warns even for states the removal would refuse. The rule "silence in a confirmation reads as nothing-to-lose" is applied consistently from core to pixel. It converts an unanswerable user question — will this cost me anything? — into an answered one, before consent rather than after.

**Holding the confirm while leaving cancel live.** `remove-skill-dialog.tsx:78` and `:169` disable confirm during `checking`; `:160` disables cancel only while removing. Waiting is never a trap, and the user cannot destroy an edited copy in the window where the screen could not yet have warned them. Covered at `remove-skill-dialog.test.tsx:146-163`.

**`attempted` as a first-class prop.** `remove-skill-dialog.tsx:59-63` and `deploy-state-list.tsx:186-189` mean the mixed-state warning appears only when apm actually ran. Most apps show one generic failure for every class; this one refuses to send the user hunting for damage that does not exist.

## Priority Issues

### [P0] The global dialog under-states what gets deleted from disk

**What.** On the global path the dialog promises "This takes it off {detected tools} in one go" (`remove-skill-dialog.tsx:121-124`), where `tools` is the live-detected set. After a successful removal the server runs `reclaimUntargetedCopies` (`remove-deployed-skill.ts:357-362`), which force-deletes the subtree of every *exclusive, undetected* tool. A machine where Claude Code is no longer detected but `~/.claude/skills/tdd` still exists gets that directory removed, while the dialog named only Codex.

**Why it matters.** This is the exact failure the dialog exists to prevent: the user consents to a named set and a larger set is destroyed, on their own machine, with no record. The preflight's local-edits check never covered the reclaimed copy either, so edits inside it are destroyed unwarned.

**Fix.** Return the reclaim set from the preflight and name it: "Also clears the leftover Claude Code copy at `~/.claude/skills/tdd` (Claude Code is not installed on this machine)." If it cannot be named, do not reclaim it inside a user-confirmed action.

**Suggested command:** `/impeccable harden`

### [P1] A successful removal leaves no visible outcome and no trace

**What.** Success closes the dialog and invalidates two queries (`use-remove-deployed-skill.ts:31-35`). Nothing announces it. There is no `aria-live` or `role="status"` on the remove path; the deploy path has both (`deploy-skill-action.tsx:148-152` renders `Deployed tdd v0.9.0` in green).

**Why it matters.** A screen-reader user gets nothing — focus lands on a card heading whose text has not changed, and the deletion is inaudible. A sighted user gets absence-as-evidence. PRODUCT.md:85 says nothing important happens without a trace; this is the most consequential action in the app and it leaves none. On refresh mid-removal the state becomes unreadable entirely: the POST continues under the per-target lock, apm finishes, and the returning UI cannot say whether a removal ran.

**Fix.** A `role="status"` line on the card, matching the deploy path's shape: `✓ removed tdd v0.5.0 from acme-web`. Persist for the session.

**Suggested command:** `/impeccable harden`

### [P1] A refused preflight is rendered as "couldn't check", and confirm stays enabled

**What.** `remove-warning-view.ts:28-30` maps any query error to `check-failed` — "Maestro couldn't check this copy for local edits." The server's real refusals are specific and carry written messages: `repo-not-registered` (403), `no-supported-tool` (409, "there is no global deployment to remove"), `invalid-name` (400), all at `app.ts:264-280`. All are discarded.

**Why it matters.** The user is told a check failed when the removal is already known to be impossible. They confirm, wait, and get the real reason on a second round-trip. Worse, the dialog says "may lose work" for a case where there is nothing to lose.

**Fix.** Carry the `HttpError` code and message from the preflight into the dialog. On a refusal code, show the server's message and disable confirm.

**Suggested command:** `/impeccable clarify`

### [P2] `attempted` defaults to "nothing was attempted" for any code-less HTTP error

**What.** `deploy-state-list.tsx:186-189` computes `attempted = !(error instanceof HttpError) || error.code === "remove-failed"`. `requestJson` builds an `HttpError` with `code: undefined` whenever the body is not JSON or carries no `error` field — a proxy 502, an HTML error page, a server that crashed mid-`apm uninstall`.

**Why it matters.** Exactly the scenario where apm most likely *did* run and *did* leave the repo half-changed is the scenario where the dialog promises it did not. That inverts the honesty the prop was built for.

**Fix.** Invert the default: treat an unknown or code-less error as attempted, and enumerate the codes known to refuse before apm runs.

**Suggested command:** `/impeccable harden`

### [P2] One skill, one target, one dialog — while bulk deploy exists

**What.** Removal is per-row only (`deploy-state-list.tsx:154-165`). A skill deployed to 12 registered repos means 12 kebab menus, 12 modals, 12 preflights. `/api/deploy/bulk` (`app.ts:626`) and `inventory/bulk-selection.ts` exist for the deploy direction.

**Why it matters.** The stated user runs many repos (PRODUCT.md:19). Retiring a skill is precisely the many-target operation, and it is the one direction with no bulk path. The asymmetry teaches "deploying is cheap, undeploying is expensive" — the opposite of what a cockpit should teach. This user will open a terminal, which is the product's own stated failure condition.

**Fix.** At minimum, a "remove from all targets" affordance in the skill detail pane, with one dialog listing every target and its warning state. It reuses the same preflight, one call per target.

**Suggested command:** `/impeccable shape`

## Persona Red Flags

**Alex (impatient solo power user, many repos).** Three interactions to reach a confirm — focus row, open `⋯`, pick `remove…` — while update is one click away in the same row. No keyboard shortcut anywhere in the flow; the only accelerator is Radix's menu typeahead. The confirm blocks on the preflight round-trip every time, which for a clean copy is a stall with no payoff. Retiring a skill across 12 repos is 12 full modal cycles.

**Sam (keyboard / screen reader).** Nothing announces success — the dialog unmounts, focus moves to a heading whose text is unchanged, and the deletion is silent. The dialog has `aria-label` (`:97`) but no `aria-describedby`, so the scope line, the consequence line and the ▲ warning are body content the user must arrow to; on the global path the "no per-tool remove" fact is not in the announcement. `role="status"` on the warning (`:132`) is a live region present at mount, and at-mount live-region content announces unreliably across readers. The confirm is disabled during `checking` with no programmatic reason attached. Genuinely good: the focus trap and restore (`use-modal-dialog.ts:44-92`), the shared Escape stack, the visible amber focus ring on every variant, and the deliberate focus hand-off when the trigger is destroyed (`deploy-state-list.tsx:104-109`).

**Riley (stress tester).** 0 targets renders nothing — clean. Failed removal keeps the dialog open with apm's message plus the mixed-state note; retry is possible, but the preflight is **not** re-run, so the second attempt is authorised by a warning taken before the first, half-completed one. Refresh with the dialog open is safe (`removing` is local state). Refresh mid-removal is unrecoverable-by-reading. Double-click confirm is covered by the disabled state plus the server's `remove-in-progress` 409. A reclaim failure is swallowed by design (`reclaim-untargeted-copies.ts:41-49`), so the user is told the removal succeeded while a directory remains on disk.

## Minor Observations

- The dialog drops the version. The row shows `tdd v0.5.0 → v0.9.0` (`deploy-state-list.tsx:138-142`); the confirmation does not. `Remove tdd v0.5.0?` costs nothing and closes the working-memory gap.
- The two amber boxes are identical containers — same fill, border, radius and padding (`:133`, `:142`). "This may lose work" and "the removal failed and your repo may be half-deleted" render as the same object, separated only by a `▲` that one has and the other lacks. The error box also breaks the Never-Colour-Alone rule.
- Four consecutive paragraphs at `text-mono-sm`/`text-tag` with no weight or size step (`:109`, `:112`, `:121`, `:126`). "There is no per-tool remove" carries the same visual weight as the boilerplate below it.
- All dialog prose is `font-mono` though the Mono-Is-Data Rule assigns prose to the sans body face.
- "Deploy it again from the inventory whenever you want it back" (`:127-128`) is the only reassuring line and it slightly overclaims: a redeploy re-pins to the latest published tag (`update-skill-action.tsx:9-11`), so what comes back is not what left.
- "Its deployed files and its lockfile entry go" — those files are at known paths (`deployTargetSubtrees`). Naming them would be one mono line and would make the dialog inspectable rather than merely honest.
- `ActionsMenu` always receives exactly one item on this path, so the `⋯` is a menu of one.
- The confirm label grows with the skill name (`removing some-very-long-skill-name…`) inside a 480px panel with `whitespace-nowrap` on the button; a long slug will push the footer.
- Storybook coverage is excellent — nine stories including `Refused`, `CheckFailed` and `Unverifiable` (`remove-skill-dialog.stories.tsx:25-70`). There is no `GlobalScope + checking` story, and no story for a success state, because none exists.
- `remove-skill-dialog.test.tsx` and `remove-skill-row.test.tsx`: 34 tests, all passing.

## Questions to Consider

1. **If the dialog cannot name the paths it is about to delete, is this cockpit still "inspectable, not magical"?** The core knows every subtree, the preflight already reads them, and the dialog chooses to say "its deployed files".
2. **Why does deploying announce itself and removing does not?** A green `Deployed tdd v0.9.0` follows the reversible action; nothing at all follows the irreversible one.
3. **Should removal be reversible instead of confirmed?** The dialog's own copy claims the removal is cheap to undo. If that is true, the honest design is a removal that just happens plus a ten-second `undo`, and the modal disappears. If it is not true — because a redeploy re-pins to latest — then the dialog is reassuring the user with something the system does not guarantee. Which is it?
4. **Whose failure is a mixed state?** "The repo may be in a mixed state — check it before trying again" hands a half-deleted repository back with no tools, in a product whose fourth principle is that any flow sending the user back to the CLI has failed.
