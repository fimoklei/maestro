---
target: inventory screen
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/michielmerks/orca/workspaces/maestro/tellin/packages/web/src/inventory/inventory-view.tsx"
target_fingerprint: "sha256:98caac24429680df42da99ecef0d4595bacf82c7d3b9e131975a65b1f1389655"
target_path: /Users/michielmerks/orca/workspaces/maestro/tellin/packages/web/src/inventory/inventory-view.tsx
timestamp: 2026-10-06T21-49-49Z
slug: packages-web-src-inventory-inventory-view-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Latest release not shown; pane reads a local-edits target as Up to date, Remove dialog then reveals local edits |
| 2 | Match with real world | 3 | Fixed vocabulary; "clean copies" not a GLOSSARY term |
| 3 | User control & freedom | 3 | No-match filter state has no clear-filters control |
| 4 | Consistency & standards | 2 | "1 clean copies", "Remove from 1 targets"; "Remove from all 3 targets" over-promises |
| 5 | Error prevention | 2 | Bulk Deploy preselects a target and has no body |
| 6 | Recognition over recall | 2 | Fix for Behind is row → pane → target ⋮ → Update target |
| 7 | Flexibility & efficiency | 2 | Good keyboard grid; no bulk Update, selection is deploy-only |
| 8 | Aesthetic & minimalist | 3 | Type column/filter with one type; wide empty Description gutter |
| 9 | Error recovery | 3 | Remove dialog names local changes but no next step |
| 10 | Help & documentation | 2 | Selection keys undiscoverable; hover card names no next action |
| **Total** | | **24/40** | Acceptable |

## Design specificity
Frame, density, badges and the Deployed-to sub-list are product-specific. The table itself is generic, and drift (the core signal) is one small amber chip; latest release lives only in the sidebar subtitle.
Detector: 0 CLI findings across inventory/, ui/, shell/ (verified with canary + --no-config). Browser: layout-transition (Sonner vendor CSS), cramped-padding (fixed-height button), nested-cards (split-pane aside) — all false positives.

## Priority issues
1. [P1] Pane per-target list has no Local edits reading (skill-status.ts targetReading); a target reads Up to date until the Remove dialog contradicts it. Fix: add Local edits to the pane sub-list and hover card. /impeccable harden
2. [P1] Drift has no one-step remedy: row ⋮ and pane foot omit Update; pane primary is Deploy skill. Fix: lead with Update on a Behind skill, or link to Deploy-state filtered. /impeccable clarify + layout
3. [P1] Bulk Deploy dialog preselects a target and has an empty body. Fix: no default, list staged skills and which are already there. /impeccable harden
4. [P2] Pane facts are Type and Targets only; no Status, Latest release, Behind count, no state paragraph. /impeccable clarify
5. [P2] Plural bugs (bulk-remove-dialog-view.ts:144-151) and over-promising "Remove from all 3 targets" (inventory-copy.ts:80-81). /impeccable polish

## Persona red flags
- Alex: no bulk Update; no behind count in header; filter has no counts.
- Sam: row ⋮ tabIndex=-1, no context-menu key; selection keys hidden; names read "…/scenarios/behind"; document title always "Maestro".
- Solo operator mid-errand: sees Behind but not against which release; sidebar "1 behind" vs 2 behind targets here.

## Minor
Hover card clips at panel edge; selection bar floats far below rows; skill name in mono in Delete dialog; no-match header still "3 skills"; "More ›" role unverified; two filled primaries with selection + pane open.

## Questions
1. Why not worst-first sort and "2 of 3 behind v2.0.0" as header meta?
2. Should Inventory update at all, or link Behind to Deploy-state?
3. Is the Type column/filter worth its cost with one primitive type?
