import { defineConfig } from "vitest/config";

// One runner, four lanes (see .claude/rules/testing.md): pure/unit, integration,
// acceptance, and the web component lane (jsdom, its own config for the React
// plugin).
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
        },
      },
      {
        test: {
          name: "integration",
          root: "./tests/integration",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
      {
        test: {
          name: "acceptance",
          root: "./tests/acceptance",
          environment: "node",
          include: ["**/*.steps.ts"],
        },
      },
    ],
  },
});
