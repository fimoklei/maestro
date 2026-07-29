import { useEffect, useState } from "react";
import { readLastFolder, writeLastFolder } from "./browse-last-folder";
import type { BrowseDialogMode } from "./browse-modes";
import { isRememberedFolderUnreachable } from "./browse-remembered-error";
import { useBrowseFilesystem } from "./use-browse-filesystem";

// The folder currently being browsed, plus per-mode last-used memory (#149).
// One hook so BrowseDialog stays presentational.
export function useBrowseNavigation(mode: BrowseDialogMode) {
  // Captured once at mount so the fallback below doesn't re-read a
  // since-updated value out from under itself.
  const [rememberedRequest] = useState(() => readLastFolder(mode) ?? "");
  // "" asks the server for the home root.
  const [currentRequest, setCurrentRequest] = useState(rememberedRequest);
  const browse = useBrowseFilesystem(currentRequest);

  // Guarded to the initial remembered request — an error reached by
  // navigating (#145) still shows the banner instead of being swallowed.
  useEffect(() => {
    if (
      rememberedRequest !== "" &&
      currentRequest === rememberedRequest &&
      isRememberedFolderUnreachable(browse.error)
    ) {
      setCurrentRequest("");
    }
  }, [rememberedRequest, currentRequest, browse.error]);

  useEffect(() => {
    if (browse.data) {
      writeLastFolder(mode, browse.data.path);
    }
  }, [mode, browse.data]);

  return { currentRequest, setCurrentRequest, browse };
}
