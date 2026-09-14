// One entry per mode, so the compiler names every field a new mode owes
// (#156). Server reports facts only, never a badge decision — client decides
// (#150). Inventory badge is a hint; connect validation is the authority.
import type { ReactNode } from "react";
import { Chip } from "../ui/chip";
import type { BrowseEntry } from "./use-browse-filesystem";

export type BrowseDialogMode =
  | "register"
  | "connect"
  | "clone-parent"
  | "import-source";

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
    title: "Register repositories",
    confirmLabel: (count) =>
      `Register ${count} ${count === 1 ? "repository" : "repositories"}`,
    // A git repo is what this listing is for; only the refusal earns a chip,
    // and browse-entry-row.tsx already writes that one.
    badges: ({ isRegistered }) =>
      isRegistered ? <Chip tone="ok">● Registered</Chip> : null,
    writePromise:
      "Registering changes no files. Files change only when you deploy.",
  },
  connect: {
    title: "Choose an Inventory folder",
    confirmLabel: () => "Use this folder",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ Inventory</Chip> : null,
    // Read-only promise is made on the connect gate itself (ADR-0015).
    writePromise: null,
  },
  // Picks the skill folder itself, so the badge marks a folder that already
  // looks like a harness — a skill never is one (#576).
  "import-source": {
    title: "Choose a skill folder",
    confirmLabel: () => "Import this folder",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ Inventory</Chip> : null,
    writePromise:
      "Import copies this folder to the Working Harness. The original folder stays unchanged.",
  },
  // Picks the folder a clone lands *in*, so the badge marks the one thing that
  // would block it: a Harness already sitting there (#555).
  "clone-parent": {
    title: "Choose a folder for the Harness",
    confirmLabel: () => "Clone into this folder",
    badges: ({ entry }) =>
      entry.facts.hasApmManifest ? <Chip tone="drift">◆ Inventory</Chip> : null,
    writePromise:
      "The Harness is cloned into a new folder here, named after the repository. Nothing already in this folder is renamed, moved or deleted.",
  },
};
