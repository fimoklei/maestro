import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "./api/query-client";
import { App } from "./app";
// The token layer; index.html stamps data-theme on <html> before first paint.
import "./styles/theme.css";

// A maintainer's opt-in, never on for users: every user runs `pnpm dev`, and
// agentation's licence is not open source.
const Agentation =
  import.meta.env.VITE_AGENTATION === "1"
    ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
    : null;

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing in index.html");
}

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {Agentation && (
        <Suspense fallback={null}>
          {/* Omitting `endpoint` silently degrades to localStorage-only, no
              agent ever sees it (agentation@3.0.2, `endpoint` prop). */}
          <Agentation endpoint="http://localhost:4747" />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
);
