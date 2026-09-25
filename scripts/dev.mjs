// Dev launcher: one Maestro per worktree, on its own pair of ports. With
// --smoke, an ephemeral sandbox that never touches the real home.
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitPorts, cockpitUrls } from "./cockpit-ports.mjs";
import { launchPolicy } from "./launch-policy.mjs";
import {
  describeForeignHolders,
  describeHeldPorts,
  findPortHolders,
  listWorktrees,
  partitionHolders,
  processWorktree,
} from "./port-holders.mjs";
import { seedSandbox, writeSmokeMarker } from "./seed-sandbox.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(repoRoot, ".maestro-dev.pid");
const ports = cockpitPorts();
const cockpitPortList = [ports.server, ports.web];
const smoke = process.argv.includes("--smoke");
const policy = launchPolicy(process.platform);

// A shell that never loaded nvm hands us the system node, and the failure lands
// far downstream (corepack, vite) as something that looks unrelated.
const requiredMajor = Number(
  /\d+/.exec(
    JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).engines
      .node,
  )[0],
);
if (Number(process.versions.node.split(".")[0]) < requiredMajor) {
  console.error(
    `[dev] needs node >=${requiredMajor}, got ${process.versions.node} — run \`nvm use\` in this shell`,
  );
  process.exit(1);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A negative pid is a process group, which Windows lacks: there, the child only.
function killRun(pid, signal) {
  try {
    process.kill(policy.detached ? -pid : pid, signal);
  } catch {
    // group already gone, or pid was never a group leader
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Steps 1-4 use `lsof`, `ps` and process groups, so they run only where the policy allows.
if (policy.singleInstance) {
  // Resolved, or a symlinked checkout reads its own previous run as a sibling's
  // and this launcher refuses to start for good.
  const attribution = {
    self: realpathSync(repoRoot),
    worktrees: listWorktrees(repoRoot),
  };

  // 1. Kill the previous dev launcher's process group (pidfile = "the note"),
  // but only once the process proves it is ours: a pidfile left by a run that
  // died without cleanup can name a pid the OS has since handed to someone else.
  if (existsSync(pidFile)) {
    const previous = Number(readFileSync(pidFile, "utf8").trim());
    if (Number.isInteger(previous) && previous > 0 && isAlive(previous)) {
      if (processWorktree(previous, attribution) === attribution.self) {
        console.log(`[dev] evicting previous dev run (pid ${previous})`);
        killRun(previous, "SIGTERM");
      } else {
        console.warn(
          `[dev] stale pidfile: pid ${previous} is not this worktree's dev run — leaving it alone`,
        );
      }
    }
    rmSync(pidFile, { force: true });
  }

  // 2. Refuse every holder but this worktree's own.
  const { foreign, evictable } = partitionHolders(
    findPortHolders(cockpitPortList),
    attribution,
  );
  const foreignRefusal = describeForeignHolders(foreign);
  if (foreignRefusal !== null) {
    console.error(foreignRefusal);
    process.exit(1);
  }

  // 3. Fallback: free this worktree's own previous instance.
  let freedSomething = false;
  for (const { port, pid } of evictable) {
    // A lookup that could not answer names no pid here; step 4 refuses on it.
    if (pid === null) continue;
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[dev] freeing port ${port} (pid ${pid})`);
      freedSomething = true;
    } catch {
      // already gone
    }
  }
  if (freedSomething) {
    sleep(300); // let the OS release the sockets before we rebind
  }

  // 4. Refuse when a holder survived the kill, or the cockpit's URL would reach it.
  const stillHeld = describeHeldPorts(findPortHolders(cockpitPortList));
  if (stillHeld !== null) {
    console.error(stillHeld);
    process.exit(1);
  }
}

// 5. Start server + web, as one detached group where the policy allows it.
const env = { ...process.env };
const sandbox = join(repoRoot, ".maestro-sandbox");

env.PORT = String(ports.server);
env.WEB_PORT = String(ports.web);

function wipeSandbox() {
  rmSync(sandbox, { recursive: true, force: true });
}

if (smoke) {
  // Wipe any sandbox a crashed run left, so smoke starts unconfigured.
  wipeSandbox();

  env.MAESTRO_HOME = sandbox;
  // apm reads its global location from HOME, so redirect HOME too, or a global
  // deploy writes into the real ~/.apm.
  env.HOME = join(sandbox, "home");
  mkdirSync(env.HOME, { recursive: true });
  console.log(
    `[smoke] MAESTRO_HOME=${env.MAESTRO_HOME} HOME=${env.HOME} (isolated from real data)`,
  );

  // Corepack keeps pnpm under $HOME, which the redirect hides. Read the real
  // cache with corepack's own precedence: XDG_CACHE_HOME may be set.
  env.COREPACK_HOME =
    process.env.COREPACK_HOME ??
    join(
      process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
      "node",
      "corepack",
    );
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

  // Dev tooling only: the product never bridges credentials to apm. gh's token
  // survives the HOME redirect; seedSandbox writes it for git.
  const UNAUTHENTICATED =
    "[smoke] gh not authenticated — connect/register/UI work, but the harness strip stays on 'Read failed' and a real deploy will fail";
  let githubToken;
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
    }).trim();
    if (token) {
      githubToken = token;
      env.GITHUB_TOKEN = token;
      console.log("[smoke] bridged GITHUB_TOKEN from gh auth token");
    } else {
      console.warn(UNAUTHENTICATED);
    }
  } catch {
    console.warn(UNAUTHENTICATED);
  }

  // Nothing is pre-registered: connect and registration stay UI steps to exercise.
  const seeded = seedSandbox({
    home: env.HOME,
    inventorySource: join(homedir(), "Projects", "agent-harness"),
    githubToken,
  });
  for (const warning of seeded.warnings) {
    console.warn(`[smoke] ${warning}`);
  }
  if (seeded.inventory) {
    console.log(`[smoke] seeded inventory clone at ${seeded.inventory}`);
  }
  console.log(
    `[smoke] seeded ${seeded.candidates.length} candidate repos under ${env.HOME}`,
  );
}

// Append-only, or pnpm's dynamic reporter redraws the two dev servers' lines.
// pnpm is a .cmd shim on Windows; spawn can't launch that without a shell.
const child = spawn(
  "pnpm",
  [
    "--parallel",
    "--reporter=append-only",
    "--filter",
    "@maestro/server",
    "--filter",
    "@maestro/web",
    "run",
    "dev",
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    detached: policy.detached,
    env,
    shell: process.platform === "win32",
  },
);

// The pidfile is the note step 1 reads; nothing reads it where step 1 is off.
if (policy.singleInstance) writeFileSync(pidFile, String(child.pid));

const urls = cockpitUrls(ports);
console.log(
  `[dev] this worktree's cockpit: ${urls.web} (api ${urls.api}) — \`pnpm cockpit:url\` prints it again`,
);

// `pnpm smoke:ready` compares against this pid: answering on the ports is not proof.
if (smoke) writeSmokeMarker(sandbox, { launcherPid: child.pid });

function teardownSandbox() {
  if (!smoke) return;
  // Never `apm uninstall -g`: it deletes beyond its lockfile. HOME points into
  // the sandbox, so this wipe cannot touch the real home.
  wipeSandbox();
}

function shutdown() {
  killRun(child.pid, "SIGTERM");
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
