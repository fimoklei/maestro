import { defineConfig } from "vitest/config";

// Eén runner, drie banen (zie .claude/rules/testing.md): pure/unit, integratie, acceptatie.
export default defineConfig({
  test: {
    projects: [
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
