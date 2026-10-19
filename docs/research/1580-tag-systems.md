# How tag and label systems are managed

Serves [#1580](https://github.com/fimoklei/maestro/issues/1580), widening
[#1575](https://github.com/fimoklei/maestro/issues/1575) (prompt tools) to
general tag systems. Input to
[#1576](https://github.com/fimoklei/maestro/issues/1576). Decisions so far:
[#1569](https://github.com/fimoklei/maestro/issues/1569) (one category or
none, a `category:` line in front matter, no list file).

**Method.** Read 2026-10-19 from official docs and API references. Nothing
was checked in a live app. Only the Linear text was read raw; other sources
are paraphrased. Secondary sources are marked as such.

## Two models

Every system studied falls into one of two models, and the model decides
almost everything else.

1. **Tag as a record.** The tag has an id, a name and usually a colour.
   Items point to it. A rename edits one record and every item follows.
   Deleting it removes it from items. Managed on a list or settings screen.
   Most also create one inline while tagging. GitHub, Linear, Notion,
   Gmail, Todoist.
2. **Tag as a word on each item.** The tag list is built from the items, and
   a tag exists while something carries it. No built-in rename or merge.
   Renaming means editing every item. Jira, Obsidian, Hugo.

Maestro's #1569 decision is model 2. Its proposal turns "edit every item"
into one reviewed change, which is what Jira's bulk edit and Obsidian's Tag
Wrangler plugin do without review.

## Per system

### GitHub labels (record)

- Name, description, colour. Scoped to one repository; org owners set the
  defaults for new repos. Several per issue.
- Created, edited and deleted only on the repo's **Labels** page, with
  **Edit** and **Delete** at the right of each row. The issue sidebar only
  applies existing labels; the docs describe no inline create.
- Deleting "will remove the label from issues and pull requests". The REST
  `PATCH …/labels/{name}` takes a `new_name`. The docs do not say a rename
  reaches issues; it follows from the record model (labels carry an `id`).
- No merge.
- Sources: [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels),
  [REST labels](https://docs.github.com/en/rest/issues/labels).

### Linear labels (record)

- Name, colour, description (shown on hover). Workspace or team scope;
  sub-teams inherit their parent's labels. Several per issue.
- **Label groups** add one level: "only one label from a given group can be
  applied to an issue at a time."
- Created in *Settings > Workspace > Labels* or *Team settings > Labels*, or
  inline in the *Add label* flow by typing a new name (`Type/Bug` creates
  group and label at once).
- Managed in label settings: "Labels can be edited, merged, and deleted".
  Each row shows where the label is used, "when it was last applied, and how
  many issues have that label". Name and colour edit in the row; right-click
  or the overflow menu holds convert, move and delete. Bulk-select, then
  "merge multiple labels into a single label".
- **Archive** "keeps it on any issues where it's been applied, but stops
  people from using that label moving forward."
- **Delete** "will remove it from issues where it's applied" and cannot be
  undone.
- Filter: team labels with the same name act as one label in multi-team
  filters. Issues and projects group by label or label group; a group can
  be a list column.
- Sources: [Issue properties → Issue labels](https://linear.app/docs/issue-property#issue-labels),
  [Project labels](https://linear.app/docs/project-labels).

### Notion select and multi-select (record in the property schema)

- Options live on the database property (`id`, `name`, `color`,
  `description`). **Select** allows "one option or no option"; multi-select
  zero or more. Names are unique ignoring case; no commas.
- Created inline by typing a name in the cell and pressing Enter (colour
  random). Edited, recoloured, deleted and reordered from the option's `•••`
  menu in the property, or in the property's settings.
- Rename: the option id "stays the same when its name changes in Notion", so
  pages follow. The API cannot rename; it removes an option when you leave it
  out of the list.
- Not confirmed: what deleting an option does to pages that carry it.
- Filter, sort and group by the property.
- Sources: [Database properties](https://www.notion.com/help/database-properties),
  [Property object](https://developers.notion.com/reference/property-object),
  [Update property schema](https://developers.notion.com/reference/update-property-schema-object),
  [Page property values](https://developers.notion.com/reference/page-property-values).

### Gmail labels (record)

- Label resource with an id; messages carry `labelIds`. Several per
  message. Nested labels via *Nest label under*. System labels (`INBOX`)
  reserve their names.
- Created from the sidebar's **+** next to *Labels*, and applied from a
  message's Labels menu. Edit, colour and **Remove label** sit in the ⋯ menu
  on the sidebar row. Settings → Labels only shows or hides labels.
- Delete "removes it from any messages and threads"; the mail stays.
- Not confirmed: the on-screen rename steps (the API updates the record).
- Sources: [Create labels](https://support.google.com/mail/answer/118708),
  [Labels guide](https://developers.google.com/workspace/gmail/api/guides/labels),
  [labels.delete](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/delete).

### Todoist labels (record, with a derived shared list)

- Name and colour. Several per task.
- Created inline in Quick Add (`%`, formerly `@`) or from the sidebar's **+**
  next to *Labels*. Deleted from the ⋯ menu in *Filters & Labels*.
- **Shared labels** come from collaborators and stay listed only while
  active tasks in a shared project carry them. Edits to them "apply to all
  the active tasks".
- A deleted label still shows on completed tasks; uncompleting one recreates
  the label under its old name.
- Not confirmed: what renaming a personal label does to tasks.
- Source: [Introduction to labels](https://www.todoist.com/help/articles/introduction-to-labels-dSo2eE).

### Jira labels (word)

- Free text typed on the issue; several per issue; filter with JQL.
- No native edit: "you can't directly edit labels in Jira Cloud". Rename by
  two bulk edits: add the new label to every issue with the old one, then
  *Find and remove these* for the old one. Rename, merge and delete
  screens come only from Marketplace apps (secondary).
- Not confirmed: a native whole-label delete.
- Source: [Edit and rename labels in Jira Cloud](https://support.atlassian.com/jira/kb/edit-and-rename-labels-in-jira-cloud/).

### Obsidian tags (word, in files)

- Stored in each note: inline `#tag` or a `tags:` list in YAML front matter.
  Several per note. Case-insensitive; the Tags view shows the casing first
  used. `/` nests, and a search for the parent matches children.
- The Tags view lists tags with counts; search with `tag:#name`.
- No built-in tag rename, merge or delete in the official docs. The
  **All properties** view renames a property *name*, not values.
  The community plugin Tag Wrangler renames a tag across files
  (secondary; a forum report says it does not update Bases filters).
- Sources: [Tags](https://obsidian.md/help/tags),
  [Properties](https://obsidian.md/help/properties),
  [Tag Wrangler](https://community.obsidian.md/plugins/tag-wrangler) (secondary).

### Hugo taxonomies (word, in files in git)

- Terms are listed in each page's front matter, always as an array. Hugo
  builds a page for every term and one listing all terms; the docs imply a
  term exists only while content uses it. Optional metadata per term in
  `content/<taxonomy>/<term>/_index.md`.
- No rename: change the front matter of every page.
- Source: [Taxonomies](https://gohugo.io/content-management/taxonomies/).

## Comparison

| System | Model | Per item | Create | Manage rename/delete | Rename reaches items | Merge | Delete does |
|---|---|---|---|---|---|---|---|
| GitHub | record | several | Labels page | Labels page, row buttons | yes (inferred) | no | removes from items |
| Linear | record | several; one per group | settings + inline | label settings, row menu, bulk | yes | yes | removes; archive keeps |
| Notion select | record (schema) | one or none | inline | option `•••` menu | yes (id stays) | no | not confirmed |
| Gmail | record | several | sidebar + | sidebar row ⋯ | yes (record) | no | removes; mail stays |
| Todoist | record | several | inline + sidebar | Filters & Labels ⋯ | shared: yes | no | removes; stays on done tasks |
| Jira | word | several | inline | none native | bulk edit ×2 | no (apps) | bulk remove |
| Obsidian | word in file | several | inline | none native (plugin) | edit each file | no | edit each file |
| Hugo | word in file | several | front matter | none | edit each file | no | edit each file |

## Patterns for Maestro

Maestro: prompts are files in git, the category is a word in front matter,
and every change goes through proposal and release.

1. **Maestro sits with Obsidian and Hugo.** Both keep the tag as a word in
   a file and have no built-in rename. Maestro's **Rename category** does
   what Jira's two-pass bulk edit and Tag Wrangler do, as one reviewed
   proposal.
2. **Merge = rename to an existing name.** Only Linear has a merge action,
   and it needs records. In the word model a rename onto an existing name
   is the merge, as #1569 decided. Notion's case-insensitive unique names
   show where a clash would surface.
3. **One or none has precedent.** Notion **Select** ("one option or no
   option") and Linear label groups (one per group) match Maestro's rule.
4. **Manage on a list, rename and delete in a row menu.** Every record
   system puts rename and delete on a list of tags (GitHub row buttons,
   Linear and Gmail row menus, Todoist ⋯), not in the item form. Linear's
   list also shows each label's issue count and last use, which a derived
   category list can compute from the prompts.
5. **Create inline.** Linear, Notion and Todoist create a tag by typing a new
   name in the picker. That matches the *Category* field with suggestions.
6. **Casing.** Obsidian shows the casing first used; Linear treats
   same-name labels as one in filters; Notion rejects names that differ
   only in case. Maestro picks the spelling most prompts use, which none of
   these does.
7. **"Exists while carried" has precedent.** Todoist's shared labels and
   Hugo terms disappear when nothing carries them. Todoist also shows that
   old items (completed tasks; for Maestro, older releases) keep the old
   name.
8. **What the word model gives up.** Linear's archive (keep on items, block
   new use), colours and descriptions all need a record. Maestro has none,
   so none of these is available without a list file.

## Not confirmed

- GitHub: that a rename reaches issues (inferred from the record model);
  any inline create from the issue sidebar.
- Notion: what deleting an option does to pages.
- Gmail: the on-screen rename steps.
- Todoist: what renaming a personal label does to tasks.
- Jira: a native delete for a label across issues.
- Hugo: that a term exists only while used (implied, not stated).
