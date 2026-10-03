# Where comparable tools let an owner remove a published item

Serves [#1336](https://github.com/fimoklei/maestro/issues/1336): where an
author starts deleting a released skill, and what they are told. Read
2026-10-03 from official docs only; nothing was observed live. Where a doc is
silent, the cell says "not documented". Statements marked *inference* are
Maestro-side reading, not a source claim.

Skipped: Anthropic Agent Skills has no removal flow of its own in the docs
read; skills reach Claude Code through plugin marketplaces, covered below.
JetBrains Marketplace and Artifact Hub were not sourced deeply enough to
include.

## Comparison

| Tool | Owner list data points | Entrance | Confirmation | Impact shown | Delete vs deprecate | Undo |
|---|---|---|---|---|---|---|
| **npm** | Not documented for an owner list. The unpublish gate reads dependents, last-week downloads (< 300) and owner count [1] | Package page → **Settings** tab → **Delete package** or **Deprecate package** [2][3] | Type the package name [2][3] | Gate, not display: if the package fails the criteria, **Delete package** is absent and the owner is prompted to deprecate [2] | Both. Deprecate is the recommended path: a message the owner writes shows on every install and on the package page; a deprecated package leaves website search [1][3] | Unpublish cannot be undone; the name is blocked 24 h; a used `name@version` never returns [1][2]. Undeprecate: `npm deprecate <pkg> ""` [3] |
| **GitHub repo** | Not sourced | Repo **Settings** → **Danger Zone** [4][5] | Delete: **I want to delete this repository** → **I have read and understand these effects** → type the name [4]. Archive: type the name → **I understand the consequences, archive this repository** [5] | Warnings: team permissions deleted permanently; deleting a private repo deletes its forks [4] | Archive = read-only for everyone, with a banner; docs advise closing issues and updating the README first [5] | Unarchive from the same zone [5]. Deleted repos restorable for 90 days, except in a fork network; team permissions are not restored [6] |
| **GitHub Actions Marketplace** | Not sourced | The **release**: edit it, clear **Publish this Action to the GitHub Marketplace**, **Update release** — the same control that published it [7] | Not documented beyond **Update release** [7] | Not documented [7] | No deprecate state documented [7] | Not documented |
| **VS Code Marketplace** | Publisher manage page per extension: Acquisition Trend, Total Acquisition, Ratings & Reviews (**More Actions → Reports**) [8] | Publisher manage page → **More Actions → Unpublish** or **More Actions → Remove**; also `vsce unpublish` [8] | Remove: type the extension name [8]. Unpublish: not documented | Not shown in the flow. Unpublish keeps statistics; Remove deletes them [8] | Three tiers: deprecate (by request in a GitHub discussion; strike-through, yellow warning, **migrate** button to a named alternative), unpublish (status **Unpublished**, no downloads), remove [8] | Remove is irreversible and the name is reserved forever [8]. Unpublish reversal not documented |
| **Backstage catalog** | Entity `spec.lifecycle`: `experimental`, `production`, `deprecated` ("may disappear at a later point in time") [9]. Orphan status in an info box on the entity page [10] | Entity page **three-dots menu** → **Unregister entity** [10][11] | Dialog "Are you sure you want to unregister this entity?" → **Unregister Location** / **Cancel**; **Advanced Options** → **Delete Entity** [12] | Lists every entity that goes with it: "This action will unregister the following entities:" + "Located at the following location:" [12] | Unregister keeps `catalog-info.yaml` for later re-registration; delete requires removing that file first, or the entity "will reappear shortly" [11][12]. Deprecate = a source-file field [9] | "To undo, just re-register the entity" [12] |
| **Claude Code plugin marketplace** | No owner UI: `marketplace.json` is the list [13] | Edit `marketplace.json` in the repo: delete the entry, map its name to `null` in `renames`, optionally set `forceRemoveDeletedPlugins`, push [14] | `claude plugin validate .` rejects a broken `renames` chain [14] | Consumer side only: `Removed from the "<marketplace>" marketplace`. With force: uninstalled, listed under **Flagged** as `Removed from marketplace`. Without: stays installed and reports `Plugin "<name>" not found in marketplace` [14] | "There is no deprecation state." [14] | `renames` is append-only history [14]. Re-adding not documented |
| **APM** | Not documented | Author: `apm marketplace package remove NAME` removes the entry from the `marketplace:` block in `apm.yml` [15]. Consumer: delete from `apm.yml` + `apm prune`, or `apm uninstall` [16] | Author command prompts unless `--yes` [15]. `apm prune --dry-run` previews [16] | Not documented for consumers of a removed package [15][16] | None documented | Not documented |
| **Terraform Registry (public)** | Not sourced | Module page → **Manage Module** dropdown [17] | Not documented [17] | Docs warn: removal "will break the configuration of any individuals using that version" [18] | "We do not recommend removing anything from the Registry unless it contains a critical flaw" [17] | Not documented |
| **HCP Terraform private registry** | Not sourced | Delete: module page → **Delete module**, pick scope (this version / all versions for a provider / everything) [19]. Deprecate: **Manage module for organization** dropdown [20] | Delete: type the module name → **Delete** [19]. Deprecate: optional **Reason for module deprecation** and **Link to additional information** → **Deprecate** [20] | Deprecation warns consumers in run output, with the owner's reason [20]. Deleting a Git tag does not remove a version; deleting the last version removes the module [19] | Deprecate (warn), revoke (Premium: blocks new consumers), delete [20][19] | **Revert module version deprecation** → **Revert Deprecation** [20]. Delete: not documented |
| **Helm** | Not sourced | A release: set `deprecated` in `Chart.yaml`, bump the version, release, then remove the chart from source [21] | Not applicable (repository workflow) | Not documented | Deprecation travels as a release; latest version deprecated = chart deprecated [21] | Publish a newer non-deprecated version to reuse the name [21] |

## Patterns

1. **The entrance lives on the item, behind an owner gate.** npm and GitHub
   put delete on the item's own public page, in an owner-only **Settings**
   tab [2][4]; Terraform and Backstage put it in a menu on the item page
   [17][10]. No tool found starts a deletion from a "pick which item" dialog.
   → Strongest precedent for **C**.
2. **A publisher list with a per-row action exists once: VS Code.** Its manage
   page lists every extension with usage numbers and a **More Actions** menu
   that holds Unpublish and Remove [8]. → The precedent for **B**; note it
   carries usage data on each row, which B would invite.
3. **Name-based removal is a command, not a screen.** `vsce unpublish <id>`,
   `npm unpublish <name>`, `apm marketplace package remove NAME` [8][2][15].
   → **A** resembles these; it has no GUI precedent in this set.
4. **Typing the name is the standard confirm** for irreversible removal (npm,
   GitHub, VS Code Remove, HCP Terraform) [2][4][8][19]. Where removal is a
   source change (Claude Code, Helm), the check moves to validation and
   release instead [14][21]. *Inference:* a deletion that becomes a reviewed
   pull request sits in the second group; a typed-name gate may be redundant.
5. **Impact is shown as "what else goes with it", or used as a gate.**
   Backstage lists every entity unregistered together [12]; GitHub names
   forks and permissions [4]; npm silently withholds delete when dependents or
   downloads exist [1]. → Whichever entrance wins, the confirm step should
   name the affected consumers it can source.
6. **A softer step is offered first almost everywhere**, and it carries an
   owner-written message: npm deprecation text, Terraform reason + link,
   VS Code named alternative with **migrate** [3][20][8]. Claude Code
   marketplaces are the explicit exception [14]. → A reason or replacement
   field in the flow can ride into the PR body.
7. **Consumers learn about removal where they consume**: Claude Code's
   **Flagged** list, npm install warnings, Terraform run warnings, VS Code
   strike-through [14][3][20][8]. → The consumer catalogue (Inventory) needs a
   removed/removing state regardless of where the author starts.
8. **Undo is either a grace period, a lock, or re-adding the source.** GitHub
   90-day restore [6]; npm and VS Code lock names [1][8]; Backstage re-register
   [12]; Claude Code keeps `renames` history [14]. *Inference:* for a deletion
   merged as a pull request, `git revert` plus a new release is the undo.

## Sources

1. npm Unpublish Policy — https://docs.npmjs.com/policies/unpublish
2. Unpublishing packages from the registry — https://docs.npmjs.com/unpublishing-packages-from-the-registry
3. Deprecating and undeprecating packages — https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions
4. Deleting a repository — https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository
5. Archiving repositories — https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories
6. Restoring a deleted repository — https://docs.github.com/en/repositories/creating-and-managing-repositories/restoring-a-deleted-repository
7. Publishing actions in GitHub Marketplace — https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace
8. Publishing Extensions (VS Code) — https://code.visualstudio.com/api/working-with-extensions/publishing-extension
9. Backstage descriptor format — https://backstage.io/docs/features/software-catalog/descriptor-format
10. Backstage, the life of an entity — https://backstage.io/docs/features/software-catalog/life-of-an-entity
11. Backstage, unregistering and deleting a component — https://backstage.io/docs/getting-started/unregister-delete-component/
12. Backstage `catalog-react` dialog strings — https://github.com/backstage/backstage/blob/master/plugins/catalog-react/src/translation.ts
13. Claude Code marketplace reference — https://code.claude.com/docs/en/plugins/marketplace-reference
14. Claude Code, host and maintain a marketplace — https://code.claude.com/docs/en/plugins/host-marketplace
15. `apm marketplace` CLI reference — https://microsoft.github.io/apm/reference/cli/marketplace/
16. APM, manage dependencies — https://microsoft.github.io/apm/consumer/manage-dependencies/
17. Terraform Registry, publishing modules — https://developer.hashicorp.com/terraform/registry/modules/publish
18. Terraform Registry FAQ — https://developer.hashicorp.com/terraform/registry/faq
19. HCP Terraform, publish private modules — https://developer.hashicorp.com/terraform/cloud-docs/registry/publish-modules
20. HCP Terraform, manage module versions — https://developer.hashicorp.com/terraform/cloud-docs/registry/manage/module-versions
21. Helm, charts (Deprecating Charts) — https://helm.sh/docs/topics/charts/
