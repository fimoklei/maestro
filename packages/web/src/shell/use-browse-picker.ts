import { useState } from "react";

// The open/select/close state for a BrowseDialog, shared by every container
// that mounts one (the ⚙ Inventory source view's change-source form and the
// wizard's connect and register steps) instead of each re-declaring the same
// open flag and handler trio. Consuming
// components still mount <BrowseDialog /> themselves — this only owns the
// state, keeping the JSX (which differs slightly per container's layout) local.
export function useBrowsePicker(onSelect: (path: string) => void) {
  const [open, setOpen] = useState(false);

  return {
    open,
    openBrowse: () => setOpen(true),
    closeBrowse: () => setOpen(false),
    selectBrowse: (path: string) => {
      onSelect(path);
      setOpen(false);
    },
  };
}
