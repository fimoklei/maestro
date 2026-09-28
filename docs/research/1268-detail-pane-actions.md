# How comparable products rank data and actions in a detail pane

Serves [#1268](https://github.com/fimoklei/maestro/issues/1268), input to the
target-pane design in #1269 (parent #1267). Nothing here was applied to the
code, the glossary or the rules.

**Method.** Observed 2026-09-28 with the Chrome browser tools in the
operator's logged-in profile: Linear (a near-empty test workspace), Vercel (a
Hobby project with one failed and several ready deployments), GitHub (PR
#1261 on this repo) and Renovate (this repo's Dependency Dashboard, #284).
Only states that were live on the day were seen; see *Not verified*.

## Patterns across products

1. **At most one filled button, chosen by state, sometimes none.** Vercel's
   deployment detail fills **Visit** when the build is ready and fills
   nothing when it failed (only an outlined **Redeploy**). GitHub's merge
   box labels its one button by state. No screen observed fills an action
   because of its position in a list.
2. **Competing work becomes ordered steps.** Vercel's Vulnerable
   Dependencies page lists *Update Next.js* then *Deploy Project*, each with
   one sentence and its own control; **Redeploy** was disabled while step
   one was still open.
3. **An action sits beside the fact it changes.** Linear's issue page edits
   each property in place; GitHub's PR sidebar has a gear per section;
   Renovate's dashboard has a checkbox per update line.
4. **Menus disable in place and put destructive items last.** Vercel's
   deployment ⋯ menus keep one item set and disable what does not apply;
   Vercel's and Linear's ⋯ menus end on **Delete**.
5. **Status is a field list plus, at most, one next-step sentence.**
   Vercel's production card: "To update your Production Deployment, push to
   the main branch." No screen observed restates its fields as a sentence.

## Per product

### Linear

**Issue page** (`linear.app/<ws>/issue/MER-1/…`).
- Data: title and description in the main column; a right column with
  *Properties* (status, priority, assignee), *Labels*, *Project*. No
  disclosure.
- Summary: a field list only.
- Actions: no action row. Each property is its own control (*Todo*, *Set
  priority*, *Assign*, *Add label*). Top right: icon-only copy buttons and
  one split button, *Copy as prompt*, whose chevron holds *Configure coding
  tools…*. The breadcrumb's ⋯ *Issue options* menu groups the rest by
  dividers and ends on *Show description history*, *Delete*.
- Competing states: none on this screen; nothing is a next step.

**Issue peek** (Space on a list row): a read-only card with ID, title, one
meta line (`Todo · 22d · No priority`) and the description; no actions.
**Selection bar** (checkbox on a list row): `1 selected` and one **Actions**
button (⌘K).

**Project page** (`…/project/<slug>/overview`).
- Data: a right panel of collapsible sections: *Properties* (label/value
  rows: Status, Priority, Lead, Members, Dates, Teams, Slack, Labels),
  *Milestones*, *Activity* (latest entry plus *See all*).
- Summary: a field list; the main column has an empty-state prompt instead
  of a sentence.
- Actions: a `+` on each section header; each value is its own control. The
  one emphasised action is the empty state's *Write first project update*.
- Competing states: not seen (no project updates, so no health).

### Vercel

**Project overview, Production Deployment card**
(`vercel.com/<team>/<project>`).
- Data: preview image; *Deployment* URL; *Domains*; *Status* (`● Ready`)
  beside *Created*; *Source* (branch, commit). Disclosure: *Deployment
  Settings*, collapsed, with a `3 Recommendations` badge.
- Summary: fields plus one footer sentence naming how to take the next step
  (quoted in pattern 5).
- Actions: **Visit** split button (filled; chevron: *Visit with Toolbar*),
  **Instant Rollback** (outlined), a GitHub icon button, ⋯ (Remove Favorite,
  View Logs disabled, Manage Domains, Transfer Project, Settings | Import
  Directory, View Git Repository).
- Competing states: a security problem is not added to the card. A separate
  *Action Required* notice in the sidebar carries an outlined **Update
  Project** button.

**Vulnerable Dependencies** (`…/<project>/fix/react2shell`, from that
notice). Two steps, each an icon, heading, sentence and control: *Update
Next.js* ("You are running a vulnerable version. Please upgrade
immediately.") expands to **Update with Vercel Agent**; *Deploy Project*
("Redeploy paint-buddy to apply security patches.") shows **Redeploy**,
disabled while step one was open.

**Deployment detail, ready** (`…/<project>/<deployment-id>`).
- Data: *Created*, *Status* (`Ready · Latest`), *Duration*, *Environment*;
  *Domains*; *Source*. Disclosure: collapsed *Build Logs*, *Deployment
  Summary*, *Deployment Checks*, *Assigning Custom Domains*, each with a
  status mark at the right.
- Actions: **Visit** (filled), *Share* and *Logs* (outlined), ⋯.

**Deployment detail, failed build.**
- Data: a *Build Failed* box replaces the preview; *Status* reads `● Error ·
  Stale`; *Build Logs* opens by default with error and warning counts.
- Actions: only **Redeploy** (outlined) and ⋯; nothing is filled. ⋯: Instant
  Rollback, Promote (both disabled) | Redeploy, Copy URL, View All Branch
  Deployments, Skew Protection Threshold (disabled), **Delete** (red, last).

**Deployments list, row ⋯ menu.** One item set on every row; only the
disabled state changes. Current production row: Rollback and Promote
disabled. Older production row: both enabled. Failed preview: both disabled.

### GitHub

**PR sidebar** (`github.com/fimoklei/maestro/pull/1261`).
- Data: *Reviewers*, *Assignees*, *Labels*, *Projects*, *Milestone*,
  *Development*. No disclosure.
- Summary: a field list; an empty section holds a sentence with an inline
  link ("No one—assign yourself").
- Actions: a gear per section edits that section.

**Merge box** (same PR, bottom of Conversation).
- Data: one status row per condition, each an icon, bold headline and
  sub-line: *All checks have passed* / "3 successful checks" (expandable);
  *Checking for the ability to merge automatically…*.
- Summary: the status rows are the summary; no field list.
- Actions: one row. A split button labelled by state (**Enable auto-merge**
  while mergeability was being checked) and a sentence with a link: "You can
  also merge this with the command line." The chevron holds only variants of
  the same action (merge commit, squash, rebase, each with a line of
  explanation).
- Competing states: each condition is its own row above the one action.
  Only the *checking* state was live.

### Renovate

**Dependency Dashboard** (`github.com/fimoklei/maestro/issues/284`).
- Data: updates grouped by state: *Pending Approval*, *Awaiting Schedule*,
  *Open*. Disclosure: *Detected Dependencies*, collapsed per manager.
- Summary: each group opens with one sentence that names its state and what
  its checkboxes do: "To force a retry/rebase of any, click on a checkbox
  below."
- Actions: a checkbox on each update line and an "all at once" checkbox per
  group.
- Competing states: the state picks the verb. An update is in one group, so
  it offers one action.

**Update PR body** (PR #1261): "If you want to rebase/retry this PR, check
this box."

## Fit for Maestro's target pane

Today (`target-menu.ts`, `ui/foot-actions.tsx`): the foot mirrors the ⋮ menu,
and the first enabled item is primary (#1065). Import local edits… leads
only by menu order, because Update target would overwrite the edits. While
an **Unfinished operation** stands and no retry runs, its **Retry update**
(or deploy, removal) shows both in the notice and at the foot.

**Fits**

- **Retry update / deploy / removal — in its notice only** (Vercel *Action
  Required*, GitHub merge-box status rows). The notice already names the
  operation and holds the button.
- **Import local edits… and Update target — ordered steps** (Vercel
  Vulnerable Dependencies). Would make the overwrite risk visible instead of
  implied by order. New behaviour: Update target has no disabled-until-
  imported state today.
- **Update target — beside the release it moves to** (GitHub gear, Renovate
  checkbox). The pane already has a Latest release fact to anchor it.
- **Primary chosen by state, or none** (Vercel deployment detail, GitHub
  merge box). Candidate rule to replace #1065's first-enabled rule.
- **Deploy skill — a quiet action**. It is the one action on offer in every
  state, like Vercel's *Share*/*Logs* or Linear's section `+`; no screen
  made its always-present action primary.
- **View repository on GitHub — an icon, not a foot item** (Vercel's GitHub
  icon button). It navigates; it is not a next step.
- **One next-step sentence instead of a field recap** (Vercel production
  card). "New release available: v0.4.2. 0 of 4 deployed skills changed."
  repeats the Release, Latest release and Changed facts.

**Does not fit**

- **No actions** (Linear peek, issue page). The operator acts in this pane.
- **One Actions button behind ⌘K** (Linear selection bar). Hides the next
  step, the problem #1267 describes.
- **Split button for unrelated actions.** GitHub's and Vercel's chevrons
  hold variants of one action; Import, Deploy and Update are not variants.
- **Checkbox as a trigger** (Renovate). Works only because an issue has no
  buttons.
- **A separate fix page** (Vercel Vulnerable Dependencies). The pane is
  already the detail; ordered steps belong inside it.
- **Stable menu, disabled in place** (Vercel row menus). Conflicts with
  `.claude/rules/design.md`: a ⋮ menu and pane foot list only the actions
  the state calls for. Adopting it would mean changing that rule.

## Not verified

- Netlify was not researched; GitHub and Renovate cover the acceptance bar.
- GitHub's merge box when mergeable, blocked or conflicted.
- Whether Vercel enables **Redeploy** once step one completes, or only when
  it is collapsed.
- Linear project health (*On track* / *At risk*): the test project had no
  updates.
