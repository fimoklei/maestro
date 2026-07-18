import { useState } from "react";
import type { BrowseEntry } from "./use-browse-filesystem";

// Narrows the current folder's entries as the user types (issue #149). The
// reset-on-navigate is adjusted during render rather than an Effect — React's
// documented pattern for state that depends on another value changing — so a
// stale filter from the previous folder never hides an unrelated folder's
// entries.
export function useFolderFilter(
  currentRequest: string,
  entries: BrowseEntry[] | undefined,
) {
  const [filter, setFilter] = useState("");
  const [filterFolder, setFilterFolder] = useState(currentRequest);
  if (filterFolder !== currentRequest) {
    setFilterFolder(currentRequest);
    setFilter("");
  }

  const visibleEntries = (entries ?? []).filter((entry) =>
    entry.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return { filter, setFilter, visibleEntries };
}
