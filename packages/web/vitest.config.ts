import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The web test lane: component tests in jsdom with Testing Library. Kept in its
// own config so the React plugin resolves from this package; the root
// vitest.config.ts references it by path (see .claude/rules/testing.md).
export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
