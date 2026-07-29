import { useState } from "react";
import type { BrowseEntry } from "./use-browse-filesystem";

// Narrows the current folder's entries as the user types (#149). Reset is
// adjusted during render, not an Effect (react.dev/learn/you-might-not-need-an-effect).
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
