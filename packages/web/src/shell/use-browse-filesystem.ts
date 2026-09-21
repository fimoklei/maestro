// Read-only filesystem browser (ADR-0009). A useQuery, not useMutation, even
// though the endpoint is a POST — it's a read, just shaped as POST on the wire.
import type { BrowseCrumb, BrowseEntry, BrowseSuccess } from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Type-only re-export so components keep importing from their own package
// (#156); architecture.md forbids importing core values into web.
export type { BrowseCrumb, BrowseEntry };

// `parent` absent = the "up is disabled" signal (home ceiling). Breadcrumbs
// arrive server-derived — the client never splits a path itself (#146).
type BrowseResponse = BrowseSuccess;

export function useBrowseFilesystem(path: string) {
  return useQuery({
    queryKey: ["filesystem", "children", path],
    queryFn: () =>
      requestJson<BrowseResponse>("/api/filesystem/children", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  });
}
