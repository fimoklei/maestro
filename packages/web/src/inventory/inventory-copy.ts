import { DEPLOY_SKILL, rereadLabel } from "../ui/control-labels";

// Shown by both gates while the inventory config read is in flight.
export const LOADING_INVENTORY_CONNECTION = "Loading the Inventory connection…";

// The failed Inventory read on every surface that shows it, naming the screen's
// own Re-read; the action rides at the call site.
export const inventoryNotRead = (screen: string) =>
  ({
    level: "error",
    label: "Inventory not read",
    message: `Select ${rereadLabel(screen)} to try again.`,
  }) as const;
export const INVENTORY_NOT_READ = inventoryNotRead("Skills");

export const targetCount = (count: number): string =>
  `${count} ${count === 1 ? "target" : "targets"}`;

// The way out for a target the removal left alone because its files changed.
export const LOCAL_CHANGES_NEXT_STEP = `Select ${DEPLOY_SKILL} to restore the released files. Then remove the skill.`;
