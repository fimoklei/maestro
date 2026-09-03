import { defineConfig } from "vitest/config";

// One runner, three lanes (see .claude/rules/testing.md): pure/unit, integration,
// and the web component lane (jsdom, its own config for the React plugin).

// The lanes' worker pools oversubscribe the machine, stretching one test's wall
// time ~10x; the default 5s times that contention, not the code. A project does
// not inherit `test` options from this file's root, so each lane sets its own.
const testTimeout = 20_000;
export default defineConfig({
  test: {
    // Runs once per run, before any lane: a killed run never reaches its
    // `afterEach`, so its temp trees are swept here instead.
    globalSetup: ["./tests/helpers/sweep-temp-trees.ts"],
    // On-demand map of which files never run (`pnpm test:coverage`), no
    // threshold. Without `include` a run reports only the files a test
    // imported, which answers the wrong question (vitest 4.1 coverage docs).
    // `--project` narrows the coverage root to that lane, so these repo-root
    // globs match nothing: measure a single lane with its own config file.
    coverage: {
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.stories.tsx", "**/main.tsx"],
    },
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
