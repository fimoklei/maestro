// The Harness home base's git surface: fine-grained reads and one fetch, always
// through argument arrays (security.md). Nothing leaves as stdout or stderr — a
// failure leaves as a class, a read as a named field (ADR-0021).
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readConfiguredGitOriginUrl } from "../deploy/git-origin-url";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { classifyFetchFailure } from "./classify-fetch-failure";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessSkillTrees,
  HarnessTag,
} from "./read-harness-state";

const run = promisify(execFile);

// A cockpit read must end. Without this a hung connection holds the request
// open for as long as git is willing to wait, which is forever.
const FETCH_TIMEOUT_MS = 60_000;

const REMOTE_HEAD = "refs/remotes/origin/HEAD";

// Remote tags land in a namespace Maestro owns, never in `refs/tags`: an
// unpushed local tag must not be read as a release, and pruning here can never
// delete a tag the author made (#516).
const MAESTRO_TAGS = "refs/maestro/tags";
const TAG_REFSPEC = `+refs/tags/*:${MAESTRO_TAGS}/*`;
const BRANCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

// One branch per skill under review, named after the skill it carries. Fetched
// by the branch refspec above, so what is read here is what the team pushed.
const PROMOTE_BRANCHES = "refs/remotes/origin/maestro";

// Maestro never asks for credentials and never stores them: git may use what
// the user's own configuration already provides, but may not stop and prompt.
// `GIT_TERMINAL_PROMPT` covers https; ssh has its own prompts (passphrase,
// host-key confirmation), and only BatchMode refuses them. Without it a locked
// key holds the open-time fetch until the timeout and reports it as offline.
const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
};

// Tab-separated so a tag name containing spaces stays one field. The third
// field is the commit an annotated tag points at; lightweight tags leave it
// empty.
const TAG_FORMAT = `%(refname:lstrip=${MAESTRO_TAGS.split("/").length})\t%(objectname)\t%(*objectname)`;

export class HarnessGitAdapter implements HarnessGitPort {
  // Fetches the remote's commits and tags, then re-points the local
  // `origin/HEAD` at the remote's current default branch. Neither touches HEAD,
  // the index, or the working tree.
  async fetch(root: string): Promise<HarnessFetchOutcome> {
    const options = {
      env: { ...process.env, ...NON_INTERACTIVE },
      timeout: FETCH_TIMEOUT_MS,
    };
    try {
      await run(
        "git",
        ["-C", root, "fetch", "--prune", "origin", BRANCH_REFSPEC, TAG_REFSPEC],
        options,
      );
      await run(
        "git",
        ["-C", root, "remote", "set-head", "origin", "--auto"],
        options,
      );
      return "fetched";
    } catch (error) {
      const killed = (error as { killed?: boolean }).killed === true;
      // A run we cut off got no answer at all, which is the offline class —
      // reading it as a reply would put words in the remote's mouth.
      if (killed) {
        return "offline";
      }
      return classifyFetchFailure(
        String((error as { stderr?: string }).stderr),
      );
    }
  }

  async readFacts(root: string): Promise<HarnessFacts> {
    const defaultBranchRef = await this.read(root, [
      "symbolic-ref",
      "--short",
      REMOTE_HEAD,
    ]);
    return {
      originUrl: await readConfiguredGitOriginUrl(root),
      // `origin/main` names the local mirror; the branch is what follows.
      defaultBranch: defaultBranchRef?.replace(/^origin\//, "") ?? null,
      defaultBranchCommit: await this.read(root, ["rev-parse", REMOTE_HEAD]),
      tags: await this.readTags(root),
    };
  }

  // The four places one skill's content can sit. The working read goes through
  // a temporary index so untracked files count, while the author's real index,
  // HEAD and working tree are never read or written (ADR-0021).
  async readSkillTrees(root: string): Promise<HarnessSkillTrees> {
    return {
      remote: await this.skillTreesAt(root, REMOTE_HEAD),
      promote: await this.promoteTrees(root),
      local: await this.skillTreesAt(root, "HEAD"),
      working: await this.workingSkillTrees(root),
    };
  }

  // One tree hash per skill directory under the canonical skills path. An
  // absent path is a harness with no skills there, never a failure.
  private async skillTreesAt(
    root: string,
    treeish: string,
  ): Promise<Record<string, string>> {
    // `-d` is the filter: a loose file beside the skills is not a skill.
    const listing = await this.read(root, [
      "ls-tree",
      "-d",
      "--format=%(objectname)%x09%(path)",
      `${treeish}:${HARNESS_SKILLS_DIR}`,
    ]);
    if (listing === null) {
      return {};
    }
    return Object.fromEntries(
      listing.split("\n").flatMap((line) => {
        const [hash = "", name = ""] = line.split("\t");
        return hash && name ? [[name, hash] as const] : [];
      }),
    );
  }

  // Each promote branch is asked only about the skill it is named for: a
  // branch carrying anything else is not that skill's review. Every branch
  // gets a key; a null value is a branch proposing to delete its skill.
  private async promoteTrees(
    root: string,
  ): Promise<Record<string, string | null>> {
    const listing = await this.read(root, [
      "for-each-ref",
      `--format=%(refname:lstrip=${PROMOTE_BRANCHES.split("/").length})`,
      PROMOTE_BRANCHES,
    ]);
    if (listing === null) {
      return {};
    }

    const named = await Promise.all(
      listing.split("\n").map(async (skill) => {
        const hash = await this.read(root, [
          "rev-parse",
          `${PROMOTE_BRANCHES}/${skill}:${harnessSkillSubpath(skill)}`,
        ]);
        return [skill, hash] as const;
      }),
    );
    return Object.fromEntries(named);
  }

  // Writes to a throwaway index, so `add` sees untracked files and deletions
  // without the author's staged work moving. Only the objects git writes for
  // the hashes survive, and those are unreferenced.
  private async workingSkillTrees(
    root: string,
  ): Promise<Record<string, string>> {
    // No skills path is an empty harness. Every other failure below is left to
    // throw: reading one as "nothing on disk" would show the author's whole
    // harness as locally deleted, which is a confident wrong answer.
    if (!(await pathExists(join(root, HARNESS_SKILLS_DIR)))) {
      return {};
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-index-"));
    const env = { ...process.env, GIT_INDEX_FILE: join(indexDir, "index") };
    try {
      // Seeded from HEAD, because git exempts only already-tracked files from
      // the ignore rules — from an empty index a tracked-but-ignored skill
      // file would silently drop out of the hash. An unborn HEAD has none.
      await run("git", ["-C", root, "read-tree", "HEAD"], { env }).catch(
        () => {},
      );
      await run("git", ["-C", root, "add", "-A", "--", HARNESS_SKILLS_DIR], {
        env,
      });
      const { stdout } = await run("git", ["-C", root, "write-tree"], { env });
      return await this.skillTreesAt(root, stdout.trim());
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  // Null on any failure, so an unset `origin/HEAD` reads as "not known"
  // rather than failing the whole screen. Output is trimmed, never parsed here.
  private async read(root: string, args: string[]): Promise<string | null> {
    try {
      const { stdout } = await run("git", ["-C", root, ...args]);
      const line = stdout.trim();
      return line.length > 0 ? line : null;
    } catch {
      return null;
    }
  }

  private async readTags(root: string): Promise<HarnessTag[]> {
    const listing = await this.read(root, [
      "for-each-ref",
      `--format=${TAG_FORMAT}`,
      MAESTRO_TAGS,
    ]);
    if (listing === null) {
      return [];
    }

    return listing.split("\n").flatMap((line) => {
      const [name, objectName = "", peeled = ""] = line.split("\t");
      // Peeled wins: an annotated tag's own object id is not the commit.
      const commit = peeled || objectName;
      return name && commit ? [{ name, commit }] : [];
    });
  }
}

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );
