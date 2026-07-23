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
      {/* Annotation overlay for handing UI feedback to coding agents. Dev only:
          import.meta.env.DEV is statically false in a production build, so the
          bundler drops the branch.
          endpoint points at the local agentation-mcp server (its default port);
          without it the toolbar keeps annotations in localStorage and no agent
          ever sees them (agentation@3.0.2 dist/index.d.ts, `endpoint` prop). */}
      {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
    </QueryClientProvider>
  </StrictMode>,
);
