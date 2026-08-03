// Dev launcher: keeps one Maestro running per worktree — each on its own pair
// of ports (scripts/cockpit-ports.mjs), so a sibling checkout can serve at the
// same time — and with --smoke, an ephemeral, isolated rehearsal environment
// (ADR-0010).
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

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // group already gone, or pid was never a group leader
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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
      killGroup(previous, "SIGTERM");
    } else {
      console.warn(
        `[dev] stale pidfile: pid ${previous} is not this worktree's dev run — leaving it alone`,
      );
    }
  }
  rmSync(pidFile, { force: true });
}

// 2. Refuse when a port belongs to a sibling worktree — killing it would stop
// that session's cockpit silently, and it has happened in both directions.
const { foreign, evictable } = partitionHolders(
  findPortHolders(cockpitPortList),
  attribution,
);
const foreignRefusal = describeForeignHolders(foreign);
if (foreignRefusal !== null) {
  console.error(foreignRefusal);
  process.exit(1);
}

// 3. Fallback: free the ports this run may take — its own previous instance,
// and anything no worktree claims.
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

// 4. Refuse when a holder survived the kill above — another user's process, or
// one that restarted itself. Starting anyway hands the cockpit's URL to it, so
// every later screenshot would prove that process rather than this worktree.
const stillHeld = describeHeldPorts(findPortHolders(cockpitPortList));
if (stillHeld !== null) {
  console.error(stillHeld);
  process.exit(1);
}

// 5. Start server + web as one detached group so we can kill the whole tree.
const env = { ...process.env };
const sandbox = join(repoRoot, ".maestro-sandbox");

// The children bind what the resolver decided, so nothing downstream re-derives
// a pair of its own.
env.PORT = String(ports.server);
env.WEB_PORT = String(ports.web);

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

  // Corepack keeps the pinned pnpm under $HOME, so the redirect above hides it
  // and every start would re-download it into a sandbox we wipe on teardown.
  // A package-manager binary is dev tooling, not the user data smoke isolates.
  // Same precedence corepack itself reads, against the real HOME: guessing
  // ~/.cache would point at an empty directory wherever XDG_CACHE_HOME is set.
  env.COREPACK_HOME =
    process.env.COREPACK_HOME ??
    join(
      process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
      "node",
      "corepack",
    );
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

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

  // Everything the picker must reach is seeded under the redirected HOME —
  // the browse ceiling is os.homedir() (ADR-0009), so anything beside it is
  // invisible. Nothing is pre-registered: connect and registration stay UI
  // use-cases the rehearsal exercises (ADR-0010).
  const seeded = seedSandbox({
    home: env.HOME,
    inventorySource: join(homedir(), "Projects", "agent-harness"),
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

// append-only, or pnpm's dynamic reporter collapses two never-ending dev
// servers into a redrawn summary instead of streaming their prefixed lines.
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
  { cwd: repoRoot, stdio: "inherit", detached: true, env },
);

writeFileSync(pidFile, String(child.pid));

const urls = cockpitUrls(ports);
console.log(
  `[dev] this worktree's cockpit: ${urls.web} (api ${urls.api}) — \`pnpm cockpit:url\` prints it again`,
);

// Detached, so this pid leads the process group every server below it belongs
// to. `pnpm smoke:ready` compares against it before writing anything, because
// answering on the cockpit's ports is not proof of being this run.
if (smoke) writeSmokeMarker(sandbox, { launcherPid: child.pid });

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
