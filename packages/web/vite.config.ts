import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev-proxy houdt de client<->server HTTP-grens echt en CORS-vrij: alles onder
// /api gaat naar de Hono-server. Leest dezelfde env-var (PORT) als server.ts,
// zodat een niet-default poort niet uit elkaar loopt.
const serverPort = process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://localhost:${serverPort}`,
    },
  },
});
