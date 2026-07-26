// Blocks a browser command when the cockpit's ports are held by a dev server
// from another worktree. Every worktree serves on the same localhost:5173, so a
// sibling left running keeps answering and the screenshot proves the wrong tree
// (.claude/skills/verify-in-smoke/SKILL.md, "wrong worktree"). Runs as a
// PreToolUse hook on Bash so nobody has to remember the check.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const COCKPIT_PORTS = [5173, 3000];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Which cockpit ports this command could read, or null when it reads none.
 * A browser command with no URL acts on the tab already open — that tab is the
 * cockpit as far as we can tell, so every port counts.
 */
// The tool in command position: at the start, or after a shell operator, with
// any leading environment assignments skipped. Matching the bare name anywhere
// would read a mention as a use — naming it in a commit message blocked the
// commit itself (observed 2026-07-26).
const BROWSER_COMMAND = /(^|[\n;|&(])\s*(\w+=\S*\s+)*agent-browser\b/;

function targetedPorts(command) {
  if (!BROWSER_COMMAND.test(command)) return null;

  const urls = command.match(/https?:\/\/[^\s"'`]+/g) ?? [];
  if (urls.length === 0) return COCKPIT_PORTS;

  const local = urls
    .map((url) => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    })
    .filter((url) => url !== null && LOCAL_HOSTS.has(url.hostname));
  if (local.length === 0) return null;

  // A local URL that names some other port belongs to another project, not the
  // cockpit — leave it alone rather than blocking on a port it never reads.
  const named = local
    .map((url) => Number(url.port))
    .filter((port) => COCKPIT_PORTS.includes(port));
  return named.length === 0 ? null : named;
}

export function decidePortOwnership({ command, worktreeRoot, owners }) {
  const ports = targetedPorts(command);
  if (ports === null) return { blocked: false };

  // Compared by worktree root, never by path containment: worktrees nest inside
  // the main checkout, so "is under my directory" would accept a sibling
  // whenever you work from the main checkout. A root only counts as ours when
  // both sides are known — two unknowns are not a match.
  const isOurs = (owner) =>
    worktreeRoot !== null && owner.worktreeRoot === worktreeRoot;
  const foreign = owners.filter(
    (owner) => ports.includes(owner.port) && !isOurs(owner),
  );
  if (foreign.length === 0) return { blocked: false };

  const held = foreign
    .map((owner) =>
      owner.pid === null
        ? `  port ${owner.port} — the holder could not be determined; the lookup failed`
        : `  port ${owner.port} — pid ${owner.pid} in ${owner.cwd ?? "an unreadable directory"}`,
    )
    .join("\n");

  const identified = foreign.some((owner) => owner.pid !== null);

  return {
    blocked: true,
    message: [
      identified
        ? "Blocked: the cockpit's ports are held by a dev server outside this worktree."
        : "Blocked: who holds the cockpit's ports could not be established.",
      `This worktree: ${worktreeRoot ?? "could not be established either"}`,
      held,
      identified
        ? "Anything you screenshot now shows that other tree, not your branch."
        : "Until that is answered, a screenshot proves nothing about your branch.",
      "Fix: stop that server, then run `pnpm smoke` from this worktree.",
    ].join("\n"),
  };
}

/**
 * What the smoke sandbox holds right now. An absent sandbox is reported as
 * such, never as an empty one: "not rehearsing" and "rehearsing badly" are
 * different answers, and only the second is worth blocking.
 */
export function readSandboxState(sandboxDir) {
  if (!existsSync(sandboxDir))
    return { exists: false, inventoryPath: null, repos: [] };

  let config = {};
  try {
    config = JSON.parse(readFileSync(join(sandboxDir, "config.json"), "utf8"));
  } catch {
    // Absent or unreadable config = a cockpit started but never seeded, which
    // is exactly the state this guard exists to catch.
  }

  return {
    exists: true,
    inventoryPath:
      typeof config?.inventoryPath === "string" ? config.inventoryPath : null,
    repos: Array.isArray(config?.repos) ? config.repos : [],
  };
}

/**
 * A running cockpit is not a usable one. Under `pnpm smoke` it starts with no
 * inventory and no registered repo (ADR-0010), so a screenshot taken before
 * seeding shows the connect gate rather than the screen that changed.
 */
export function decideCockpitReadiness({ command, sandbox }) {
  if (targetedPorts(command) === null) return { blocked: false };
  if (!sandbox.exists) return { blocked: false };

  const missing = [
    sandbox.inventoryPath === null ? "no inventory is connected" : null,
    sandbox.repos.length === 0 ? "no consuming repo is registered" : null,
  ].filter((entry) => entry !== null);
  if (missing.length === 0) return { blocked: false };

  return {
    blocked: true,
    message: [
      "Blocked: the smoke cockpit is running but not seeded.",
      `In this sandbox ${missing.join(" and ")}, so the screen shows the connect gate, not your change.`,
      "Fix: run `pnpm smoke:ready` — it waits for the cockpit, connects the inventory and registers a repo.",
    ].join("\n"),
  };
}

const runLsof = (args) => execFileSync("lsof", args, { encoding: "utf8" });

/** The one failure that means "the port is free"; anything else is a real fault. */
function meansNoMatch(failure) {
  // lsof exits 1 with no output when nothing matches the query (lsof revision
  // 4.91, measured 2026-07-26). A missing binary or a refused query surfaces as
  // a different status, or as an ENOENT/EACCES code with no status at all.
  return failure?.status === 1;
}

/** Listening pids on a port, or null when the lookup could not answer. */
function listeningPids(port, lsof) {
  try {
    return lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (failure) {
    return meansNoMatch(failure) ? [] : null;
  }
}

function workingDirectoryOf(pid, lsof) {
  try {
    const output = lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    const line = output.split("\n").find((entry) => entry.startsWith("n/"));
    return line === undefined ? null : realpathSync(line.slice(1));
  } catch {
    // A process owned by another user hides its cwd; unknown is not "ours".
    return null;
  }
}

function worktreeRootOf(directory) {
  if (directory === null) return null;
  try {
    return execFileSync(
      "git",
      ["-C", directory, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

export function findPortOwners(ports = COCKPIT_PORTS, lsof = runLsof) {
  return ports.flatMap((port) => {
    const pids = listeningPids(port, lsof);
    // A lookup that could not answer is reported as an owner we cannot place,
    // so the decision blocks instead of reading silence as "the port is free".
    if (pids === null)
      return [{ port, pid: null, cwd: null, worktreeRoot: null }];

    return pids.map((pid) => {
      const cwd = workingDirectoryOf(pid, lsof);
      return { port, pid, cwd, worktreeRoot: worktreeRootOf(cwd) };
    });
  });
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    return; // Not a hook payload we understand — never block on our own bug.
  }

  const command = payload?.tool_input?.command;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? payload?.cwd;
  if (typeof command !== "string" || typeof projectDir !== "string") return;

  // Nothing is looked up until the command is one that could read the cockpit:
  // this hook runs on every Bash call and lsof is not free.
  if (targetedPorts(command) === null) return;

  const decisions = [
    decidePortOwnership({
      command,
      worktreeRoot: worktreeRootOf(realpathSync(projectDir)),
      owners: findPortOwners(),
    }),
    decideCockpitReadiness({
      command,
      sandbox: readSandboxState(join(projectDir, ".maestro-sandbox")),
    }),
  ];

  const blocked = decisions.find((decision) => decision.blocked);
  if (blocked !== undefined) {
    process.stderr.write(`${blocked.message}\n`);
    // Exit 2 on PreToolUse denies the call and shows stderr to the agent
    // (Claude Code hooks reference, observed on 2.1.220).
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
