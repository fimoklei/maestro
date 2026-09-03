// The one command a teammate runs after `git clone`: checks Node, pnpm and
// apm, prints every gap with the command that closes it, then installs and
// hands off to `pnpm dev`. Never installs a tool itself (#718).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_APM_VERSION = "0.26.0";

function apmInstallLine(platform) {
  return platform === "win32"
    ? "irm https://aka.ms/apm-windows | iex"
    : "curl -sSL https://aka.ms/apm-unix | sh";
}

function commandVersion(run, cmd) {
  try {
    return run(cmd, ["--version"]).trim();
  } catch {
    return null;
  }
}

/** The apm CLI's version out of its banner line ("... version 0.26.0"). */
function apmVersionNumber(banner) {
  return /version (\d+\.\d+\.\d+)/.exec(banner)?.[1] ?? banner;
}

/**
 * Every prerequisite gap, with the exact command that closes it, plus a
 * standalone apm-version warning. `run` and `platform` are the injected seam
 * (prior art: `pidsOnPort`'s injected `lsof` in scripts/port-holders.mjs);
 * `nodeVersion` is passed in rather than read from `process` so the Node
 * check is testable with a fake version too.
 */
export function checkPrerequisites({
  nodeVersion,
  requiredMajor,
  platform,
  run,
}) {
  const gaps = [];

  const nodeMajor = Number(/\d+/.exec(nodeVersion)?.[0]);
  if (!(nodeMajor >= requiredMajor)) {
    gaps.push({
      tool: "Node",
      fix: `Install Node ${requiredMajor} or newer from https://nodejs.org/ (found ${nodeVersion})`,
    });
  }

  if (commandVersion(run, "pnpm") === null) {
    gaps.push({ tool: "pnpm", fix: "Run `corepack enable`" });
  }

  const apmBanner = commandVersion(run, "apm");
  let apmWarning = null;
  if (apmBanner === null) {
    gaps.push({ tool: "apm", fix: `Run \`${apmInstallLine(platform)}\`` });
  } else {
    const apmVersion = apmVersionNumber(apmBanner);
    if (apmVersion !== REQUIRED_APM_VERSION) {
      apmWarning = `apm ${apmVersion} found; Maestro is measured against ${REQUIRED_APM_VERSION} — continuing anyway`;
    }
  }

  return { gaps, apmWarning };
}

/** The refusal to start, one line per gap. */
export function formatGaps(gaps) {
  return [
    "[bootstrap] cannot start — fix these first:",
    ...gaps.map((gap) => `  - ${gap.tool}: ${gap.fix}`),
  ].join("\n");
}

function realRun(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const requiredMajor = Number(
    /\d+/.exec(
      JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).engines
        .node,
    )[0],
  );

  const { gaps, apmWarning } = checkPrerequisites({
    nodeVersion: process.version,
    requiredMajor,
    platform: process.platform,
    run: realRun,
  });

  if (gaps.length > 0) {
    console.error(formatGaps(gaps));
    process.exit(1);
  }

  if (apmWarning !== null) console.warn(`[bootstrap] ${apmWarning}`);

  if (process.argv.includes("--check")) {
    console.log("[bootstrap] Node, pnpm and apm are ready.");
    return;
  }

  if (!existsSync(join(repoRoot, "node_modules"))) {
    execFileSync("pnpm", ["install"], { cwd: repoRoot, stdio: "inherit" });
  }

  execFileSync("pnpm", ["dev"], { cwd: repoRoot, stdio: "inherit" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
