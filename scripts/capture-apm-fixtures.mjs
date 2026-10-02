// Re-runs each single-command apm fixture against the installed apm, every
// case in its own sandbox HOME, and compares it with the committed file.
// Writes to .logs/apm-captures/ only; overwriting a fixture is the reader's call.
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { checkQuota } from "./github-quota.mjs";

const THROTTLE_LINE = "GitHub API rate limit hit";

/** The capture with the sandbox home written as `/Users/dev`, as committed. */
export function normalizeHome(text, home) {
  return text
    .replaceAll(home, "/Users/dev")
    .replaceAll(home.replaceAll("/", "-"), "-Users-dev");
}

// A fixture with no reader may open with `#` notes and the `$` command line;
// apm's own timings change on every run.
const comparable = (text) => {
  const lines = text
    .replace(/ in \d+(\.\d+)?s\b/g, " in <t>s")
    .split("\n")
    .map((line) => line.trimEnd());
  const start = lines.findIndex((line) => !/^(# |\$ )/.test(line));
  return start === -1 ? "" : lines.slice(start).join("\n").trimEnd();
};

/** How one capture relates to its committed fixture. */
export function verdict({ text, exit, expectedExit, committed }) {
  if (committed === null) return "new";
  if (text.includes(THROTTLE_LINE)) return "throttled";
  if (exit !== expectedExit) return "exit-mismatch";
  return comparable(text) === comparable(committed) ? "same" : "differs";
}

const REF = "github.com/fimoklei/agent-harness/skills/tdd";
const REF6 = "github.com/fimoklei/agent-harness/.apm/skills/tdd";
const REF47 = "github.com/fimoklei/agent-harness/.apm/skills/47";

// One row per fixture; setup runs authed and its output is discarded.
const cases = [
  {
    name: "apm-install-ok.txt",
    capture: ["authed", ["install", `${REF}#v0.5.0`, "-t", "claude"]],
    exit: 0,
  },
  {
    name: "apm-install-no-changes.txt",
    setup: (s) => s.apm(["install", `${REF47}#v0.6.0`, "-t", "claude,codex"]),
    capture: ["authed", ["install", `${REF47}#v0.6.0`, "-t", "claude,codex"]],
    columns: 200,
    exit: 0,
  },
  {
    name: "apm-install-probes-failed.txt",
    capture: ["anon", ["install", `${REF}#v0.5.0`, "-t", "claude"]],
    exit: 1,
  },
  {
    name: "apm-install-symlink-refused.txt",
    setup: (s) => {
      mkdirSync(join(s.home, ".claude/skills"), { recursive: true });
      symlinkSync("/nonexistent", join(s.home, ".claude/skills/tdd"));
    },
    cwd: "neutral",
    capture: ["authed", ["install", `${REF}#v0.5.1`, "-g", "-t", "claude"]],
    exit: 1,
  },
  {
    name: "apm-view-versions.txt",
    capture: ["authed", ["view", "fimoklei/agent-harness", "versions"]],
    stdoutOnly: true,
    exit: 0,
  },
  {
    name: "apm-view-auth-failed.txt",
    capture: ["anon", ["view", "fimoklei/agent-harness", "versions"]],
    stdoutOnly: true,
    exit: 1,
  },
  {
    name: "apm-outdated-could-not-check.txt",
    setup: (s) => s.apm(["install", `${REF}#v0.5.0`, "-t", "claude"]),
    capture: ["anon", ["outdated"]],
    columns: 200,
    stdoutOnly: true,
    exit: 0,
  },
  {
    name: "apm-outdated-global.txt",
    cwd: "neutral",
    setup: (s) => s.apm(["install", `${REF}#v0.5.0`, "-g", "-t", "claude"]),
    capture: ["authed", ["outdated", "-g"]],
    columns: 200,
    stdoutOnly: true,
    exit: 0,
  },
  {
    name: "apm-outdated-global-uptodate.txt",
    cwd: "neutral",
    setup: (s) => s.apm(["install", `${REF6}#v0.6.0`, "-g", "-t", "claude"]),
    capture: ["authed", ["outdated", "-g"]],
    columns: 200,
    stdoutOnly: true,
    exit: 0,
  },
  {
    name: "apm-update-noop.txt",
    setup: (s) => s.apm(["install", `${REF}#v0.5.0`, "-t", "claude"]),
    capture: ["authed", ["update", "-y", "-t", "claude,codex"]],
    columns: 120,
    exit: 0,
  },
  {
    name: "apm-targets-claude.json",
    setup: (s) => mkdirSync(join(s.repo, ".claude")),
    capture: ["anon", ["targets", "--json"]],
    stdoutOnly: true,
    exit: 0,
  },
  // Three uninstalls in one repo, in this order.
  {
    name: "apm-uninstall-dry-run.txt",
    setup: (s) => {
      s.apm(["install", `${REF}#v0.5.1`, "-t", "claude,codex"]);
      s.apm([
        "install",
        "github.com/fimoklei/agent-harness/skills/47#v0.5.1",
        "-t",
        "claude,codex",
      ]);
    },
    capture: ["anon", ["uninstall", "--dry-run", "-v", `${REF}#v0.5.1`]],
    columns: 200,
    exit: 0,
  },
  {
    name: "apm-uninstall-ok.txt",
    sameSandbox: true,
    capture: ["anon", ["uninstall", "-v", `${REF}#v0.5.1`]],
    columns: 200,
    exit: 0,
  },
  {
    name: "apm-uninstall-not-found.txt",
    sameSandbox: true,
    capture: ["anon", ["uninstall", `${REF}#v0.5.1`]],
    columns: 200,
    exit: 1,
  },
  {
    name: "apm-uninstall-retained.txt",
    setup: (s) => {
      s.apm(["install", `${REF}#v0.5.1`, "-t", "claude,codex"]);
      appendFileSync(join(s.repo, ".claude/skills/tdd/SKILL.md"), "edit\n");
    },
    capture: ["anon", ["uninstall", "-v", `${REF}#v0.5.1`]],
    columns: 200,
    exit: 1,
  },
  {
    name: "apm-uninstall-global-ok.txt",
    cwd: "neutral",
    setup: (s) => {
      mkdirSync(join(s.home, ".claude/skills/other"), { recursive: true });
      writeFileSync(join(s.home, ".claude/skills/other/SKILL.md"), "x\n");
      s.apm(["install", `${REF}#v0.5.1`, "-g", "-t", "claude,codex"]);
    },
    capture: ["anon", ["uninstall", "-g", "-v", `${REF}#v0.5.1`]],
    columns: 200,
    exit: 0,
  },
];

// Covers every install, view and outdated above with room for apm's retries.
const QUOTA_NEEDED = 30;

function baseEnv() {
  const env = { ...process.env, NO_COLOR: "1" };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_APM_PAT", "COLUMNS"]) {
    delete env[key];
  }
  return env;
}

function sandbox(root, token) {
  const home = realpathSync(mkdtempSync(join(root, "h")));
  const repo = join(home, "repo");
  const neutral = join(home, "neutral");
  mkdirSync(repo);
  mkdirSync(neutral);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const env = (auth, columns) => ({
    ...baseEnv(),
    HOME: home,
    ...(auth === "authed"
      ? { GITHUB_APM_PAT: token, GITHUB_TOKEN: token }
      : { GIT_TERMINAL_PROMPT: "0" }),
    ...(columns ? { COLUMNS: String(columns) } : {}),
  });
  const box = { home, repo, neutral, env, cwd: repo };
  box.apm = (args) => {
    const run = spawnSync("apm", args, {
      cwd: box.cwd,
      env: env("authed"),
      stdio: "ignore",
    });
    if (run.status !== 0)
      throw new Error(`setup failed: apm ${args.join(" ")}`);
  };
  return box;
}

// Both streams share one descriptor so they interleave as apm wrote them.
function capture(box, row, file) {
  const [auth, args] = row.capture;
  const fd = openSync(file, "w");
  const run = spawnSync("apm", args, {
    cwd: box.cwd,
    env: box.env(auth, row.columns),
    stdio: ["ignore", fd, row.stdoutOnly ? "ignore" : fd],
  });
  closeSync(fd);
  const text = normalizeHome(readFileSync(file, "utf8"), box.home);
  writeFileSync(file, text);
  return { text, exit: run.status };
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const quota = await checkQuota(QUOTA_NEEDED);
  if (!quota.ok) {
    console.error(
      `anonymous GitHub quota: ${quota.remaining ?? "unknown"} left, need ${QUOTA_NEEDED}; resets ${quota.resetAt ?? "unknown"}. Captures taken now would hold the rate-limit line.`,
    );
    process.exit(1);
  }
  const token = execFileSync("gh", ["auth", "token"], {
    encoding: "utf8",
  }).trim();
  const outDir = join(repoRoot, ".logs/apm-captures");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const root = mkdtempSync(join(tmpdir(), "apm-cap."));
  console.log(execFileSync("apm", ["--version"], { encoding: "utf8" }).trim());

  let box;
  let failed = false;
  try {
    for (const row of cases) {
      if (!row.sameSandbox) {
        box = sandbox(root, token);
        box.cwd = row.cwd === "neutral" ? box.neutral : box.repo;
      }
      const fixture = join(repoRoot, "tests/fixtures", row.name);
      const committed = existsSync(fixture)
        ? readFileSync(fixture, "utf8")
        : null;
      let result;
      try {
        row.setup?.(box);
        result = verdict({
          ...capture(box, row, join(outDir, row.name)),
          expectedExit: row.exit,
          committed,
        });
      } catch (error) {
        result = `error: ${error.message}`;
      }
      if (result !== "same" && result !== "differs") failed = true;
      console.log(`${result.padEnd(14)} ${row.name}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(`captures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
