// Server-state hook for the read-only filesystem browser (ADR-0009). The
// endpoint is a POST (the Origin/Host guard only covers state-changing
// methods), so this models it as a useQuery keyed by the requested path rather
// than a useMutation — it is a read, just shaped as a POST on the wire.
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type BrowseEntry = { name: string; path: string };

type BrowseResponse = { path: string; entries: BrowseEntry[] };

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
