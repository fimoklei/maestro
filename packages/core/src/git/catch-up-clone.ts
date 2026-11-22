import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CloneSync } from "../harness/read-harness-state";
import { gitOptions, indexOptions, NO_HOOKS } from "./non-interactive";

const run = promisify(execFile);

// Paths come from git's own listing, so they are matched literally, never as
// globs. A fast-forward runs `post-merge`, so hooks stay off.
const BASE = ["--literal-pathspecs", ...NO_HOOKS];

export async function readCloneSync(root: string): Promise<CloneSync> {
  try {
    return (await locate(root)).sync;
  } catch {
    return "unreadable";
  }
}

export async function catchUpClone(root: string): Promise<void> {
  try {
    const { sync, upstream, landed, unstaged } = await locate(root);
    if (sync !== "behind") {
      return;
    }
    if (landed.length > 0) {
      await stage(root, landed);
    }
    try {
      await git(root, ["merge", "--ff-only", upstream]);
    } catch {
      if (unstaged.length > 0) {
        await git(root, ["reset", "-q", "--", ...unstaged]);
      }
    }
  } catch {}
}

type Located = {
  sync: CloneSync;
  upstream: string;
  landed: string[];
  unstaged: string[];
};

const at = (sync: CloneSync, upstream = ""): Located => ({
  sync,
  upstream,
  landed: [],
  unstaged: [],
});

async function locate(root: string): Promise<Located> {
  const head = await text(root, ["rev-parse", "--verify", "HEAD"]);
  if (head === null) {
    return at("unreadable");
  }
  const upstream = await text(root, ["rev-parse", "--verify", "@{u}"]);
  if (upstream === null) {
    return at("no-upstream");
  }
  if (head === upstream || (await isAncestor(root, upstream, head))) {
    return at("current", upstream);
  }
  if (!(await isAncestor(root, head, upstream))) {
    return at("diverged", upstream);
  }

  const [moved, worktree, staged, untracked] = await Promise.all([
    list(root, ["diff", "--name-only", "--no-renames", head, upstream]),
    list(root, ["diff", "--name-only", "--no-renames"]),
    list(root, ["diff", "--cached", "--name-only", "--no-renames", "HEAD"]),
    list(root, ["ls-files", "--others"]),
  ]);
  const changed = [...new Set([...worktree, ...staged, ...untracked])].filter(
    (path) => moved.has(path),
  );
  const splitStage = changed.some(
    (path) => staged.has(path) && worktree.has(path),
  );
  if (splitStage || !(await matchesUpstream(root, upstream, changed))) {
    return at("local-changes", upstream);
  }
  return {
    sync: "behind",
    upstream,
    landed: changed,
    unstaged: changed.filter((path) => !staged.has(path)),
  };
}

async function list(root: string, args: string[]): Promise<Set<string>> {
  const listing = await git(root, [...args, "-z"]);
  return new Set(listing.split("\0").filter(Boolean));
}

async function stage(root: string, paths: string[], options = gitOptions()) {
  await git(
    root,
    ["update-index", "--add", "--remove", "--", ...paths],
    options,
  );
}

async function matchesUpstream(
  root: string,
  upstream: string,
  paths: string[],
): Promise<boolean> {
  if (paths.length === 0) {
    return true;
  }
  const dir = await mkdtemp(join(tmpdir(), "maestro-catch-up-index-"));
  const options = indexOptions(join(dir, "index"));
  try {
    await git(root, ["read-tree", upstream], options);
    await stage(root, paths, options);
    return await exitsZero(
      root,
      ["diff", "--cached", "--quiet", upstream, "--", ...paths],
      options,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function isAncestor(root: string, from: string, to: string) {
  return exitsZero(root, ["merge-base", "--is-ancestor", from, to]);
}

// Exit 1 is "no" for both `--is-ancestor` and `diff --quiet` (git 2.50.1);
// anything else is no answer and throws.
async function exitsZero(
  root: string,
  args: string[],
  options = gitOptions(),
): Promise<boolean> {
  try {
    await git(root, args, options);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) {
      return false;
    }
    throw error;
  }
}

async function text(root: string, args: string[]): Promise<string | null> {
  try {
    return (await git(root, args)).trim() || null;
  } catch {
    return null;
  }
}

async function git(
  root: string,
  args: string[],
  options = gitOptions(),
): Promise<string> {
  return (await run("git", ["-C", root, ...BASE, ...args], options)).stdout;
}
