import type { BrowseDialogMode } from "./browse-modes";

// Client-only "last folder used" memory for the browse dialog (#149). One key
// per mode, so connect and register remember independently. localStorage
// wrapped so private browsing degrades to "no memory" instead of throwing.
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
