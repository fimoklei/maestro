# How do products let a person adopt a shared default, differ from it, and learn that it changed?

Research for #1878 (map #1876). Sources are each product's own documentation, fetched 2026-11-12. "Not found" means the official page does not say.

## Per product

### VS Code

- **Copy or link.** Workspace settings are a link by scope: they live in `.vscode` and "override user settings"; the person's own value stays underneath. Sharing happens through version control: the `.vscode` location "makes it easy to share settings with others in a version-controlled (for example, Git) project."
  https://code.visualstudio.com/docs/configure/settings
- **Existing values.** Kept, but hidden while the workspace value wins ("later scopes override earlier scopes").
  https://code.visualstudio.com/docs/configure/settings
- **Learning of a change.** Recommended extensions: VS Code "prompts a user to install the recommended extensions when a workspace is opened for the first time." A later change in `extensions.json`: not found. Settings changes: no notice found; the new value just applies.
  https://code.visualstudio.com/docs/editor/extension-marketplace
- **Declining.** Per extension, "Ignore Recommendation"; for all, `extensions.ignoreRecommendations`.
  https://code.visualstudio.com/docs/editor/extension-marketplace
- **Offering back.** Whoever edits the files in the repo; the docs describe no separate flow. The command to create the recommended list writes `extensions.json`, and the person adds identifiers by hand.
  https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
- **Profiles (a copy).** Creating a profile from another "creates a copy of the settings in the new profile but does not maintain a link to the profile you used as a source." For import from a file or gist, whether it follows the source: not found.
  https://code.visualstudio.com/docs/configure/profiles

### Linear

- **Copy or link.** Views are shared by scope, not copied: a workspace view "will appear under Workspace views ... available to full members"; a team view is "available within that team ... scope". Display options are a layered default: "Set as default" applies the configuration "to every other user in your workspace", yet "they can always apply their own preferences on top of it."
  https://linear.app/docs/custom-views
  https://linear.app/docs/display-options
- **Existing values.** Personal display choices persist and sit on top of the default (see above).
- **Learning of a change.** Not found for changes to a shared view or default. Members only see a new default "when they first open" the page. Subscriptions notify about issues added to a view, not about the view's definition changing.
  https://linear.app/docs/display-options
  https://linear.app/docs/custom-views
- **Offering back.** Not found. The sharing scope is chosen "when creating the view"; whether a personal view can later be made shared is not stated. Ownership "can be changed to other users".
  https://linear.app/docs/custom-views

### Slack

- **Copy or link.** Sharing a section sends a direct message "with an option to add and customize the section you've shared." Whether it stays in sync with the sender's version: not found. Recipients "can modify sections you've shared with them just like any other section".
  https://slack.com/help/articles/29873996048019-Share-sidebar-sections-in-Slack
- **Existing values.** For user groups: a default channel the person already put in their own section "won't be moved to the new shared custom section." Individual shares: not found.
  https://slack.com/help/articles/29873996048019-Share-sidebar-sections-in-Slack
- **Learning of a change.** Not found.
- **Offering back.** Not found. Any person can share a section of their own with others; no step to replace the original is described.
  https://slack.com/help/articles/360043207674-Customize-your-sidebar-with-sections ("Your custom sections are only visible to you")

### Figma

- **Copy or link.** Link. Admins can set default libraries, which "automatically enables them in every file." An instance "will receive any updates made to the main component." Detach to leave: the instance becomes a frame, "Remove the link to the original component", and "No longer apply any changes".
  https://help.figma.com/hc/en-us/articles/360041051154-Guide-to-libraries-in-Figma
  https://help.figma.com/hc/en-us/articles/360038665754-Detach-an-Instance-from-the-Component/
- **Existing values.** Detach keeps "the current layers and properties". Whether accepting an update overwrites overrides: not found. Library swap keeps supported overrides by default (found in search results from help.figma.com; the swap article itself was not opened).
- **Learning of a change.** After a publish, "people using the library will see a blue badge on the library icon", and can "quickly review the changes".
  https://help.figma.com/hc/en-us/articles/360025508373-Publish-and-manage-libraries
- **Accepting.** Person-by-person review, accept or ignore: stated in search results from help.figma.com; the dedicated article returned 404, so this line is only partly confirmed.
- **Offering back.** Edits stay local: "If you want those changes to be reflected in your library, you will also need to publish those changes to the library." Publishing is the contribution step; each publish "prompts" for a description.
  https://help.figma.com/hc/en-us/articles/360041051154-Guide-to-libraries-in-Figma

### Notion (templates)

- **Copy or link.** Copy. After creating a page from a template "you can make any changes you want to the content that appeared." Repeating templates "automatically create a copy of a template". Whether later template edits reach existing pages: not found.
  https://www.notion.com/help/database-templates
- **Existing values, change signal, offering back.** Not found.

### Obsidian (templates)

- **Copy or link.** Insert at the cursor: "The content of the template is inserted at your current cursor position." The page does not say "copy" or describe a link.
  https://obsidian.md/help/plugins/templates
- **Other points.** Template folder is a setting; sharing across vaults, change signal and offering back: not found.

### Others with a distinct pattern

- **EditorConfig (layered file, closer wins).** Files are read "in the directory of the opened file and in every parent directory", stopping at `root=true`; "properties in closer files take precedence"; "if a property is not specified, the editor settings will be used". Pure link by lookup; no change signal and no offer-back flow. The page says the files "work nicely with version control systems" without saying more.
  https://editorconfig.org/
- **git config (include).** Scopes system, global, local, worktree; "last value found taking precedence". `include.path` inserts another file's contents "as if they had been found at the location of the include directive": a live link by reference, resolved at read time.
  https://git-scm.com/docs/git-config
- **Chrome bookmark import (a copy).** Imported bookmarks go into "Other bookmarks" (or an "Imported" folder on ChromeOS); with none present, onto the bar. Whether it is one-time: not found, but import is a manual file step.
  https://support.google.com/chrome/answer/96816

## Recurring patterns

1. **Two modes exist, and products choose per feature.** Layer or link (VS Code workspace settings, Linear defaults, Figma libraries, EditorConfig, git include) versus copy at one moment (VS Code profile from another profile, Notion templates, Slack shared section by evidence of "add and customize", Chrome import). Only the Figma docs describe an explicit leave-the-link step (Detach).
2. **Personal values survive.** Where the default is layered, the person's value stays underneath or on top. Where copied, the person edits the copy freely. No source found that silently overwrites a personal value; Slack's user-group case explicitly leaves the person's own placement alone.
3. **Change signals are weak or absent.** Only Figma documents one (a badge, then review and accept). VS Code prompts once, on first open. Linear shows the default on next open. For Slack, Notion, Obsidian: not found.
4. **Offering back is a separate, explicit act.** Figma: publish. VS Code: edit the shared files in the repo. Linear and Slack: not found. No product found has an automatic "promote my setting" path.

## What a git-only local tool can use

- **Copy at one moment.** Fits directly: git carries the Harness list; adopting writes a copy into local config. Same shape as VS Code profile copy, Notion templates, Chrome import.
- **Keep your own, the default stays untouched.** Same as VS Code workspace settings sitting beside user settings: both exist, the person's wins locally.
- **Change signal on open, by comparison.** Figma's badge-then-review idea needs only a stored copy of what was adopted and the current Harness list: git can supply both. This is the one documented signal that works without a server. Adopting again would stay an explicit, person-chosen step (Figma "accept or ignore").
- **Offering back via the shared store.** VS Code's flow (edit the shared file in the repo) maps onto a pull request that changes the Harness list; Figma's "publish" is the same explicit act.
- **Not usable without a server:** push notifications, live follow with per-person opt-out of a hosted object (Figma instances, Linear defaults applied at read time over a network). A git include style link (git config) is possible locally but is the live link the earlier decision rejected (#1713).
