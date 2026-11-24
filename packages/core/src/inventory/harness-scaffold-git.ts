import { gitOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { classifyFetchFailure } from "../harness/classify-fetch-failure";
import { runProcess } from "../process/run-process";
import { resolveDefaultBranch } from "./default-branch";
import { isRepositoryRoot } from "./repository-root";

const REMOTE_HEAD = "refs/remotes/origin/HEAD";
const REMOTE_BRANCHES = "refs/remotes/origin";

export type ScaffoldPushOutcome = "pushed" | "rejected" | "offline";

export type ScaffoldCommitOutcome = "committed" | "commit-failed";

export interface HarnessScaffoldGitPort {
  isRepositoryRoot(root: string): Promise<boolean>;

  defaultBranch(root: string): Promise<string | null>;

  currentBranch(root: string): Promise<string | null>;

  hasCommits(root: string): Promise<boolean>;

  commit(
    root: string,
    paths: string[],
    message: string,
  ): Promise<ScaffoldCommitOutcome>;

  unstage(root: string, paths: string[]): Promise<void>;

  push(root: string, branch: string): Promise<ScaffoldPushOutcome>;

  setOriginHead(root: string, branch: string): Promise<void>;
}

export class GitHarnessScaffoldAdapter implements HarnessScaffoldGitPort {
  isRepositoryRoot(root: string): Promise<boolean> {
    return isRepositoryRoot(root);
  }

  defaultBranch(root: string): Promise<string | null> {
    return resolveDefaultBranch(root);
  }

  currentBranch(root: string): Promise<string | null> {
    return runGitText(root, ["symbolic-ref", "--short", "HEAD"]);
  }

  async hasCommits(root: string): Promise<boolean> {
    return (
      (await runGitText(root, ["rev-parse", "--verify", "--quiet", "HEAD"])) !==
      null
    );
  }

  async commit(
    root: string,
    paths: string[],
    message: string,
  ): Promise<ScaffoldCommitOutcome> {
    const added = await this.git(root, ["add", "--", ...paths]);
    if (!added.ok) {
      return "commit-failed";
    }
    const committed = await this.git(root, [
      "commit",
      "-m",
      message,
      "--",
      ...paths,
    ]);
    return committed.ok ? "committed" : "commit-failed";
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    await this.git(root, [
      "rm",
      "--cached",
      "-r",
      "--ignore-unmatch",
      "--",
      ...paths,
    ]);
  }

  async push(root: string, branch: string): Promise<ScaffoldPushOutcome> {
    const pushed = await this.git(root, [
      "push",
      "--set-upstream",
      "origin",
      `refs/heads/${branch}:refs/heads/${branch}`,
    ]);
    if (pushed.ok) {
      return "pushed";
    }
    if (pushed.failure === "killed") {
      return "offline";
    }
    return classifyFetchFailure(pushed.stderr) === "offline"
      ? "offline"
      : "rejected";
  }

  // Local refs only: `set-head --auto` blocks for a minute on an unreachable
  // remote.
  async setOriginHead(root: string, branch: string): Promise<void> {
    await this.git(root, [
      "symbolic-ref",
      REMOTE_HEAD,
      `${REMOTE_BRANCHES}/${branch}`,
    ]);
  }

  private git(root: string, args: string[]) {
    return runProcess("git", ["-C", root, ...args], gitOptions());
  }
}
