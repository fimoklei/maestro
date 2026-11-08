# How do comparable products show one item's state across several destinations that deviate in different ways at once?

Serves [#1811](https://github.com/fimoklei/maestro/issues/1811): Global writes
each skill into `~/.claude/skills` and `~/.agents/skills`, and each folder can
deviate on its own. Options under weighing: (A) a skill × folder grid, (B)
per-skill rows that name the deviating folder, (C) per-folder groups listing
their deviating skills. Nothing here is decided.

## Method

Read 2026-11-08. Sources: official docs and READMEs; for Skills Manager also
its README screenshots, `src/i18n/en.json`, `CHANGELOG.md` and
`src-tauri/src/commands/projects.rs` on `main`. No product was installed or
run. Builds on [competitor-landscape-2026](competitor-landscape-2026.md),
[833](833-competitor-update.md) (Behind) and [998](998-ux-principles-2026.md)
§3 and §6. Flux CD was dropped: it reverts drift on its own, so it shows no
lasting per-destination deviation to compare.

## Findings

| Product | Data per item per destination | Roll-up | UI form | Action tied to state | "Newer exists" vs "copy deviates" |
|---|---|---|---|---|---|
| **Argo CD** | Per resource: sync status and health, two columns. `argocd app get` prints `GROUP KIND NAMESPACE NAME STATUS HEALTH`, e.g. `Deployment … OutOfSync Missing` ([getting started](https://argo-cd.readthedocs.io/en/stable/getting_started/)). Sync status: "Whether or not the live state matches the target state" ([core concepts](https://argo-cd.readthedocs.io/en/stable/core_concepts/)). | **Two axes, never merged.** Health is worst-of: "worst health of its immediate child resources", order "Healthy, Suspended, Progressing, Missing, Degraded, Unknown" ([health](https://argo-cd.readthedocs.io/en/stable/operator-manual/health/)). App sync reads `OutOfSync from (1ff8a67)`; the exact sync roll-up rule is *unverified*. Badge carries both ([badge](https://argo-cd.readthedocs.io/en/stable/user-guide/status-badge/)). | App row with two status words; resource tree and table, one row per resource. One app per destination cluster: an ApplicationSet "will produce three new Argo CD `Application` resources: one for each cluster" ([ApplicationSet](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/)). | **Sync**, or selective sync: "only some resources are sync'd" ([selective sync](https://argo-cd.readthedocs.io/en/stable/user-guide/selective_sync/)). | **Folded.** A new Git commit and a live edit both read `OutOfSync`; only the revision beside it tells them apart. |
| **chezmoi** | Per file, two columns: "The first column … the difference between the last state written by chezmoi and the actual state. The second column … between the actual state and the target state" ([status](https://www.chezmoi.io/reference/commands/status/)). Letters A/D/M/R. | None; one line per file, one machine. No cross-machine view. | Two-letter code per row; `chezmoi diff` prints "the difference between the target state and the destination state" ([diff](https://www.chezmoi.io/reference/commands/diff/)). | `apply` "will detect that ~/.zshrc has changed since chezmoi last wrote it and prompt you what to do"; `merge` opens a three-way tool; `re-add` keeps the edit ([FAQ](https://www.chezmoi.io/user-guide/frequently-asked-questions/usage/)). | **Separate columns.** Column 1 = local edits since last write; column 2 = what apply will change, which includes a newer source. |
| **Skills Manager** | Per skill per agent folder: `Local only`, `In sync`, `Local changed`, `Center changed`, `Conflict`; per project skill: `Project only`, `In sync`, `Project newer`, `Center newer`, `Diverged` (`en.json`). | **Worst-of across a skill's copies, then counts.** "a group reporting the most severe status it carries" (CHANGELOG 1.40.0). Order: `diverged` 5 > `project_newer` 4 > `center_newer` 3 > `project_only` 2 > `in_sync` 1 (`projects.rs`). A project counts skills per status; an agent page heads `{{total}} / {{managed}} managed / {{synced}} in sync`. | Library: one card per skill with a row of agent icons, lit or dim, "per-agent sync status … in the bottom-right agent dots" (CHANGELOG 1.22.1). Agent page: the folder's skills, one status chip each (screenshot `agent-workspace.png`). Sidebar lists each agent and project with a count. | Per card: update to center, update to project, "Restore center version". Refuses when copies differ: "`{{count}} variants each may hold content of their own — reconcile them into one before updating the center. Nothing was written.`" | **Separate.** Upstream `Update available` is its own badge on the library card (`updateStatus`); per-copy staleness is `Center changed` inside the sync chip. |
| **Terraform / HCP Terraform** | Per resource: plan symbol, `~ update in-place`; refresh-only output opens "Note: Objects have changed outside of Terraform" ([drift tutorial](https://developer.hashicorp.com/terraform/tutorials/state/resource-drift)). | **Counts.** "the total number of resources in the configuration and the number of resources that have drifted"; checks as "passed, failed, and unknown" counts ([health](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/health)). | Explorer: "Count of drifted resources for each workspace"; workspace list: one "Health warning" status for drift *or* failed checks. | Two fixes on drift: overwrite (apply a plan) or update the configuration to keep the change. | **Separate runs.** Refresh-only shows changes outside Terraform; a normal plan shows config changes. |
| **GitHub Deployments** | Per deployment per environment: `state` one of "`error`, `failure`, `inactive`, `in_progress`, `queued`, `pending`, `success`" ([REST](https://docs.github.com/en/rest/deployments/statuses)). | None across environments. Within one environment a new success marks older ones `inactive` (`auto_inactive`). | Deployments page: "currently active deployments from select environments" and "a timeline of the latest deployments for all environments"; filter by environment; pin up to ten ([history](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/view-deployment-history)). | Per environment: required reviewers, wait timer. | **No "behind".** Only the latest deployment per environment; that main is ahead is *unverified*. Vercel likewise: "The environment's domain points to its latest deployment" ([environments](https://vercel.com/docs/deployments/environments)). |
| **Syncthing** | Per folder: `Up to Date`, `Syncing`, `Local Additions`; "Global State" vs "Local State"; "Out of Sync" = data still to arrive ([GUI](https://docs.syncthing.net/intro/gui)). Per remote device: its own state. | Per folder and per device, side by side; no single verdict. | Folder panels and device panels, each expandable. | "When local changes have been detected Syncthing will show a red 'Revert Local Changes' button on the folder"; send-only shows "Override Changes" ([folder types](https://docs.syncthing.net/users/foldertypes.html)). The button exists only in that state. | **Separate.** Local Additions (own edits) vs Out of Sync (newer data elsewhere). A local edit "will however look out of sync on other devices". |
| **Ansible** | Per host, per category: `ok=3 changed=0 unreachable=0 failed=0 skipped=0 rescued=0 ignored=0` ([playbook](https://docs.ansible.com/ansible/latest/getting_started/get_started_playbook.html)). | **Counts per destination**, no word: "summarizes results of all tasks in the playbook per host". | One recap line per host. | Check mode "runs without making any changes"; `--diff` reports changes ([check mode](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_checkmode.html)). | Not modelled. |

## Strongest patterns

1. **Separate axes beat one merged word.** Argo CD keeps sync and health
   apart; chezmoi keeps "edited since last write" apart from "will change";
   Syncthing keeps Local Additions apart from Out of Sync; Skills Manager keeps
   `Update available` apart from the sync chip. Only Argo CD folds "newer
   exists" into the same word as a deviation, and it prints the revision
   beside it.
2. **Worst-of survives, but only within one axis.** Argo CD (health) and
   Skills Manager (copies of one skill) both reduce by a stated order. Neither
   orders different kinds of problem on one ladder with "behind".
3. **Skills Manager ranks "holds work" first.** Its order puts `diverged` and
   `project_newer` above `center_newer` and `project_only`: a copy that may
   carry edits outranks a copy that is older or absent.
4. **A worst-of row driving an action lost data.** Skills Manager 1.35.1: "The
   card lit 'update to center' if *any* copy was edited, but pushed the copy
   whose agent name sorted first … following the card to 'update to project'
   destroyed the edit." The fix names the copy and refuses when "more than one
   copy of a skill is anything other than in sync".
5. **Counts sit beside a destination, words beside an item.** HCP Terraform
   counts drifted resources per workspace; Ansible counts per host; Skills
   Manager heads each agent folder with `managed / in sync`. Per-item rows
   carry a word or symbol.
6. **No full item × destination matrix as a main view was found.** The
   nearest is Skills Manager's row of agent icons on each card: a one-row grid
   whose cells show presence and sync only, not which deviation.
7. **Actions appear only in the state that needs them**: Syncthing's red
   buttons, chezmoi's prompt on apply, HCP's two drift fixes.

## Reading

**A (grid).** No product read uses it as the main form. Skills Manager's icon
row shows that a grid cell can carry presence, not three kinds of deviation.
With two folders, A is B with two fixed cells. A grid also does not fit the
360px pane with a name, two cells and ⋮ unless the cells hold a mark only.

**B (per-skill rows naming the folder).** Closest to Argo CD's resource table
and Skills Manager's card. Fits `design.md`'s sub-list row: mark, skill name,
machine value (`~/.agents/skills`), ⋮. It answers "which skill, which folder"
on one line, which #1811 says the pane lacks. Lesson from finding 4: an action
on such a row must name the copy it acts on, and refuse when two copies may
both hold work (Maestro's **Copies differ**).

**C (per-folder groups).** Matches Skills Manager's agent page, Ansible's
recap and HCP's per-workspace counts. Strong for the *summary*: a count per
folder (`1 skill missing · 2 with local edits`) on each folder row, so each
folder is named once (#1794 story 42). Weaker for the detail: an edited skill
in both folders appears twice, which is the repetition #1811 complains about.

**Candidate shape (not decided):** C-style counts on each folder row, B-style
skill rows in the Global pane; no grid.

**Roll-up.** Evidence favours a stated order per axis, not one ladder across
kinds. Skills Manager's order (work-holding copies first) argues for **Local
edits** above **Skills missing**, the reverse of the GLOSSARY roll-up today.
Argo CD's two-word row argues for a second axis rather than a stricter ladder.
Action-first is supported only indirectly: no product orders by "has an
action".

**Behind.** Four of the five products that model both keep "newer exists" apart from "this copy
deviates". Candidate: show **Behind** on the Global row as its own axis
(Release cell plus a word or chip), and never let a folder deviation hide it.
Argo CD is the counter-example; it pays by printing the revision.

## Not verified

- Argo CD's rule for rolling resource sync up to the app, and its
  Applications-page filters and counts by sync and health (seen only in third-
  party guides).
- Whether Skills Manager's project card shows per-agent status beside the
  worst-of chip, or presence only. The screenshot shows dims on the icons but
  no per-agent word.
- Whether GitHub or Vercel ever show that a newer commit exists than the one
  an environment runs.
- HCP Terraform's per-resource drift view (which attributes changed); the
  health page only names the count and the two fixes.
- No screen was observed live; every UI claim rests on docs, strings, code or
  a README screenshot.
