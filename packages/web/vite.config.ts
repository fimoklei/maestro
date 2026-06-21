import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev proxy keeps the client<->server HTTP boundary real and CORS-free:
// everything under /api goes to the Hono server. Reads the same env var (PORT)
// as server.ts so a non-default port does not drift apart.
const serverPort = process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      "/api": `http://localhost:${serverPort}`,
    },
  },
});
