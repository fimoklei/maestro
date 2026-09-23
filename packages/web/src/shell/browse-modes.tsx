// One entry per mode, so the compiler names every field a new mode owes
// (#156). Server reports facts only, never a badge decision — client decides
// (#150). Inventory badge is a hint; connect validation is the authority.
import type { ReactNode } from "react";
import { Chip } from "../ui/chip";
import type { BrowseEntry } from "./use-browse-filesystem";

export type BrowseDialogMode = "connect" | "clone-parent";

type BrowseModeConfig = {
  title: string;
  confirmLabel: string;
  badges: (context: { entry: BrowseEntry }) => ReactNode;
  // null for a mode with no write target — states its answer, never inherits silence.
  writePromise: string | null;
};

export const browseModes: Record<BrowseDialogMode, BrowseModeConfig> = {
  connect: {
    title: "Choose an Inventory folder",
    confirmLabel: "Use this folder",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ Inventory</Chip> : null,
    // Read-only promise is made on the connect gate itself (ADR-0015).
    writePromise: null,
  },
  // Picks the folder a clone lands *in*, so the badge marks the one thing that
  // would block it: a Harness already sitting there (#555).
  "clone-parent": {
    title: "Choose a folder for the Harness",
    confirmLabel: "Clone into this folder",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ Inventory</Chip> : null,
    writePromise:
      "The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted.",
  },
};
