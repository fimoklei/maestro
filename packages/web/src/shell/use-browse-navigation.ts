import { useEffect, useState } from "react";
import { readLastFolder, writeLastFolder } from "./browse-last-folder";
import type { BrowseDialogMode } from "./browse-modes";
import { isRememberedFolderUnreachable } from "./browse-remembered-error";
import { useBrowseFilesystem } from "./use-browse-filesystem";

// The folder currently being browsed, plus the memory that lets a dialog
// reopen where it was last left for this mode (issue #149) — connect and
// register remember independently. One hook so BrowseDialog stays
// presentational: this owns the requested path, the query for it, and the
// two last-used-folder side effects (fall back once, silently, when the
// remembered folder cannot be reached; remember wherever browsing resolves
// to) rather than the component spreading that logic across inline effects.
export function useBrowseNavigation(mode: BrowseDialogMode) {
  // Captured once at mount so the fallback below doesn't re-read a
  // since-updated value out from under itself.
  const [rememberedRequest] = useState(() => readLastFolder(mode) ?? "");
  // The path being requested; "" asks the server for the home root.
  const [currentRequest, setCurrentRequest] = useState(rememberedRequest);
  const browse = useBrowseFilesystem(currentRequest);

  // Guarded on `currentRequest === rememberedRequest` so this only fires for
  // the initial remembered request — an error reached by navigating (story
  // 22 of #145) still shows the banner instead of being swallowed.
  useEffect(() => {
    if (
      rememberedRequest !== "" &&
      currentRequest === rememberedRequest &&
      isRememberedFolderUnreachable(browse.error)
    ) {
      setCurrentRequest("");
    }
  }, [rememberedRequest, currentRequest, browse.error]);

  // Remember whatever folder the listing resolved to, so next time this
  // mode's dialog opens here instead of back at home.
  useEffect(() => {
    if (browse.data) {
      writeLastFolder(mode, browse.data.path);
    }
  }, [mode, browse.data]);

  return { currentRequest, setCurrentRequest, browse };
}
