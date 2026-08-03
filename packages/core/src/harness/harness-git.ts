// The Harness home base's git surface: fine-grained reads and one fetch, always
// through argument arrays (security.md). Nothing leaves as stdout or stderr — a
// failure leaves as a class, a read as a named field (ADR-0021).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfiguredGitOriginUrl } from "../deploy/git-origin-url";
import { classifyFetchFailure } from "./classify-fetch-failure";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
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

// Maestro never asks for credentials and never stores them: git may use what
// the user's own configuration already provides, but may not stop and prompt.
// An ssh key prompt slips past this and is bounded by the timeout instead.
const NON_INTERACTIVE = { GIT_TERMINAL_PROMPT: "0" };

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
