// Single-instance dev launcher: keeps only one Maestro running at a time, and
// with --smoke, runs an ephemeral, isolated rehearsal environment (ADR-0010).
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(repoRoot, ".maestro-dev.pid");
const serverPort = process.env.PORT ?? "3000";
const webPort = "5173";
const smoke = process.argv.includes("--smoke");

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // group already gone, or pid was never a group leader
  }
}

function pidsOnPort(port) {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" })
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    // lsof exits non-zero when nothing listens on the port — nothing to free.
    return [];
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 1. Kill the previous dev launcher's process group (pidfile = "the note").
if (existsSync(pidFile)) {
  const previous = Number(readFileSync(pidFile, "utf8").trim());
  if (Number.isInteger(previous) && previous > 0 && isAlive(previous)) {
    console.log(`[dev] evicting previous dev run (pid ${previous})`);
    killGroup(previous, "SIGTERM");
  }
  rmSync(pidFile, { force: true });
}

// 2. Fallback: free the ports in case something unrelated still holds them.
let freedSomething = false;
for (const port of [serverPort, webPort]) {
  for (const pid of pidsOnPort(port)) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[dev] freeing port ${port} (pid ${pid})`);
      freedSomething = true;
    } catch {
      // already gone
    }
  }
}
if (freedSomething) {
  sleep(300); // let the OS release the sockets before we rebind
}

// 3. Start server + web as one detached group so we can kill the whole tree.
const env = { ...process.env };
const sandbox = join(repoRoot, ".maestro-sandbox");

function wipeSandbox() {
  rmSync(sandbox, { recursive: true, force: true });
}

if (smoke) {
  // Bare start: wipe any sandbox left behind by a run that died before
  // teardown, so smoke always begins from a clean, unconfigured state.
  wipeSandbox();

  env.MAESTRO_HOME = sandbox;
  // apm derives its global (user-scope) location from HOME, not MAESTRO_HOME,
  // so a global deploy would otherwise write into the real ~/.apm and
  // ~/.claude/skills. Redirect HOME too, so smoke isolates the tools Maestro
  // drives as well as Maestro's own state (.claude/rules/apm-driver.md).
  env.HOME = join(sandbox, "home");
  mkdirSync(env.HOME, { recursive: true });
  console.log(
    `[smoke] MAESTRO_HOME=${env.MAESTRO_HOME} HOME=${env.HOME} (isolated from real data)`,
  );

  // Only this dev-tooling harness bridges credentials to apm — the product
  // never does (.claude/rules/security.md). gh's token is HOME-independent,
  // so it survives the redirect above and lets a real deploy clone succeed.
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
    }).trim();
    if (token) {
      env.GITHUB_TOKEN = token;
      console.log("[smoke] bridged GITHUB_TOKEN from gh auth token");
    } else {
      console.warn(
        "[smoke] gh not authenticated — connect/register/UI work, but a real deploy will fail",
      );
    }
  } catch {
    console.warn(
      "[smoke] gh not authenticated — connect/register/UI work, but a real deploy will fail",
    );
  }

  // A bare temp consuming repo as a valid deploy target. Left unregistered:
  // connect + registration stay UI use-cases the rehearsal exercises.
  const consumingRepo = join(sandbox, "consuming-repo");
  mkdirSync(consumingRepo, { recursive: true });
  execFileSync("git", ["init"], { cwd: consumingRepo, stdio: "ignore" });
  console.log(`[smoke] seeded temp consuming repo at ${consumingRepo}`);
}

const child = spawn(
  "pnpm",
  [
    "exec",
    "concurrently",
    "-n",
    "server,web",
    "-c",
    "blue,green",
    "pnpm --filter @maestro/server dev",
    "pnpm --filter @maestro/web dev",
  ],
  { cwd: repoRoot, stdio: "inherit", detached: true, env },
);

writeFileSync(pidFile, String(child.pid));

function teardownSandbox() {
  if (!smoke) return;
  // Best-effort: never apm uninstall -g (it deletes beyond its lockfile —
  // apm-driver.md). Because HOME points into the sandbox, wiping it cannot
  // touch the real ~/.claude or ~/.apm.
  wipeSandbox();
}

function shutdown() {
  killGroup(child.pid, "SIGTERM");
  rmSync(pidFile, { force: true });
  teardownSandbox();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => {
  rmSync(pidFile, { force: true });
  teardownSandbox();
  process.exit(code ?? 0);
});
