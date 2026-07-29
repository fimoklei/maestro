import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Control Room design system: self-hosted fonts (no runtime CDN) + the Tailwind
// v4 token layer. theme.css pulls in Tailwind and the raw tokens; the dark
// default is set via data-theme on <html> in index.html.
import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
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
