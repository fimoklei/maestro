// Shown by both gates while the inventory config read is still in flight; one
// string, so the two cannot drift (copy.md → "Where copy lives").
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The Inventory read that failed, on every surface that shows it: one string,
// so the panel and the Harness location screen cannot drift (copy.md). The
// action rides at the call site.
export const INVENTORY_NOT_READ = {
  level: "error",
  label: "Could not read Inventory",
  message: "Select Re-read Inventory to try again.",
} as const;

// The deploy picker's state line for a skill already deployed on the chosen
// target: a fact about the copy, never a control. Behind is the target's
// Release head reading (ADR-0031, #956).
export const targetSyncLine = (
  reading: "in-sync" | "behind",
  release: string | undefined,
): string => {
  const head = reading === "behind" ? "▲ Behind" : "● In sync";
  return release === undefined ? head : `${head} · ${release}`;
};

// Empty is an offer, not a failure: the heading names what is on offer and the
// action is the one step that fills the list (copy.md → R-B).
export const NO_RELEASED_SKILLS = {
  level: "info",
  label: "No released skills",
  message:
    "Inventory shows skills from the latest release. Open Harness, then create a release to add skills.",
} as const;

// The Inventory's band 2 and table (#1040). Control labels come from
// CONTEXT.md; a blocked control names its cause in five words or fewer.
export const SEARCH_LABEL = "Search the Inventory";
export const REREAD_LABEL = "Re-read Inventory";
export const FILTER_LABEL = "Filter";
export const DISPLAY_LABEL = "Display";
export const NO_SKILLS_YET = "no skills yet";
export const TABLE_LABEL = "Inventory table";
export const STAGE_COLUMN_LABEL = "Select for bulk deploy";
export const stageRowLabel = (name: string) => `Select ${name} for bulk deploy`;

// The group header of rows whose status has not answered yet (CONTEXT.md → Read).
export const NOT_READ_YET = "Not read yet";

export const NO_SEARCH_MATCH =
  "No skills match the search. Clear the search box to see every skill.";
export const NO_FILTER_MATCH =
  "No skills match the filters. Select Filter to show more skills.";

// The row's hover card and detail pane (#1041).
export const deployedToLine = (count: number): string =>
  count === 0
    ? "Not deployed to any target."
    : `Deployed to ${count} ${count === 1 ? "target" : "targets"}`;
export const moreTargetsLine = (more: number, total: number): string =>
  `${more} more. Select the row to see all ${total} targets.`;
export const SOME_TARGETS_NOT_READ = "Some targets could not be read.";
export const NOT_DEPLOYED_ANYWHERE =
  "Not deployed to any target. Choose a target below, then select Deploy skill.";

// The row's ⋮ menu; its items reuse the verbs of CONTEXT.md (#992).
export const ACTIONS_COLUMN_LABEL = "Actions";
export const rowActionsLabel = (name: string) => `Actions for ${name}`;
export const DEPLOY_SKILL = "Deploy skill";
export const REMOVE_SKILL = "Remove skill";
