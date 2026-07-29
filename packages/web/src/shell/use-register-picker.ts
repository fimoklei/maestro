import { useMemo } from "react";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useRegisterRepos } from "../registry/use-register-repos";
import { useRegistry } from "../registry/use-registry";
import { useBrowsePicker } from "./use-browse-picker";

// Register-mode counterpart to useBrowsePicker: open/close state, the
// registration run, and the already-registered set the picker badges on.
export function useRegisterPicker() {
  const registry = useRegistry();
  const inventory = useInventoryConfig();
  const registerSelection = useRegisterRepos();
  const browse = useBrowsePicker(
    (paths) => registerSelection.registerRepos(paths),
    // The picker reports the run itself (#175), so it stays open past confirm.
    { closeOnSelect: false },
  );
  const repos = registry.data?.repos ?? [];
  // Client-side join for the "● registered" badge (#150) — a stale set just
  // skips the badge, never blocks a registration.
  const registeredPaths = useMemo(
    () => new Set(repos.map((repo) => repo.path)),
    [repos],
  );

  return {
    repos,
    open: browse.open,
    openPicker() {
      // Otherwise the previous run's report greets the next browse.
      registerSelection.reset();
      browse.openBrowse();
    },
    dialogProps: {
      mode: "register",
      registeredPaths,
      inventoryPath: inventory.data?.inventoryPath ?? undefined,
      onSelect: browse.selectBrowse,
      onClose: browse.closeBrowse,
      outcomes: registerSelection.outcomes,
      isRegistering: registerSelection.isRegistering,
    },
  } as const;
}
