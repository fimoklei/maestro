import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { currentMaxWorkers } from "../../scripts/lib/test-workers.mjs";

// Own config so the React plugin resolves from this package; the root
// vitest.config.ts references it by path.
export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    // Both halve the lane's CPU time and keep per-file isolation.
    environment: "happy-dom",
    pool: "threads",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Must equal the inline lanes': vitest refuses a run that differs (#1699).
    maxWorkers: currentMaxWorkers(),
    testTimeout: 20_000,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
