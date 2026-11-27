import { NO_HOOKS } from "../git/non-interactive";
import { runGit, runGitProcess } from "../git/run-git-text";
import {
  PROPOSAL_REFS,
  type PrimitiveRef,
  primitiveEntry,
  primitivePath,
  primitivePathspec,
  proposalBranchLeaf,
} from "./harness-primitive";
import {
  type ProposalSubject,
  subjectBranch,
  subjectBranchLeaf,
} from "./proposal-subject";
import type { BranchAuthorship } from "./read-harness-state";

// Untrimmed, so a name that starts or ends in a space survives.
async function listPaths(
  root: string,
  args: string[],
): Promise<string[] | null> {
  const listed = await runGitProcess(root, args);
  return listed.ok
    ? listed.stdout.split("\0").filter((path) => path !== "")
    : null;
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
  const spec = primitivePathspec(ref);
  const differing = await listPaths(root, [
    "diff",
    "-z",
    "--name-only",
    "--no-renames",
    "--diff-filter=AMT",
    tip.stdout,
    "--",
    spec,
  ]);
  if (differing === null) {
    return null;
  }
  const untracked = await listPaths(root, [
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
    "--",
    spec,
  ]);
  if (untracked === null) {
    return null;
  }
  const relative = (file: string) =>
    file === path ? primitiveEntry(ref) : file.slice(path.length + 1);
  return [...new Set([...differing, ...untracked])].map(relative).sort();
}

export async function readCommitEmail(root: string): Promise<string | null> {
  const email = await runGit(root, ["config", "--get", "user.email"]);
  return email.ok && email.stdout !== "" ? email.stdout.toLowerCase() : null;
}

export async function readBranchAuthorship(
  root: string,
  subject: ProposalSubject,
  base: string,
  email: string | null,
): Promise<BranchAuthorship> {
  if (email === null) {
    return "no-email";
  }
  const authors = await runGit(root, [
    "log",
    "--format=%ae",
    `${base}..${PROPOSAL_REFS}/${subjectBranchLeaf(subject)}`,
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

export async function deleteProposalBranch(
  root: string,
  subject: ProposalSubject,
): Promise<"deleted" | "failed"> {
  const branch = `refs/heads/${subjectBranch(subject)}`;
  const fetched = `${PROPOSAL_REFS}/${subjectBranchLeaf(subject)}`;
  const checked = await runGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${fetched}^{commit}`,
  ]);
  const deleted =
    checked.ok && (await deleteRemoteBranch(root, branch, checked.stdout));
  if (!deleted) {
    const listed = await runGit(root, ["ls-remote", "origin", branch]);
    if (!listed.ok || listed.stdout !== "") {
      return "failed";
    }
  }
  // The fetched copy would keep the row on screen until the next fetch.
  await runGit(root, ["update-ref", "-d", fetched]);
  return "deleted";
}

const deleteRemoteBranch = async (
  root: string,
  branch: string,
  leasedTip: string,
): Promise<boolean> =>
  (
    await runGitProcess(root, [
      ...NO_HOOKS,
      "push",
      `--force-with-lease=${branch}:${leasedTip}`,
      "origin",
      "--delete",
      branch,
    ])
  ).ok;
