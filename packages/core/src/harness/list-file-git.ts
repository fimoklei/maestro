// A list proposed as one file on its own branch. Built in a throwaway index
// from the fetched default-branch tip: never checks out, stages in the
// author's index, or reads the working tree. Nothing leaves as stdout.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, NO_HOOKS } from "../git/non-interactive";
import { runGit, runGitText } from "../git/run-git-text";
import { classifyFetchFailure } from "./classify-fetch-failure";
import { classifyGitError } from "./classify-git-error";
import { PROPOSAL_REFS } from "./harness-primitive";
import { commitSubjectsOnto } from "./harness-primitive-git";
import { subjectBranch, subjectBranchLeaf } from "./proposal-subject";
import type { ListFilePush, ListPushOutcome } from "./read-harness-state";
import { remoteBranchHolds } from "./remote-branch-holds";

const run = promisify(execFile);

// A branch that lacks the tip takes it as a second parent, so the pull
// request shows the whole change and merges without a conflict.
const parentsOf = async (
  root: string,
  tip: string | null,
  defaultTip: string,
): Promise<string[]> => {
  if (tip === null) return [defaultTip];
  const holds = await runGit(root, [
    "merge-base",
    "--is-ancestor",
    defaultTip,
    tip,
  ]);
  return holds.ok ? [tip] : [tip, defaultTip];
};

export async function pushListFile(
  root: string,
  { subject, text, defaultTip, message }: ListFilePush,
  deps: { pushLandsWhereItFetched: () => Promise<boolean> },
): Promise<ListPushOutcome> {
  if (!(await deps.pushLandsWhereItFetched())) {
    return "push-elsewhere";
  }
  const branchRef = `refs/heads/${subjectBranch(subject)}`;
  const fetchedRef = `${PROPOSAL_REFS}/${subjectBranchLeaf(subject)}`;
  const refspec = `+${branchRef}:${fetchedRef}`;
  // Re-fetched right before trusting it; failure leaves the fetched ref standing.
  await run(
    "git",
    ["-C", root, "fetch", "origin", refspec],
    gitOptions(),
  ).catch(() => {});
  const tip = await runGitText(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${fetchedRef}^{commit}`,
  ]);

  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-list-"));
  let commit: string;
  try {
    const file = join(indexDir, "file");
    await writeFile(file, text, "utf8");
    // `--no-filters`: the bytes the writer produced, whatever the attributes say.
    const { stdout: blob } = await run(
      "git",
      ["-C", root, "hash-object", "-w", "--no-filters", "--", file],
      gitOptions(),
    );
    commit = await commitSubjectsOnto(
      root,
      [{ subject, object: { hash: blob.trim(), mode: "100644" } }],
      {
        treeBase: defaultTip,
        parents: await parentsOf(root, tip, defaultTip),
        indexDir,
        message,
      },
    );
  } catch {
    return "push-failed";
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }

  // Never `--force`: a branch this commit does not descend from refuses.
  try {
    await run(
      "git",
      ["-C", root, ...NO_HOOKS, "push", "origin", `${commit}:${branchRef}`],
      gitOptions(),
    );
    return "pushed";
  } catch (error) {
    if (await remoteBranchHolds(root, branchRef, commit, refspec)) {
      return "pushed";
    }
    return classifyGitError(error, classifyFetchFailure) === "offline"
      ? "offline"
      : "push-failed";
  }
}
