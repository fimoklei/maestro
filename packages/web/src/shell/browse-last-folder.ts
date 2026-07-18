import type { BrowseDialogMode } from "./browse-modes";

// Client-only "last folder used" memory for the browse dialog (issue #149).
// One key per mode — connect and register remember independently, so
// re-pointing the Inventory source never dumps the user in their repos
// folder, or vice versa (issue #145, story 5). Never sent to the server; the
// dialog only ever feeds the remembered path back in as an ordinary browse
// request. localStorage access is wrapped so a disabled/unavailable store
// (private browsing) degrades to "no memory" instead of throwing.
const storageKey = (mode: BrowseDialogMode) =>
  `maestro.browse.lastFolder.${mode}`;

export function readLastFolder(mode: BrowseDialogMode): string | null {
  try {
    return window.localStorage.getItem(storageKey(mode));
  } catch {
    return null;
  }
}

export function writeLastFolder(mode: BrowseDialogMode, path: string): void {
  try {
    window.localStorage.setItem(storageKey(mode), path);
  } catch {
    // Best-effort — losing the memory is not worth surfacing an error.
  }
}
