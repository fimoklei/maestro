import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cockpitPorts } from "../../scripts/cockpit-ports.mjs";

// Ports belong to the worktree, not to this file: the launcher passes them in,
// and a bare `pnpm --filter @maestro/web dev` derives the same pair here. The
// dev proxy keeps the client<->server HTTP boundary real and CORS-free —
// everything under /api goes to the Hono server on the resolved port.
const ports = cockpitPorts();

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: ports.web,
    // Fail rather than silently move on: a cockpit answering on a port that is
    // not this worktree's would prove the wrong tree in a screenshot.
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${ports.server}`,
    },
  },
});
