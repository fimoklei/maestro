import { execFileSync } from "node:child_process";
import { delimiter } from "node:path";
import { defineConfig } from "vitest/config";

// One runner, four lanes (see .claude/rules/testing.md): pure/unit, integration,
// the web component lane (happy-dom, its own config for the React plugin), and git.
// The first three encode an architectural boundary; `git` encodes cost — a file
// that spawns a real repository lands there and stays out of the coding loop.

// Git's exec-path holds the real binary, so the git lane skips macOS's xcrun
// launcher on every spawn (docs/research/1093-git-lane-cost.md).
const gitExecPath = execFileSync("git", ["--exec-path"], {
  encoding: "utf8",
}).trim();
export default defineConfig({
  test: {
    // The slowest test nears the 5s default under load; a worker cap only slowed
    // the suite (docs/research/1095-vitest-worker-cap.md). Inline lanes inherit
    // it (vitest 5); the web lane's config file does not, so it repeats it.
    testTimeout: 20_000,
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
      // `main.tsx` and `server.ts` are composition roots: no test imports them
      // (see .claude/rules/testing.md).
      exclude: [
        "**/*.test.*",
        "**/*.stories.tsx",
        "**/main.tsx",
        "packages/server/src/server.ts",
      ],
    },
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
          name: "git",
          root: "./tests/git",
          environment: "node",
          include: ["**/*.test.ts"],
          env: { PATH: [gitExecPath, process.env.PATH].join(delimiter) },
        },
      },
    ],
  },
});
