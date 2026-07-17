import { Chip } from "../ui/chip";
import type { BrowseDialogMode } from "./browse-dialog";
import type { BrowseEntry } from "./use-browse-filesystem";

// Mode-aware badges for one browse row (issue #150): the server only reports
// per-entry facts (is a git repo, has a skills/ subdir) — never a badge
// decision. Register mode badges `git` repos and already-registered ones;
// connect mode badges folders that look like an inventory. The inventory
// badge is a hint, not a guarantee — connect validation remains the
// authority. Tested transitively through browse-dialog.test.tsx, the same
// pattern as the sibling BrowseBreadcrumbs component.
export function EntryBadges({
  mode,
  entry,
  registeredPaths,
}: {
  mode: BrowseDialogMode;
  entry: BrowseEntry;
  registeredPaths?: ReadonlySet<string>;
}) {
  if (mode === "register") {
    return (
      <>
        {entry.facts.isGitRepo ? <Chip tone="dim">git</Chip> : null}
        {registeredPaths?.has(entry.path) ? (
          <Chip tone="ok">● registered</Chip>
        ) : null}
      </>
    );
  }
  return entry.facts.hasSkillsSubdir ? (
    <Chip tone="drift">◆ inventory</Chip>
  ) : null;
}
