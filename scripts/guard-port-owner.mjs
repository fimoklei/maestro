// Blocks a browser command when the cockpit's ports are held by a dev server
// from another worktree. Every worktree serves on the same localhost:5173, so a
// sibling left running keeps answering and the screenshot proves the wrong tree
// (.claude/skills/verify-in-smoke/SKILL.md, "wrong worktree"). Runs as a
// PreToolUse hook on Bash so nobody has to remember the check.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COCKPIT_PORTS = [5173, 3000];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Which cockpit ports this command could read, or null when it reads none.
 * A browser command with no URL acts on the tab already open — that tab is the
 * cockpit as far as we can tell, so every port counts.
 */
function targetedPorts(command) {
  if (!/\bagent-browser\b/.test(command)) return null;

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

  const named = local
    .map((url) => Number(url.port))
    .filter((port) => COCKPIT_PORTS.includes(port));
  return named.length === 0 ? COCKPIT_PORTS : named;
}

export function decidePortOwnership({ command, worktreeRoot, owners }) {
  const ports = targetedPorts(command);
  if (ports === null) return { blocked: false };

  // Compared by worktree root, never by path containment: worktrees nest inside
  // the main checkout, so "is under my directory" would accept a sibling
  // whenever you work from the main checkout.
  const foreign = owners.filter(
    (owner) =>
      ports.includes(owner.port) && owner.worktreeRoot !== worktreeRoot,
  );
  if (foreign.length === 0) return { blocked: false };

  const held = foreign
    .map(
      (owner) =>
        `  port ${owner.port} — pid ${owner.pid} in ${owner.cwd ?? "an unreadable directory"}`,
    )
    .join("\n");

  return {
    blocked: true,
    message: [
      "Blocked: the cockpit's ports are held by a dev server outside this worktree.",
      `This worktree: ${worktreeRoot}`,
      held,
      "Anything you screenshot now shows that other tree, not your branch.",
      "Fix: stop that server, then run `pnpm smoke` from this worktree.",
    ].join("\n"),
  };
}

function listeningPids(port) {
  try {
    return execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      {
        encoding: "utf8",
      },
    )
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    // lsof exits non-zero when nothing listens on the port (proven by the
    // "reports no owner" case in tests/integration/guard-port-owner.test.ts).
    return [];
  }
}

function workingDirectoryOf(pid) {
  try {
    const output = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { encoding: "utf8" },
    );
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

export function findPortOwners(ports = COCKPIT_PORTS) {
  return ports.flatMap((port) =>
    listeningPids(port).map((pid) => {
      const cwd = workingDirectoryOf(pid);
      return { port, pid, cwd, worktreeRoot: worktreeRootOf(cwd) };
    }),
  );
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

  const decision = decidePortOwnership({
    command,
    worktreeRoot: worktreeRootOf(realpathSync(projectDir)),
    owners: findPortOwners(),
  });

  if (decision.blocked) {
    process.stderr.write(`${decision.message}\n`);
    // Exit 2 on PreToolUse denies the call and shows stderr to the agent
    // (Claude Code hooks reference, observed on 2.1.220).
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
