// One entry per mode, so the compiler names every field a new mode owes
// (#156). Server reports facts only, never a badge decision — client decides
// (#150). Inventory badge is a hint; connect validation is the authority.
import type { ReactNode } from "react";
import { Chip } from "../ui/chip";
import type { BrowseEntry } from "./use-browse-filesystem";

export type BrowseDialogMode = "register" | "connect" | "clone-parent";

type BrowseModeConfig = {
  title: string;
  confirmLabel: (count: number) => string;
  // isRegistered resolved by the caller, so a mode ignoring the registry
  // never has to know it exists.
  badges: (context: { entry: BrowseEntry; isRegistered: boolean }) => ReactNode;
  // null for a mode with no write target — states its answer, never inherits silence.
  writePromise: string | null;
};

export const browseModes: Record<BrowseDialogMode, BrowseModeConfig> = {
  register: {
    title: "Select repos to register",
    confirmLabel: (count) => `register ${count} selected →`,
    // A git repo is what this listing is for; only the refusal earns a chip,
    // and browse-entry-row.tsx already writes that one.
    badges: ({ isRegistered }) =>
      isRegistered ? <Chip tone="ok">● registered</Chip> : null,
    writePromise:
      "Registering writes nothing. Writes happen only on an explicit deploy.",
  },
  connect: {
    title: "Select inventory folder",
    confirmLabel: () => "use this folder →",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ inventory</Chip> : null,
    // Read-only promise is made on the connect gate itself (ADR-0015).
    writePromise: null,
  },
  // Picks the folder a clone lands *in*, so the badge marks the one thing that
  // would block it: a Harness already sitting there (#555).
  "clone-parent": {
    title: "Select a folder to clone into",
    confirmLabel: () => "clone into this folder →",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ inventory</Chip> : null,
    writePromise:
      "The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted.",
  },
};
