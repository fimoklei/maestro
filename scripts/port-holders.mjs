// Who holds the cockpit's ports. Every worktree serves on the same
// localhost:3000/5173, so a server left running in a sibling keeps answering
// and a screenshot proves the wrong tree (.claude/skills/verify-in-smoke).
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { sep } from "node:path";

const runLsof = (args) => execFileSync("lsof", args, { encoding: "utf8" });

const runGit = (args) => execFileSync("git", args, { encoding: "utf8" });

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

/** The opening of every held-port line: which port, and who holds it. */
const namePortHolder = ({ port, pid, command }) =>
  `  port ${port} — ${command ?? "an unidentified process"} (pid ${pid})`;

/** The launcher's refusal to start, or null when every port is free. */
export function describeHeldPorts(holders) {
  if (holders.length === 0) return null;

  const held = holders
    .map((holder) =>
      holder.pid === null
        ? `  port ${holder.port} — the holder could not be determined; the lookup failed`
        : `${namePortHolder(holder)} in ${holder.cwd ?? "an unreadable directory"}`,
    )
    .join("\n");

  return [
    "[dev] refusing to start: a cockpit port is still held after cleanup.",
    held,
    "Anything you screenshot now would show that process, not this worktree.",
    "Fix: stop it, then run this again.",
  ].join("\n");
}

/**
 * Every worktree of this repo; empty when git could not be asked. Resolved,
 * because attribution compares these against paths the caller resolved too.
 */
export function listWorktrees(repoRoot, git = runGit, resolve = realpathSync) {
  try {
    return git(["-C", repoRoot, "worktree", "list", "--porcelain"])
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => {
        const path = line.slice("worktree ".length).trim();
        try {
          return resolve(path);
        } catch {
          return path; // a pruned worktree still names itself
        }
      });
  } catch {
    // No list means no attribution, so every holder stays evictable — the
    // behaviour before worktrees were told apart.
    return [];
  }
}

/**
 * The worktree a directory sits in, or null when none owns it. Longest match
 * wins: worktrees live *inside* the main one, so a plain prefix test would
 * read every nested run as the main worktree's. Paths must arrive resolved.
 */
function worktreeOwning(cwd, worktrees) {
  if (cwd === null) return null;

  return (
    worktrees
      .filter((path) => cwd === path || cwd.startsWith(path + sep))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

/**
 * Split port holders into the ones another worktree owns — which this run must
 * refuse rather than kill — and the ones it may free: its own previous run, and
 * anything no worktree claims.
 */
export function partitionHolders(holders, { self, worktrees }) {
  const foreign = [];
  const evictable = [];

  for (const holder of holders) {
    const worktree = worktreeOwning(holder.cwd, worktrees);
    if (worktree !== null && worktree !== self) {
      foreign.push({ ...holder, worktree });
    } else {
      evictable.push(holder);
    }
  }

  return { foreign, evictable };
}

/** The launcher's refusal to evict a sibling worktree, or null when free to go. */
export function describeForeignHolders(foreign) {
  if (foreign.length === 0) return null;

  const held = foreign
    .map(
      (holder) =>
        `${namePortHolder(holder)} belonging to the worktree at ${holder.worktree}`,
    )
    .join("\n");

  return [
    "[dev] refusing to start: a cockpit port belongs to another worktree.",
    held,
    "Killing it would stop that session's cockpit without telling it.",
    "Fix: stop that worktree's dev run, then run this again.",
  ].join("\n");
}
