// Shown by both gates while the inventory config read is still in flight; one
// string, so the two cannot drift (copy.md → "Where copy lives").
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The Inventory read that failed, on every surface that shows it. One string,
// so the panel and the Harness location screen cannot drift (copy.md → "Where
// copy lives"). The action rides at the call site: only the panel has to supply
// its own control, the Harness location screen already has one below the notice.
export const INVENTORY_NOT_READ = {
  level: "error",
  label: "Inventory not read",
  message: "Re-read Inventory to try again.",
} as const;

// Empty is an offer, not a failure: the heading names what is on offer and the
// action is the one step that fills the list (copy.md → R-B).
export const NO_RELEASED_SKILLS = {
  level: "info",
  label: "No released skills",
  message:
    "Inventory shows released skills only. Creating a release on the Harness view will fill it.",
} as const;
