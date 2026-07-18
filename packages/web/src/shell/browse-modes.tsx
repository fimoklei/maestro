// Everything the browse picker does differently per mode, in one place: a
// mode is one entry in this record, so the compiler names every field a new
// mode still owes (issue #156).
//
// The server reports per-entry facts only — is a git repo, has a skills/
// subdir — never a badge decision; the client decides (issue #150). Register
// mode badges `git` repos and already-registered ones; connect mode badges
// folders that look like an inventory. The inventory badge is a hint, not a
// guarantee — connect validation remains the authority.
import type { ReactNode } from "react";
import { Chip } from "../ui/chip";
import type { BrowseEntry } from "./use-browse-filesystem";

export type BrowseDialogMode = "register" | "connect";

type BrowseModeConfig = {
  // Both the dialog heading and its accessible name.
  title: string;
  // What the confirm button reads with `count` paths currently selected.
  confirmLabel: (count: number) => string;
  // The row's badges. `isRegistered` is resolved by the caller so a mode that
  // ignores the registry never has to know it exists.
  badges: (context: { entry: BrowseEntry; isRegistered: boolean }) => ReactNode;
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
  },
  connect: {
    title: "Select inventory folder",
    confirmLabel: () => "use this folder →",
    badges: ({ entry }) =>
      entry.facts.hasSkillsSubdir ? (
        <Chip tone="drift">◆ inventory</Chip>
      ) : null,
  },
};
