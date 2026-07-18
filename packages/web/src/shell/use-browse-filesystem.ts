// Server-state hook for the read-only filesystem browser (ADR-0009). The
// endpoint is a POST (the Origin/Host guard only covers state-changing
// methods), so this models it as a useQuery keyed by the requested path rather
// than a useMutation — it is a read, just shaped as a POST on the wire.
import type {
  BrowseCrumb,
  BrowseEntry,
  BrowseEntryFacts,
  BrowseSuccess,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";

// The wire shape is owned by core, which produces it — re-exported here so the
// dialog's components keep importing it from their own package (issue #156).
// Type-only: `verbatimModuleSyntax` erases these, so no core runtime code
// reaches the browser bundle. Values from core stay off-limits to web
// (`.claude/rules/architecture.md`).
export type { BrowseCrumb, BrowseEntry, BrowseEntryFacts };

// The same type the route binds its response to (issue #156), so the client
// cannot read a field the server never agreed to send.
//
// `parent` is absent at the home ceiling; that absence is the "up is disabled"
// signal. Breadcrumbs arrive server-derived, so the client never splits a path
// itself (issue #146).
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
