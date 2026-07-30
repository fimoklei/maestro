// Who holds the cockpit's ports. Every worktree serves on the same
// localhost:3000/5173, so a server left running in a sibling keeps answering
// and a screenshot proves the wrong tree (.claude/skills/verify-in-smoke).
import { execFileSync } from "node:child_process";

const runLsof = (args) => execFileSync("lsof", args, { encoding: "utf8" });

/**
 * Listening pids on a port; empty when it is free, null when the lookup could
 * not answer. Listeners only: a plain `tcp:<port>` query also matches every
 * socket *connected* to it, so an open browser tab would read as a holder
 * (lsof 4.91, measured 2026-07-30).
 */
export function pidsOnPort(port, lsof = runLsof) {
  try {
    return lsof(["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"])
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (failure) {
    // Exit 1 with no output is the one failure that means "nothing matched"
    // (lsof 4.91). A missing binary or a refused query lands elsewhere, and
    // must never be read as a free port.
    return failure?.status === 1 ? [] : null;
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
  return ports.flatMap((port) => {
    const pids = pidsOnPort(port, lsof);
    // A port we could not inspect counts as held, so the caller refuses rather
    // than reading silence as "free".
    if (pids === null) return [{ port, pid: null, command: null, cwd: null }];

    return pids.map((pid) => ({ port, pid, ...describeProcess(pid, lsof) }));
  });
}

/** The launcher's refusal to start, or null when every port is free. */
export function describeHeldPorts(holders) {
  if (holders.length === 0) return null;

  const held = holders
    .map(({ port, pid, command, cwd }) =>
      pid === null
        ? `  port ${port} — the holder could not be determined; the lookup failed`
        : `  port ${port} — ${command ?? "an unidentified process"} (pid ${pid}) in ${cwd ?? "an unreadable directory"}`,
    )
    .join("\n");

  return [
    "[dev] refusing to start: a cockpit port is still held after cleanup.",
    held,
    "Anything you screenshot now would show that process, not this worktree.",
    "Fix: stop it, then run this again.",
  ].join("\n");
}
