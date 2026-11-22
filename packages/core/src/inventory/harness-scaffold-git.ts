import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { classifyFetchFailure } from "../harness/classify-fetch-failure";
import { resolveDefaultBranch } from "./default-branch";
import { isRepositoryRoot } from "./repository-root";

const run = promisify(execFile);

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
    try {
      await this.git(root, ["add", "--", ...paths]);
      await this.git(root, ["commit", "-m", message, "--", ...paths]);
      return "committed";
    } catch {
      return "commit-failed";
    }
  }

  async unstage(root: string, paths: string[]): Promise<void> {
    try {
      await this.git(root, [
        "rm",
        "--cached",
        "-r",
        "--ignore-unmatch",
        "--",
        ...paths,
      ]);
    } catch {
      // The caller's error is the real one.
    }
  }

  async push(root: string, branch: string): Promise<ScaffoldPushOutcome> {
    try {
      await this.git(root, [
        "push",
        "--set-upstream",
        "origin",
        `refs/heads/${branch}:refs/heads/${branch}`,
      ]);
      return "pushed";
    } catch (error) {
      const killed = (error as { killed?: boolean }).killed === true;
      if (killed) {
        return "offline";
      }
      return classifyFetchFailure(
        String((error as { stderr?: string }).stderr),
      ) === "offline"
        ? "offline"
        : "rejected";
    }
  }

  // Local refs only: `set-head --auto` blocks for a minute on an unreachable
  // remote.
  async setOriginHead(root: string, branch: string): Promise<void> {
    try {
      await this.git(root, [
        "symbolic-ref",
        REMOTE_HEAD,
        `${REMOTE_BRANCHES}/${branch}`,
      ]);
    } catch {
      // Cosmetic: connect resolves the branch without this symref.
    }
  }

  private git(root: string, args: string[]) {
    return run("git", ["-C", root, ...args], gitOptions());
  }
}
