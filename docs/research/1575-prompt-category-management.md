# How prompt tools let you create, rename, merge and delete categories

Serves [#1575](https://github.com/fimoklei/maestro/issues/1575), feeding
[#1576](https://github.com/fimoklei/maestro/issues/1576): what a prompt
category holds, how many a prompt takes, where it is created, and what
renaming, merging or deleting it does. Read 2026-10-19 from official docs, API
references and public source code (Langfuse at `d07952ca`, Agenta at
`c27e6e67`, ray.so at `453d481f`); nothing was observed live. "Unconfirmed"
means no primary source was found, not that the feature is missing.
*Inference* marks a Maestro-side reading of a source, not a source claim.

One row per organizer: several tools have two. Left out because they pick a
version, not a group: Langfuse labels, LangSmith commit tags, PromptLayer
release labels, Braintrust environments. Also left out: PromptLayer
request-log tags, which label log rows, not prompts.

PromptHub (prompthub.us) has no public docs on grouping; its help centre
returns 404 and the app needs a login. Raycast's "prompt library" can mean
two things, so both are covered: **AI Commands** (your own prompts, in the
app) and **ray.so/prompts** (Raycast's curated Prompt Explorer).

## Comparison

| Organizer | Holds | Per prompt | Create (where) | Rename | Merge | Delete | Versioned |
|---|---|---|---|---|---|---|---|
| **Langfuse folder** | A `/`-separated prefix of the prompt name; nests [1] | One (it is the name) [1] | Type a `/` in the prompt name field [1] | None: the prompts router has no rename or move procedure [9]. **Duplicate folder** (Actions column on the folder row) copies to a new path, latest or all versions [8][3] | Absent | Trash icon on the folder row → dialog lists the prompts, says it deletes "all prompts inside it recursively", type the folder path to enable **Delete** [7][3] | Not applicable: the folder is part of the name, which no version changes |
| **Langfuse tag** | Name only (string) [5] | Several [4] | Inline popover in the prompt list's **Tags** column and on the prompt detail page; type a new name to create it [3][4][10]. Not in the New prompt form [11]. The list of tags is computed from the prompts; no registry exists [5]. List search covers tags [2] | None found [9] | Absent. The picker compares case-insensitively, so it won't offer to create a case variant of an existing tag [4] | Per prompt only: remove from the popover. No project-wide delete found [9] | **No.** A tag edit rewrites every version of the prompt ("tags are consistent across versions"); only an audit-log entry records it [6][12] |
| **LangSmith resource tag** | Key + value, each with an optional description; no colour documented [13][15] | Several: up to 100 value IDs at creation [13]. Two values of one key: unconfirmed | **Settings → Resource tags → New Tag**, admin permission; resources can be assigned in the same panel [13]. A permission to tag a prompt at creation exists [17]. Tags on prompts enable filtering in the UI [14] | API: `PATCH` on a key or a value [15][16]. UI rename unconfirmed. *Inference:* resources point at the value's ID, so a rename reaches every tagged prompt | Absent | Trash icon next to a key or value on **Settings → Resource tags**. A deleted value loses all its resource links; a deleted key takes its values [13]. Un-assign: trash icon in the tag or resource panel [13] | Unconfirmed. *Inference:* tags sit outside prompt commits [19] |
| **LangSmith prompt-repo `tags`** | Free-text strings on the prompt repo [18] | Several (array) [18] | API `PATCH` on the repo [18]. UI unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| **PromptLayer folder** | Name + parent; nests; name unique per level [21] | One (`folder_id`) [20] | Sidebar: **New item** in an empty folder (2026-03-10) [26]; API `POST /folders` [21]. Folder-creation UI otherwise unconfirmed | API `PATCH /folders/{id}` renames; a duplicate name at that level is refused [22]. UI rename unconfirmed. Move: sidebar drag-and-drop (2026-05-15) [26] or API [23] | Absent; renaming onto a taken name is refused [22] | API: a non-empty folder is refused unless `cascade=true`, which deletes everything inside (soft delete where applicable) [24]. UI unconfirmed | Not documented |
| **PromptLayer tag** | String [20] | Several: "Tags to attach to the prompt registry entry" [20] | API publish call [20]; API list filters by tags (2026-03-10) [25][26]. UI unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed | Not documented. *Inference:* tags sit on the registry entry, not the version [20] |
| **Braintrust tag** | Project tag: name, colour, description, sort position [27][28]. On a prompt: plain strings [30] | Several (array) [30] | Prompt form **Tags** field [29]; **Settings → Tags → Add tag** registers one with colour and description [27]. Whether the prompt field draws on the registry: unconfirmed | API `PATCH` on a project tag (name, description, colour) [28]. Whether prompts carrying the old name change: unconfirmed | Absent. Creating a tag whose name exists returns the existing tag unchanged [31] | API delete exists [31]. Effect on prompts: unconfirmed | Docs: "Every change to a prompt creates a new version" [32]. A tag-only edit is not named |
| **Agenta folder** | Name + slug + parent; nests [33][34] | One (`folder_id` on the prompt) [34][38] | Prompts page: **Create new → New folder** [33]; breadcrumb menu **New folder** [36] | **Rename** in the folder row's ⋯ menu and in the breadcrumb menu [35][36]. Also **Move** [35] | Absent | **Delete** in the row or breadcrumb menu [35][36]. Dialog names only the folder: "This action is not reversible." [37]. Prompts stay and move to the root (`ON DELETE SET NULL`) [38] | *Inference from schema:* no. `folder_id` sits on the prompt record, not its revisions [38] |
| **PromptHub group** | Unconfirmed. The project object carries `groups: []` [40] | Array, so possibly several [40]. UI unconfirmed | Unconfirmed. The list API filters by group [39] | Unconfirmed | Unconfirmed | Unconfirmed | *Inference:* no; `groups` sits on the project, not the commit [40] |
| **Raycast AI Command tags** | "Free-form labels" [41] | Unconfirmed for AI Commands. Snippets: "one or more" [42] | **Tags** field in the Create/Edit AI Command form; filter in **Search AI Commands** [41]. Snippets: type a new name to create, or pick an existing one [42] | Unconfirmed | Unconfirmed | Unconfirmed | Not documented |
| **ray.so/prompts category** | Name, slug, icon, list of prompts; the prompt record has no category field [43] | One, by which category's list holds it [43] | In code, by Raycast; users only browse. **New** is computed: prompts from the last 14 days [43] | Code edit | Code edit | Code edit | **Yes**, through git commits on the repo [43] |

## What this means for the prototype ticket

Counts are over the 11 organizers above.

1. **Several labels per prompt is the common shape** (Langfuse, LangSmith,
   PromptLayer and Braintrust tags; Raycast tags; PromptHub groups likely).
   **One per prompt comes from folders** (Langfuse, PromptLayer, Agenta) and
   from editorial categories (ray.so). Maestro's one-or-none rule matches the
   folder group, without the nesting.
2. **Creating from the prompt form or an inline picker is common**
   (Langfuse tags and folders, Braintrust, Raycast). A **separate Settings
   screen is rare**: LangSmith and Braintrust only, the two where a tag
   carries more than a name (description, colour). Braintrust offers both
   [27][29].
3. **Renaming a whole category exists only where the category is its own
   record** (Agenta, PromptLayer, LangSmith, Braintrust; ray.so in code).
   **It is absent for a label that is just text on the prompt with the list
   computed from the prompts**: Langfuse tags, the closest match to Maestro's
   model, offer no rename or project-wide delete [5][9]. Raycast:
   unconfirmed.
4. **Merge as an action is absent everywhere.** Name clashes are refused
   (PromptLayer [22]), folded into the existing record (Braintrust [31]) or
   steered away from in the picker, ignoring case (Langfuse [4]).
5. **Delete splits three ways:** it deletes the prompts (Langfuse folder;
   PromptLayer with `cascade`) [7][24], it un-files them (Agenta, LangSmith)
   [38][13], or it is not offered for the category as a whole (Langfuse
   tags) [9]. Only Langfuse names the affected prompts in its confirm
   dialog [7]. Agenta's dialog does not say the prompts survive [37].
6. **Whether a category change creates a version** is documented as "no"
   once (Langfuse tags) [6], *inferred* "no" for Agenta, PromptLayer,
   LangSmith and PromptHub, possibly "yes" in Braintrust [32], and "yes" only
   in ray.so, where categories live in code [43]. No tool records a category
   change in the prompt's version history the way Maestro's
   proposal-and-release path would.
7. **Where actions sit:** category-wide rename and delete live in a menu on
   the category itself (Agenta row ⋯ menu and breadcrumb [35][36]; Langfuse
   folder-row icons [3]) or on a Settings list (LangSmith [13]). No tool
   found puts category rename inside the prompt form.

## Sources

1. Langfuse, Prompt Folders — https://langfuse.com/docs/prompt-management/features/folders
2. Langfuse changelog, search for prompts (2025-07-01) — https://langfuse.com/changelog/2025-07-01-search-for-prompts
3. Langfuse `prompts-table.tsx` L395–436 (Tags cell, folder-row actions) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/components/prompts-table.tsx#L395-L436
4. Langfuse `TagManager.tsx` L53–62 (case-insensitive create check) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/tag/components/TagManager.tsx#L53-L62
5. Langfuse `promptRouter.ts` L465–490 (`filterOptions`: tags = distinct values over all prompts) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/server/routers/promptRouter.ts#L465-L490
6. Langfuse `createPrompt.ts` L212–225 ("tags are consistent across versions") — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/server/actions/createPrompt.ts#L212-L225
7. Langfuse `delete-folder.tsx` L78–90, L162 — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/components/delete-folder.tsx#L78-L162
8. Langfuse `duplicate-folder.tsx` — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/components/duplicate-folder.tsx
9. Langfuse `promptRouter.ts`, full procedure list (no rename, move or tag-delete procedure) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/server/routers/promptRouter.ts
10. Langfuse `prompt-detail.tsx` L437 (tag popover on the detail page) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/components/prompt-detail.tsx#L437
11. Langfuse `NewPromptForm/index.tsx` (no tags field) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/components/NewPromptForm/index.tsx
12. Langfuse `promptRouter.ts` L1106–1150 (`updateTags`: audit log, `updateMany` across versions) — https://github.com/langfuse/langfuse/blob/d07952ca9da9827ce2ea2c060d08027faacd8545/web/src/features/prompts/server/routers/promptRouter.ts#L1106-L1150
13. LangSmith, Set up resource tags — https://docs.langchain.com/langsmith/set-up-resource-tags
14. LangSmith, Administration overview (resource tags on prompts enable filtering) — https://docs.langchain.com/langsmith/administration-overview
15. LangSmith API, Update tag key — https://docs.langchain.com/langsmith/smith-api/workspaces/update-tag-key
16. LangSmith API, Update tag value — https://docs.langchain.com/langsmith/smith-api/workspaces/update-tag-value
17. LangSmith, Organization and workspace operations (`prompts:tag_on_create`) — https://docs.langchain.com/langsmith/organization-workspace-operations
18. LangSmith API, Update repo (`tags`) — https://docs.langchain.com/langsmith/smith-api/repos/update-repo
19. LangSmith, Manage prompts (commits and commit tags) — https://docs.langchain.com/langsmith/manage-prompts
20. PromptLayer API, Publish Prompt Template (`tags`, `folder_id`) — https://docs.promptlayer.com/reference/templates-publish
21. PromptLayer API, Create Folder — https://docs.promptlayer.com/reference/create-folder
22. PromptLayer API, Update Folder — https://docs.promptlayer.com/reference/update-folder
23. PromptLayer API, Move Folder Entities — https://docs.promptlayer.com/reference/move-folder-entities
24. PromptLayer API, Delete Folder Entities — https://docs.promptlayer.com/reference/delete-folder-entities
25. PromptLayer API, List Prompt Templates (`tags` filter) — https://docs.promptlayer.com/reference/list-prompt-templates
26. PromptLayer changelog (2026-03-10 inline item creation and tag filter; 2026-05-15 sidebar drag-and-drop) — https://docs.promptlayer.com/changelog
27. Braintrust, Manage projects (Add tags) — https://www.braintrust.dev/docs/admin/projects
28. Braintrust API, Partially update project_tag — https://www.braintrust.dev/docs/api-reference/projecttags/partially-update-project_tag
29. Braintrust, Create prompts — https://www.braintrust.dev/docs/evaluate/prompts/create
30. Braintrust API, Partially update prompt (`tags`) — https://www.braintrust.dev/docs/api-reference/prompts/partially-update-prompt
31. Braintrust API, Create project_tag and Delete project_tag — https://www.braintrust.dev/docs/api-reference/projecttags/create-project_tag · https://www.braintrust.dev/docs/api-reference/projecttags/delete-project_tag
32. Braintrust, Version prompts — https://www.braintrust.dev/docs/evaluate/prompts/versions
33. Agenta changelog, Folders for Prompt Organization (2026-02-04) — https://agenta.ai/docs/changelog/prompt-folders
34. Agenta API guide, Folders — https://agenta.ai/docs/reference/api-guide/folders
35. Agenta `usePromptsColumns.tsx` L66–140 (row menus) — https://github.com/agenta-ai/agenta/blob/c27e6e673977615fe0eaf22a33ecd9ad03a25132/web/oss/src/components/pages/prompts/hooks/usePromptsColumns.tsx#L66-L140
36. Agenta `PromptsBreadcrumb.tsx` L110–185 (breadcrumb menu) — https://github.com/agenta-ai/agenta/blob/c27e6e673977615fe0eaf22a33ecd9ad03a25132/web/oss/src/components/pages/prompts/components/PromptsBreadcrumb.tsx#L110-L185
37. Agenta `DeleteFolderModal.tsx` L22–52 — https://github.com/agenta-ai/agenta/blob/c27e6e673977615fe0eaf22a33ecd9ad03a25132/web/oss/src/components/pages/prompts/modals/DeleteFolderModal.tsx#L22-L52
38. Agenta migration `f6a7b8c9d0e1` (`folder_id` on artifact tables, `ON DELETE SET NULL`) — https://github.com/agenta-ai/agenta/blob/c27e6e673977615fe0eaf22a33ecd9ad03a25132/api/oss/databases/postgres/migrations/core/versions/f6a7b8c9d0e1_add_folder_id_to_workflow_artifacts.py
39. PromptHub homepage ("Filter by group, model, provider") — https://www.prompthub.us/
40. PromptHub, OpenAI integration guide (response with `project.groups`) — https://www.prompthub.us/blog/prompthub-openai-integration-guide
41. Raycast manual, AI Commands — https://manual.raycast.com/ai/ai-commands
42. Raycast manual, Snippets (Tags) — https://manual.raycast.com/snippets
43. ray.so `prompts.ts` L1342–1443 (categories) — https://github.com/raycast/ray-so/blob/453d481f4d3adcf7f1e922752daa12392f45a6ba/app/%28navigation%29/prompts/prompts.ts#L1342-L1443
