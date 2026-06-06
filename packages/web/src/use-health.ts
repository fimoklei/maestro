// Server-state hook for the /api/health probe. Server-state belongs to TanStack
// Query, never to a hand-rolled fetch-in-useEffect (see .claude/rules/frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "./api/http";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => requestJson<{ ok?: boolean }>("/api/health"),
  });
}
