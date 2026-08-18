import { defineConfig } from "vitest/config";

// One runner, three lanes (see .claude/rules/testing.md): pure/unit, integration,
// and the web component lane (jsdom, its own config for the React plugin).

// The lanes' worker pools oversubscribe the machine, stretching one test's wall
// time ~10x; the default 5s times that contention, not the code. A project does
// not inherit `test` options from this file's root, so each lane sets its own.
const testTimeout = 20_000;
export default defineConfig({
  test: {
    projects: [
      "./packages/web/vitest.config.ts",
      {
        test: {
          name: "core",
          root: "./packages/core",
          environment: "node",
          include: ["src/**/*.test.ts"],
          testTimeout,
        },
      },
      {
        test: {
          name: "integration",
          root: "./tests/integration",
          environment: "node",
          include: ["**/*.test.ts"],
          testTimeout,
        },
      },
    ],
  },
});
