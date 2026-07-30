// Who holds the cockpit's ports. Every worktree serves on the same
// localhost:3000/5173, so a server left running in a sibling keeps answering
// and a screenshot proves the wrong tree (.claude/skills/verify-in-smoke).
import { execFileSync } from "node:child_process";

const runLsof = (args) => execFileSync("lsof", args, { encoding: "utf8" });

/**
 * Listening pids on a port; empty when nothing holds it. Listeners only: a
 * plain `tcp:<port>` query also matches every socket *connected* to it, so an
 * open browser tab would read as a holder (lsof 4.91, measured 2026-07-30).
 */
export function pidsOnPort(port, lsof = runLsof) {
  try {
    return lsof(["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"])
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    // lsof exits non-zero when nothing matches the query — the port is free.
    return [];
  }
}

/** The command name and working directory of a pid, as far as lsof will say. */
function describeProcess(pid, lsof) {
  let fields = [];
  try {
    fields = lsof(["-a", "-p", String(pid), "-d", "cwd", "-Fcn"]).split("\n");
  } catch {
    // A process owned by another user hides both; it still holds the port.
    return { command: null, cwd: null };
  }

  const field = (prefix) => fields.find((line) => line.startsWith(prefix));
  return {
    command: field("c")?.slice(1) ?? null,
    cwd: field("n/")?.slice(1) ?? null,
  };
}

/** Who holds each port, named well enough to go and stop it. */
export function findPortHolders(ports, lsof = runLsof) {
  return ports.flatMap((port) =>
    pidsOnPort(port, lsof).map((pid) => ({
      port,
      pid,
      ...describeProcess(pid, lsof),
    })),
  );
}

/** The launcher's refusal to start, or null when every port is free. */
export function describeHeldPorts(holders) {
  if (holders.length === 0) return null;

  const held = holders
    .map(
      ({ port, pid, command, cwd }) =>
        `  port ${port} — ${command ?? "an unidentified process"} (pid ${pid}) in ${cwd ?? "an unreadable directory"}`,
    )
    .join("\n");

  return [
    "[dev] refusing to start: a cockpit port is still held after cleanup.",
    held,
    "Anything you screenshot now would show that process, not this worktree.",
    "Fix: stop it, then run this again.",
  ].join("\n");
}
