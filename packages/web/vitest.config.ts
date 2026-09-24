import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The web test lane: component tests in happy-dom with Testing Library. Kept in
// its own config so the React plugin resolves from this package; the root
// vitest.config.ts references it by path (see .claude/rules/testing.md).
export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    // Both halve the lane's CPU time and keep per-file isolation
    // (docs/research/1096-web-lane-setup-cost.md).
    environment: "happy-dom",
    pool: "threads",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Matches the other lanes' timeout; see the root vitest.config.ts.
    testTimeout: 20_000,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
