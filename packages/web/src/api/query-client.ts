// No retries and no re-read on window focus (#1037). Deploy-state's rows opt
// back into focus in their own query options.
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
}
