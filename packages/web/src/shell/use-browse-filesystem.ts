// Server-state hook for the read-only filesystem browser (ADR-0009). The
// endpoint is a POST (the Origin/Host guard only covers state-changing
// methods), so this models it as a useQuery keyed by the requested path rather
// than a useMutation — it is a read, just shaped as a POST on the wire.
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// Facts the server observed on disk — never a badge decision. The client
// decides what to badge per mode (issue #150).
export type BrowseEntryFacts = { isGitRepo: boolean; hasSkillsSubdir: boolean };

export type BrowseEntry = {
  name: string;
  path: string;
  facts: BrowseEntryFacts;
};

export type BrowseCrumb = { name: string; path: string };

// `parent` is absent at the home ceiling — that absence is the "up is
// disabled" signal. Breadcrumbs arrive server-derived; the client never
// splits a path itself (issue #146).
type BrowseResponse = {
  path: string;
  parent?: string;
  breadcrumbs: BrowseCrumb[];
  entries: BrowseEntry[];
};

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
