// Lets `pnpm verify` skip a run whose tree already passed (#1092).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const RECORD = "verify-green.json";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Hashes HEAD plus every staged, unstaged and untracked change. Ignored files
 * do not count. Throws when `cwd` is not a git work tree with a commit.
 */
export function treeFingerprint(cwd) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });

  // git lists an untracked nested repository as `dir/`, which it cannot hash.
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((path) => {
      const full = join(cwd, path);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) return `${path}\0link\0${readlinkSync(full)}`;
      if (stat.isDirectory()) return `${path}\0dir`;
      return `${path}\0file\0${sha256(readFileSync(full))}`;
    });

  return sha256(
    [
      git(["rev-parse", "HEAD"]),
      git(["diff", "HEAD", "--binary", "--no-ext-diff"]),
      ...untracked,
    ].join("\0"),
  );
}

const logHash = (logDir, log) => {
  try {
    return sha256(readFileSync(join(logDir, log)));
  } catch {
    return null;
  }
};

export function recordGreenRun(logDir, { fingerprint, finishedAt, logs }) {
  const hashes = Object.fromEntries(
    logs.map((log) => [log, logHash(logDir, log)]),
  );
  writeFileSync(
    join(logDir, RECORD),
    JSON.stringify({ fingerprint, finishedAt, logs: hashes }, null, 2),
  );
}

/**
 * The recorded green run for this fingerprint, or null. A run whose logs were
 * overwritten or removed since is not offered: its evidence is gone.
 */
export function reusableGreenRun(logDir, fingerprint) {
  let record;
  try {
    record = JSON.parse(readFileSync(join(logDir, RECORD), "utf8"));
  } catch {
    return null;
  }
  if (record?.fingerprint !== fingerprint) return null;
  const logs = Object.entries(record.logs ?? {});
  if (logs.length === 0) return null;
  for (const [log, hash] of logs) {
    if (hash === null || logHash(logDir, log) !== hash) return null;
  }
  return { finishedAt: record.finishedAt };
}

export function forgetGreenRun(logDir) {
  rmSync(join(logDir, RECORD), { force: true });
}

export function startRun(logDir, fingerprint, { force }) {
  const reusable =
    !force && fingerprint !== null
      ? reusableGreenRun(logDir, fingerprint)
      : null;
  // A new run's logs replace the recorded run's evidence.
  if (!reusable) forgetGreenRun(logDir);
  return reusable;
}

/** Records the run only when it passed on a tree that held still throughout. */
export function finishRun(logDir, { passed, before, after, finishedAt, logs }) {
  if (!passed) return "red";
  if (before === null) return "no-fingerprint";
  if (after !== before) return "tree-changed";
  recordGreenRun(logDir, { fingerprint: before, finishedAt, logs });
  return "recorded";
}
