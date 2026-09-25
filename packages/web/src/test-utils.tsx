import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createQueryClient } from "./api/query-client";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A fresh client per render with the cockpit's own read rules (#1037).
// Passed as `wrapper` so the provider survives `rerender`.
export function renderWithQuery(ui: ReactNode) {
  const queryClient = createQueryClient();
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
