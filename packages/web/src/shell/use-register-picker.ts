import { useMemo } from "react";
import { useRegisterRepos } from "../registry/use-register-repos";
import { useRegistry } from "../registry/use-registry";
import { useBrowsePicker } from "./use-browse-picker";

// Everything a container needs to mount the browse picker in register mode:
// the open/close state, the registration run, and the already-registered set
// the picker badges on. The two containers that do this — the wizard's
// register step (issue #97) and the sidebar (issue #163) — differ only in
// where the button sits, so the wiring lives here rather than being declared
// twice and drifting apart. `useBrowsePicker` owns the same seam one level
// down for the browsing state alone; this is its register-mode counterpart.
export function useRegisterPicker() {
  const registry = useRegistry();
  const registerSelection = useRegisterRepos();
  const browse = useBrowsePicker(
    (paths) => registerSelection.registerRepos(paths),
    // The picker reports the run itself (issue #175), so it stays open past
    // confirm and the host never dismisses it on the user's behalf.
    { closeOnSelect: false },
  );
  const repos = registry.data?.repos ?? [];
  // Client-side join for the picker's "● registered" badge (issue #150) — the
  // server stays registry-agnostic; a stale set just skips the badge, it never
  // blocks a registration.
  const registeredPaths = useMemo(
    () => new Set(repos.map((repo) => repo.path)),
    [repos],
  );

  return {
    repos,
    open: browse.open,
    openPicker() {
      // The previous run's report would otherwise greet a session that is
      // about to browse.
      registerSelection.reset();
      browse.openBrowse();
    },
    // Spread onto <BrowseDialog>: every prop the register mode needs, so a new
    // one reaches both containers at once.
    dialogProps: {
      mode: "register",
      registeredPaths,
      onSelect: browse.selectBrowse,
      onClose: browse.closeBrowse,
      outcomes: registerSelection.outcomes,
      isRegistering: registerSelection.isRegistering,
    },
  } as const;
}
