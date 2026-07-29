// One entry per mode, so the compiler names every field a new mode owes
// (#156). Server reports facts only, never a badge decision — client decides
// (#150). Inventory badge is a hint; connect validation is the authority.
import type { ReactNode } from "react";
import { Chip } from "../ui/chip";
import type { BrowseEntry } from "./use-browse-filesystem";

export type BrowseDialogMode = "register" | "connect";

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
    badges: ({ entry, isRegistered }) => (
      <>
        {entry.facts.isGitRepo ? <Chip tone="dim">git</Chip> : null}
        {isRegistered ? <Chip tone="ok">● registered</Chip> : null}
      </>
    ),
    writePromise:
      "Registering writes nothing. Writes happen only on an explicit deploy, and touch only the chosen primitive plus apm's bookkeeping.",
  },
  connect: {
    title: "Select inventory folder",
    confirmLabel: () => "use this folder →",
    badges: ({ entry }) =>
      entry.facts.hasSkillsSubdir ? (
        <Chip tone="drift">◆ inventory</Chip>
      ) : null,
    // Read-only promise is made on the connect gate itself (ADR-0015).
    writePromise: null,
  },
};
