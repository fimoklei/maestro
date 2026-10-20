import type { HarnessChange } from "@maestro/core";

/** What a change does, in the one word every screen uses for it. */
// "Deleted", never "Removed": remove belongs to deployed copies alone.
export const CHANGE_WORD: Record<HarnessChange, string> = {
  addition: "Added",
  edit: "Changed",
  rename: "Renamed",
  deletion: "Deleted",
};
