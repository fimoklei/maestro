import { useState } from "react";

// The open/select/close state for a BrowseDialog, shared by every container
// that mounts one (the ⚙ Inventory source view's change-source form, the
// connect gate's connect screen, and the sidebar's `+ repo`) instead of each
// re-declaring the same open flag and handler trio. Consuming
// components still mount <BrowseDialog /> themselves — this only owns the
// state, keeping the JSX (which differs slightly per container's layout) local.
// The dialog confirms a list in both modes (issue #151) — one path in connect,
// every checked repo in register — so the callback takes the list and each
// container decides what to do with it.
// Confirming closes the dialog by default, which is right wherever the
// selection is the whole answer. A host that reports back into the dialog
// (register, issue #175) opts out, and owns dismissing it itself.
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
