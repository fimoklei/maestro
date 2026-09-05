// The git a scaffold needs, and nothing more: no tag operation exists here, so
// the scaffold cannot create one, and identity, signing and force-push are
// never configured. An outcome is a class, never git's output (ADR-0018).
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

// A rejection is any reply that is not success — a protected branch, a
// non-fast-forward, a token without write. Maestro pre-checks no permission,
// so it does not tell these apart (#556).
export type ScaffoldPushOutcome = "pushed" | "rejected" | "offline";

export type ScaffoldCommitOutcome = "committed" | "commit-failed";

export interface HarnessScaffoldGitPort {
  // Whether the path is the repository's own root rather than a directory
  // inside one — every other read here answers from the enclosing repository.
  isRepositoryRoot(root: string): Promise<boolean>;

  // What origin treats as its default branch, or null when git cannot say.
  defaultBranch(root: string): Promise<string | null>;

  // The branch HEAD names, including one that has no commit yet.
  currentBranch(root: string): Promise<string | null>;

  hasCommits(root: string): Promise<boolean>;

  // Commits exactly these repository-relative paths and leaves the rest of the
  // index and the working tree untouched.
  commit(
    root: string,
    paths: string[],
    message: string,
  ): Promise<ScaffoldCommitOutcome>;

  // Drops these paths from the index without touching the working tree, so a
  // rolled-back scaffold leaves no staged entry claiming a deleted file.
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

  // `--short` is safe here where `default-branch.ts` refuses it: this reads
  // HEAD's own branch, not a symref that a prune could leave pointing nowhere.
  currentBranch(root: string): Promise<string | null> {
    return this.read(root, ["symbolic-ref", "--short", "HEAD"]);
  }

  async hasCommits(root: string): Promise<boolean> {
    return (
      (await this.read(root, ["rev-parse", "--verify", "--quiet", "HEAD"])) !==
      null
    );
  }

  // `add` first: an untracked path is not a pathspec the partial commit can
  // name. `-- <paths>` then ignores everything else in the index, which is what
  // leaves unrelated staged work alone (measured, git 2.50.1, unborn branch).
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

  // `rm --cached` rather than `reset`: the scaffold's own commit can be the
  // repository's first, and `reset` has no HEAD to reset against there.
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
      // The rollback already removed the files; a stale index entry is worth
      // reporting nothing extra about, and the caller's error is the real one.
    }
  }

  async push(root: string, branch: string): Promise<ScaffoldPushOutcome> {
    try {
      // The refspec is spelled out so a local tag or a same-named remote ref
      // can never be what travels. No lease and no force: this branch tip is
      // either where the clone left it or someone else's to keep.
      // `--set-upstream`: a clone's tracking config is not guaranteed (#668),
      // and a scaffold that pushed the branch is what leaves it pullable.
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

  // From local refs only. `set-head --auto` reaches the remote and sits there
  // for a minute against an unreachable one (LEARNINGS · set-head-auto-blocks).
  async setOriginHead(root: string, branch: string): Promise<void> {
    try {
      await this.git(root, [
        "symbolic-ref",
        REMOTE_HEAD,
        `${REMOTE_BRANCHES}/${branch}`,
      ]);
    } catch {
      // A cosmetic repair: the push already landed, and connect resolves the
      // branch from the sole remote ref when this symref is missing.
    }
  }

  private git(root: string, args: string[]) {
    return run("git", ["-C", root, ...args], gitOptions());
  }

  private read(root: string, args: string[]): Promise<string | null> {
    return runGitText(root, args, gitOptions());
  }
}
