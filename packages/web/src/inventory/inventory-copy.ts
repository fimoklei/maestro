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
