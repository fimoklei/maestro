import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cockpitPorts } from "../../scripts/cockpit-ports.mjs";

// The launcher passes the worktree's ports in; a bare
// `pnpm --filter @maestro/web dev` derives the same pair here.
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
