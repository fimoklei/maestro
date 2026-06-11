// Single-instance dev launcher. Before starting it kills the previous dev run
// (tracked by PID file, group-killed) and frees the server/web ports as a
// fallback, so there is only ever one Maestro running and a stale process never
// blocks a fresh start. Pass --smoke to point MAESTRO_HOME and HOME at a
// gitignored sandbox dir, so the run never touches real ~/.maestro data nor the
// real ~/.apm and ~/.claude that apm writes to on a global deploy.
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
if (smoke) {
  const sandbox = join(repoRoot, ".maestro-sandbox");
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

function shutdown() {
  killGroup(child.pid, "SIGTERM");
  rmSync(pidFile, { force: true });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => {
  rmSync(pidFile, { force: true });
  process.exit(code ?? 0);
});
