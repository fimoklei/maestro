import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// The token layer (ADR-0033): Tailwind, the raw tokens, the self-hosted Geist
// faces. index.html stamps data-theme on <html> before first paint.
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing in index.html");
}

const queryClient = new QueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* Dev only (bundler drops this branch in prod). Omitting `endpoint`
          silently degrades to localStorage-only, no agent ever sees it
          (agentation@3.0.2, `endpoint` prop). */}
      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </QueryClientProvider>
  </StrictMode>,
);
