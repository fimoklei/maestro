import { defineConfig } from "vitest/config";

// One runner, three lanes (see .claude/rules/testing.md): pure/unit, integration,
// and the web component lane (jsdom, its own config for the React plugin).
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
    ],
  },
});
