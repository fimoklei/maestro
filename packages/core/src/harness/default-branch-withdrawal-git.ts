import { execFile } from "node:child_process";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, NO_HOOKS } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { classifyGitError } from "./classify-git-error";
import { classifyPushFailure } from "./classify-push-failure";
import {
  commitSubjectsOnto,
  readSubjectObject,
  type SubjectChange,
} from "./harness-primitive-git";
import {
  type ListSubject,
  subjectPath,
  subjectPathspec,
} from "./proposal-subject";
import type {
  DefaultBranchWithdrawal,
  WithdrawalPushOutcome,
} from "./read-harness-state";
import { remoteBranchHolds } from "./remote-branch-holds";

const run = promisify(execFile);

const changesFrom = async (
  root: string,
  { source, refs }: DefaultBranchWithdrawal,
): Promise<SubjectChange[] | null> => {
  const changes: SubjectChange[] = [];
  for (const subject of refs) {
    if (source === null) {
      changes.push({ subject, object: null });
      continue;
    }
    const read = await readSubjectObject(root, source, subject);
    if (read === null) {
      return null;
    }
    changes.push({ subject, object: read.object });
  }
  return changes;
};

export async function withdrawOnDefaultBranch(
  root: string,
  withdrawal: DefaultBranchWithdrawal,
  deps: { pushLandsWhereItFetched: () => Promise<boolean> },
): Promise<WithdrawalPushOutcome> {
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
    commit = await commitSubjectsOnto(root, changes, {
      treeBase: withdrawal.tip,
      parents: [withdrawal.tip],
      indexDir,
      message: withdrawal.message,
    });
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
    if (failure === "stale-tip" || failure === "refused") {
      return failure;
    }
    return (await remoteBranchHolds(root, branchRef, commit, branchRef))
      ? "pushed"
      : failure === "offline"
        ? "offline"
        : "push-failed";
  }
};

// The push is the commit point: a failed step here is reconciled by the next
// fetch, never reported as a failed withdrawal.
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
  await step(["reset", "-q", commit, "--", ...refs.map(subjectPathspec)]);
  for (const subject of refs) {
    if (subject.type === "categories") {
      await setListBack(root, subject, tip, commit);
    }
  }
};

const setListBack = async (
  root: string,
  subject: ListSubject,
  withdrawn: string,
  commit: string,
): Promise<void> => {
  const path = subjectPath(subject);
  const working = await workingBlob(root, path);
  if (working === undefined) {
    return;
  }
  const [before, after] = await Promise.all([
    blobAt(root, withdrawn, subject),
    blobAt(root, commit, subject),
  ]);
  if (before === undefined || after === undefined || working !== before) {
    return;
  }
  if (after === null) {
    await rm(join(root, path), { force: true });
    return;
  }
  await run(
    "git",
    [
      "-C",
      root,
      ...NO_HOOKS,
      "checkout",
      "-q",
      commit,
      "--",
      subjectPathspec(subject),
    ],
    gitOptions(),
  ).catch(() => undefined);
};

const blobAt = async (
  root: string,
  ref: string,
  subject: ListSubject,
): Promise<string | null | undefined> => {
  const read = await readSubjectObject(root, ref, subject);
  return read === null ? undefined : (read.object?.hash ?? null);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const workingBlob = async (
  root: string,
  path: string,
): Promise<string | null | undefined> => {
  const stat = await lstat(join(root, path)).catch((error: unknown) =>
    isMissing(error) ? null : undefined,
  );
  if (stat === null || stat === undefined) {
    return stat;
  }
  if (!stat.isFile()) {
    return undefined;
  }
  return (await runGitText(root, ["hash-object", "--", path])) ?? undefined;
};
