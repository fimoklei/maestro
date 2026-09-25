// Who holds the cockpit's ports: this worktree's previous run or an unrelated
// process. Each worktree serves on its own pair.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { sep } from "node:path";

const runLsof = (args) => execFileSync("lsof", args, { encoding: "utf8" });

const runGit = (args) => execFileSync("git", args, { encoding: "utf8" });

/**
 * Listening pids on a port; empty when free, null when lsof could not answer.
 * Listeners only: `tcp:<port>` also matches connected sockets (lsof 4.91).
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

export function findPortHolders(ports, lsof = runLsof) {
  return ports.flatMap((port) => {
    const pids = pidsOnPort(port, lsof);
    // A port we could not inspect counts as held, so the caller refuses rather
    // than reading silence as "free".
    if (pids === null) return [{ port, pid: null, command: null, cwd: null }];

    return pids.map((pid) => ({ port, pid, ...describeProcess(pid, lsof) }));
  });
}

const namePortHolder = ({ port, pid, command }) =>
  `  port ${port} — ${command ?? "an unidentified process"} (pid ${pid})`;

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
 * Every worktree of this repo, resolved, or null when git could not answer:
 * never an empty list, which would free the ports.
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
    return null;
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
 * Splits holders into this worktree's own previous run, which may be freed,
 * and everything else, which must be refused rather than killed.
 */
export function partitionHolders(holders, { self, worktrees }) {
  if (worktrees === null) {
    return {
      foreign: holders.map((holder) => ({ ...holder, worktree: null })),
      evictable: [],
    };
  }

  const foreign = [];
  const evictable = [];

  for (const holder of holders) {
    const worktree = worktreeOwning(holder.cwd, worktrees);
    if (worktree !== self) {
      foreign.push({ ...holder, worktree });
    } else {
      evictable.push(holder);
    }
  }

  return { foreign, evictable };
}

/** The worktree a process sits in; null when unknown, so a caller holds off. */
export function processWorktree(pid, { worktrees }, lsof = runLsof) {
  if (worktrees === null) return null;

  return worktreeOwning(describeProcess(pid, lsof).cwd, worktrees);
}

export function describeForeignHolders(foreign) {
  if (foreign.length === 0) return null;

  const held = foreign
    .map((holder) =>
      holder.worktree === null
        ? `${namePortHolder(holder)} in ${holder.cwd ?? "an unreadable directory"}, which no worktree of this repo claims`
        : `${namePortHolder(holder)} belonging to the worktree at ${holder.worktree}`,
    )
    .join("\n");

  return [
    "[dev] refusing to start: a cockpit port is not this worktree's to take.",
    held,
    "Killing it would stop work this launcher did not start.",
    "Fix: stop that process, or give this worktree a different pair with",
    "PORT= and WEB_PORT= (two worktrees can derive the same one).",
  ].join("\n");
}
