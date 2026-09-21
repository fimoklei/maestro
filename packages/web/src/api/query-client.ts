// The cockpit's read rules in one place (#1037, design.md → "Waiting and
// freshness"): a failed read states itself at once instead of after three
// silent retries, and switching windows re-reads nothing. Deploy-state's rows
// opt back into focus in their own query options.
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
}
