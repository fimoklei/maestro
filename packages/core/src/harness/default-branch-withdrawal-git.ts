// Withdraw from release on the default branch: one commit pushed with a lease,
// then followed locally. Nothing leaves as stdout or stderr.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, NO_HOOKS } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { classifyGitError } from "./classify-git-error";
import { classifyPushFailure } from "./classify-push-failure";
import { primitivePath } from "./harness-primitive";
import {
  commitPrimitivesOnto,
  type PrimitiveChange,
  readPrimitiveObject,
} from "./harness-primitive-git";
import type {
  DefaultBranchWithdrawal,
  WithdrawalPushOutcome,
} from "./read-harness-state";

const run = promisify(execFile);

const literal = (path: string) => `:(literal)${path}`;

// Null where `source` could not be read: never a guess at what it holds.
const changesFrom = async (
  root: string,
  { source, refs }: DefaultBranchWithdrawal,
): Promise<PrimitiveChange[] | null> => {
  const changes: PrimitiveChange[] = [];
  for (const ref of refs) {
    if (source === null) {
      changes.push({ ref, object: null });
      continue;
    }
    const read = await readPrimitiveObject(root, source, ref);
    if (read === null) {
      return null;
    }
    changes.push({ ref, object: read.object });
  }
  return changes;
};

export async function withdrawOnDefaultBranch(
  root: string,
  withdrawal: DefaultBranchWithdrawal,
  deps: { pushLandsWhereItFetched: () => Promise<boolean> },
): Promise<WithdrawalPushOutcome> {
  // The local follow-up below moves HEAD from `tip`; from anywhere else it
  // would revert a commit nobody pushed.
  const head = await runGitText(root, ["rev-parse", "HEAD"]);
  if (head !== withdrawal.tip) {
    return "clone-not-current";
  }
  if (!(await deps.pushLandsWhereItFetched())) {
    return "push-elsewhere";
  }

  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-withdraw-"));
  let commit: string;
  try {
    const changes = await changesFrom(root, withdrawal);
    if (changes === null) {
      return "push-failed";
    }
    commit = await commitPrimitivesOnto(
      root,
      changes,
      withdrawal.tip,
      withdrawal.tip,
      indexDir,
      withdrawal.message,
    );
  } catch {
    return "push-failed";
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }

  const pushed = await push(root, withdrawal, commit);
  if (pushed !== "pushed") {
    return pushed;
  }
  await follow(root, withdrawal, commit);
  return "pushed";
}

const push = async (
  root: string,
  { defaultBranch, tip }: DefaultBranchWithdrawal,
  commit: string,
): Promise<WithdrawalPushOutcome> => {
  const branchRef = `refs/heads/${defaultBranch}`;
  try {
    await run(
      "git",
      [
        "-C",
        root,
        ...NO_HOOKS,
        "push",
        `--force-with-lease=${branchRef}:${tip}`,
        "origin",
        `${commit}:${branchRef}`,
      ],
      gitOptions(),
    );
    return "pushed";
  } catch (error) {
    const failure = classifyGitError(error, classifyPushFailure);
    // A worded refusal: the remote did not move the branch.
    if (failure === "stale-tip" || failure === "refused") {
      return failure;
    }
    return await settle(
      root,
      branchRef,
      commit,
      failure === "offline" ? "offline" : "push-failed",
    );
  }
};

// A push can fail after the remote already moved the branch, so the remote is
// asked (#577). The commit, or a descendant of it, at the tip counts as pushed.
const settle = async (
  root: string,
  branchRef: string,
  commit: string,
  failure: "offline" | "push-failed",
): Promise<WithdrawalPushOutcome> => {
  const listing = await runGitText(root, ["ls-remote", "origin", branchRef]);
  const [remoteTip] = (listing ?? "").split("\t");
  if (remoteTip === undefined || remoteTip === "") {
    return failure;
  }
  if (remoteTip === commit) {
    return "pushed";
  }
  // `merge-base` needs the tip's object locally.
  const fetched = await run(
    "git",
    ["-C", root, "fetch", "origin", remoteTip],
    gitOptions(),
  ).then(
    () => true,
    () => false,
  );
  const descends =
    fetched &&
    (await run(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", commit, remoteTip],
      gitOptions(),
    ).then(
      () => true,
      () => false,
    ));
  return descends ? "pushed" : failure;
};

// The push is the commit point: a failed step here is reconciled by the next
// fetch, never reported as a failed withdrawal. The working tree is never
// touched, so the author's copy reads as uncommitted work and a catch-up has
// nothing to fast-forward over it.
const follow = async (
  root: string,
  { defaultBranch, tip, refs }: DefaultBranchWithdrawal,
  commit: string,
): Promise<void> => {
  const step = (args: string[]) =>
    run("git", ["-C", root, ...NO_HOOKS, ...args], gitOptions()).then(
      () => true,
      () => false,
    );
  // Compare-and-swap: a HEAD that moved since the check stays where it is.
  if (!(await step(["update-ref", "HEAD", commit, tip]))) {
    return;
  }
  await step(["update-ref", `refs/remotes/origin/${defaultBranch}`, commit]);
  await step([
    "reset",
    "-q",
    commit,
    "--",
    ...refs.map((ref) => literal(primitivePath(ref))),
  ]);
};
