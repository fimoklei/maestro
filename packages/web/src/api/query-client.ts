// No retries and no re-read on window focus (#1037). Deploy-state's view opts
// its own rows back in where it reads them.
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
}
