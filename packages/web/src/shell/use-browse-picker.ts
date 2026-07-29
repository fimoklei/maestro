import { useState } from "react";

// Open/select/close state for a BrowseDialog, shared by every container that
// mounts one. Callback takes a list — one path in connect, every checked repo
// in register (#151). closeOnSelect: false lets register report back in-dialog (#175).
export function useBrowsePicker(
  onSelect: (paths: string[]) => void,
  { closeOnSelect = true }: { closeOnSelect?: boolean } = {},
) {
  const [open, setOpen] = useState(false);

  return {
    open,
    openBrowse: () => setOpen(true),
    closeBrowse: () => setOpen(false),
    selectBrowse: (paths: string[]) => {
      onSelect(paths);
      if (closeOnSelect) {
        setOpen(false);
      }
    },
  };
}
