import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions, NO_HOOKS } from "../git/non-interactive";
import { runGit } from "../git/run-git-text";
import {
  PROPOSAL_REFS,
  type PrimitiveRef,
  primitiveEntry,
  primitivePath,
  proposalBranch,
  proposalBranchLeaf,
} from "./harness-primitive";
import type { BranchAuthorship } from "./read-harness-state";

const run = promisify(execFile);

// Untrimmed, so a name that starts or ends in a space survives.
async function listPaths(root: string, args: string[]): Promise<string[]> {
  const { stdout } = await run("git", ["-C", root, ...args], gitOptions());
  return stdout.split("\0").filter((path) => path !== "");
}

export async function readUnproposedFiles(
  root: string,
  ref: PrimitiveRef,
): Promise<string[] | null> {
  const branchRef = `${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`;
  const tip = await runGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${branchRef}^{commit}`,
  ]);
  if (!tip.ok) {
    return null;
  }
  const path = primitivePath(ref);
  const spec = `:(literal)${path}`;
  try {
    const differing = await listPaths(root, [
      "diff",
      "-z",
      "--name-only",
      "--no-renames",
      // A file only the branch holds is not lost work.
      "--diff-filter=AMT",
      tip.stdout,
      "--",
      spec,
    ]);
    const untracked = await listPaths(root, [
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--",
      spec,
    ]);
    const relative = (file: string) =>
      file === path ? primitiveEntry(ref) : file.slice(path.length + 1);
    return [...new Set([...differing, ...untracked])].map(relative).sort();
  } catch {
    return null;
  }
}

/** The author email this clone commits under; null where none is set. */
export async function readCommitEmail(root: string): Promise<string | null> {
  const email = await runGit(root, ["config", "--get", "user.email"]);
  return email.ok && email.stdout !== "" ? email.stdout.toLowerCase() : null;
}

// Whether every commit the fetched branch adds over `base` carries `email`.
// The branch name is shared, so a teammate can push to it without a pull
// request (#1639).
export async function readBranchAuthorship(
  root: string,
  ref: PrimitiveRef,
  base: string,
  email: string | null,
): Promise<BranchAuthorship> {
  if (email === null) {
    return "no-email";
  }
  const authors = await runGit(root, [
    "log",
    "--format=%ae",
    `${base}..${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`,
    "--",
  ]);
  if (!authors.ok) {
    return "unknown";
  }
  return authors.stdout
    .split("\n")
    .filter((author) => author !== "")
    .every((author) => author.toLowerCase() === email)
    ? "own"
    : "others";
}

// Never `--force`: the lease binds the deletion to the fetched tip every
// check read, so a push that landed since survives (#1639). The remote is
// asked after a failure: a branch already gone is the outcome the caller wants.
export async function deleteProposalBranch(
  root: string,
  ref: PrimitiveRef,
): Promise<"deleted" | "failed"> {
  const branch = `refs/heads/${proposalBranch(ref)}`;
  const checked = await runGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}^{commit}`,
  ]);
  try {
    if (!checked.ok) {
      throw new Error("no fetched tip to lease against");
    }
    await run(
      "git",
      [
        "-C",
        root,
        ...NO_HOOKS,
        "push",
        `--force-with-lease=${branch}:${checked.stdout}`,
        "origin",
        "--delete",
        branch,
      ],
      gitOptions(),
    );
  } catch {
    const listed = await runGit(root, ["ls-remote", "origin", branch]);
    if (!listed.ok || listed.stdout !== "") {
      return "failed";
    }
  }
  // The fetched copy would keep the row on screen until the next fetch.
  await runGit(root, [
    "update-ref",
    "-d",
    `${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`,
  ]);
  return "deleted";
}
