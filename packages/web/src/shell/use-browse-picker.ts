import { useState } from "react";

// Open/select/close state for a BrowseDialog, shared by every container that
// mounts one. The dialog closes on select.
export function useBrowsePicker(onSelect: (paths: string[]) => void) {
  const [open, setOpen] = useState(false);

  return {
    open,
    openBrowse: () => setOpen(true),
    closeBrowse: () => setOpen(false),
    selectBrowse: (paths: string[]) => {
      onSelect(paths);
      setOpen(false);
    },
  };
}
