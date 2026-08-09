// The Harness home base's git surface: fine-grained reads and one fetch, always
// through argument arrays (security.md). Nothing leaves as stdout or stderr — a
// failure leaves as a class, a read as a named field (ADR-0021).
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readConfiguredGitOriginUrl } from "../deploy/git-origin-url";
import { NON_INTERACTIVE } from "../git/non-interactive";
import { readRemoteDefaultBranch } from "../inventory/default-branch";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { classifyFetchFailure } from "./classify-fetch-failure";
import { classifyPushFailure } from "./classify-push-failure";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessSkillTrees,
  HarnessTag,
  PublishTagOutcome,
} from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

const run = promisify(execFile);

// A cockpit read or a confirm must end. Without this a hung connection holds
// the request open for as long as git is willing to wait, which is forever.
const GIT_TIMEOUT_MS = 60_000;

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

// Tab-separated so a tag name containing spaces stays one field. The third
// field is the commit an annotated tag points at; lightweight tags leave it
// empty.
const TAG_FORMAT = `%(refname:lstrip=${MAESTRO_TAGS.split("/").length})\t%(objectname)\t%(*objectname)`;

export class HarnessGitAdapter implements HarnessGitPort {
  // Fetches the remote's commits and tags, then re-points the local
  // `origin/HEAD` at the remote's current default branch. Neither touches HEAD,
  // the index, or the working tree.
  async fetch(root: string): Promise<HarnessFetchOutcome> {
    const options = gitOptions();
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
      return classifyGitError(error, classifyFetchFailure);
    }
  }

  // Pushes `<commit>:refs/tags/<name>` directly: the tag is created on the
  // remote by the push itself, so no local tag object exists to clean up, and
  // nothing here can move HEAD, the index, or the working tree (#520).
  //
  // The branch refspec is a lease on the tip, never an update: `--atomic`
  // refuses the tag along with a lease git finds stale — see ADR-0023.
  async publishTag(
    root: string,
    name: string,
    commit: string,
    defaultBranch: string,
  ): Promise<PublishTagOutcome> {
    const options = gitOptions();
    const branchRef = `refs/heads/${defaultBranch}`;
    try {
      await run(
        "git",
        [
          "-C",
          root,
          "push",
          "--atomic",
          `--force-with-lease=${branchRef}:${commit}`,
          "origin",
          `${commit}:refs/tags/${name}`,
          `${commit}:${branchRef}`,
        ],
        options,
      );
    } catch (error) {
      const failure = classifyGitError(error, classifyPushFailure);
      const settled = await this.settlePush(root, name, commit, failure);
      if (settled !== "pushed") {
        return settled;
      }
    }
    // The push already made this true on the remote — that is the commit
    // point. Mirroring it locally is a same-process optimisation, not part of
    // the outcome: a lock collision here must never turn an already-published
    // release into a reported failure. A later fetch reconciles the mirror
    // from the real tag either way (#520).
    await run(
      "git",
      ["-C", root, "update-ref", `${MAESTRO_TAGS}/${name}`, commit],
      options,
    ).catch(() => {});
    return "pushed";
  }

  // A push can time out on the way back from a remote that already wrote the
  // tag, and reported as a failure it strands the author: their own retry then
  // reads that tag. So anything but a worded refusal asks the remote (#520).
  private async settlePush(
    root: string,
    name: string,
    commit: string,
    failure: PublishTagOutcome,
  ): Promise<PublishTagOutcome> {
    if (failure === "already-exists" || failure === "stale-tip") {
      return failure;
    }
    // Not `read`: the remote may be unreachable here, so this needs the same
    // timeout and no-prompt env every other reach out has. An unasked question
    // reads the same as an absent tag — both leave the failure standing.
    const listing = await run(
      "git",
      ["-C", root, "ls-remote", "origin", `refs/tags/${name}`],
      gitOptions(),
    ).then(
      ({ stdout }) => stdout.trim(),
      () => "",
    );
    if (listing === "") {
      return failure;
    }
    const [published] = listing.split("\t");
    // A different object under that name is another author's tag, annotated or
    // not: never this push's, and never one to force over.
    return published === commit ? "pushed" : "already-exists";
  }

  async readFacts(root: string): Promise<HarnessFacts> {
    return {
      originUrl: await readConfiguredGitOriginUrl(root),
      defaultBranch: await readRemoteDefaultBranch(root),
      defaultBranchCommit: await this.read(root, ["rev-parse", REMOTE_HEAD]),
      tags: await this.readTags(root),
    };
  }

  // The four places one skill's content can sit, read through the same ref
  // reader the release delta uses. Null where a ref could not be read, so an
  // unreadable clone never reads as one with nothing waiting.
  async readMovementTrees(root: string): Promise<HarnessSkillTrees | null> {
    const remote = await this.readSkillTrees(root, REMOTE_HEAD);
    const local = await this.readSkillTrees(root, "HEAD");
    const working = await this.workingSkillTrees(root);
    if (remote === null || local === null || working === null) {
      return null;
    }
    return {
      remote: byName(remote),
      promote: await this.promoteTrees(root),
      local: byName(local),
      working: byName(working),
    };
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
  ): Promise<HarnessSkillTree[] | null> {
    // No skills path is an empty harness. Every other failure below is left to
    // throw: reading one as "nothing on disk" would show the author's whole
    // harness as locally deleted, which is a confident wrong answer.
    if (!(await pathExists(join(root, HARNESS_SKILLS_DIR)))) {
      return [];
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
      return await this.readSkillTrees(root, stdout.trim());
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  // Reads the skills directory as it stands *inside* `ref`, so a ref that is
  // not an ancestor of anything is still readable. Null on anything the caller
  // must not read as a delta: an unreadable ref, or a listing git worded in a
  // way this parser does not recognise.
  async readSkillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    // `-z`: without it git quotes and escapes any name outside plain ASCII,
    // and the quoted form would then be used as a path and shown on screen.
    const listing = await this.readOutput(root, [
      "ls-tree",
      "-z",
      `${ref}:${HARNESS_SKILLS_DIR}`,
    ]);
    if (listing === null) {
      // The same failure covers a ref that does not resolve and a ref carrying
      // no skills directory. Only the second is an empty set.
      const resolves = await this.readOutput(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref}^{commit}`,
      ]);
      return resolves === null ? null : [];
    }

    const skills: HarnessSkillTree[] = [];
    for (const entry of listing.split("\0")) {
      if (entry === "") {
        continue;
      }
      // `<mode> <type> <object>\t<name>` — only a directory is a skill.
      const [meta = "", name = ""] = entry.split("\t");
      const [mode, type, treeHash] = meta.split(" ");
      if (!mode || !type || !treeHash || !name) {
        // A line this parser cannot read would silently drop a skill, and a
        // missing skill reads as a removal nobody made.
        return null;
      }
      if (type === "tree") {
        skills.push({ name, treeHash });
      }
    }
    return skills;
  }

  // ponytail: one `git log` per movement; batch into a single `--name-status`
  // walk if a first release of a large harness makes the read slow.
  async readSkillAuthors(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    const authors = await Promise.all(
      names.map(async (name) => [
        name,
        await this.read(root, [
          "log",
          "-1",
          "--format=%an",
          ref,
          "--",
          `${HARNESS_SKILLS_DIR}/${name}`,
        ]),
      ]),
    );
    return Object.fromEntries(authors);
  }

  // Each named skill's SKILL.md read from `ref`'s own tree, so an uncommitted
  // edit never counts toward a structural finding. Null where `git show` cannot
  // find the file — a missing manifest, which the plan reports rather than fails
  // on. Raw stdout: the frontmatter is parsed in core, never here.
  async readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    const manifests = await Promise.all(
      names.map(async (name) => [
        name,
        await this.readOutput(root, [
          "show",
          `${ref}:${harnessSkillSubpath(name)}/SKILL.md`,
        ]),
      ]),
    );
    return Object.fromEntries(manifests);
  }

  // Null only when the command itself failed, so an empty answer stays an
  // answer. Raw stdout: a `-z` listing carries names this must not touch.
  private async readOutput(
    root: string,
    args: string[],
  ): Promise<string | null> {
    try {
      const { stdout } = await run("git", ["-C", root, ...args]);
      return stdout;
    } catch {
      return null;
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

  // `readOutput`, not `read`: an empty listing is a namespace with no tags,
  // and only a failed command is null. Collapsing the two would read a git
  // failure as a harness that has never been released (#519).
  private async readTags(root: string): Promise<HarnessTag[] | null> {
    const listing = await this.readOutput(root, [
      "for-each-ref",
      `--format=${TAG_FORMAT}`,
      MAESTRO_TAGS,
    ]);
    if (listing === null) {
      return null;
    }

    return listing
      .trim()
      .split("\n")
      .flatMap((line) => {
        const [name, objectName = "", peeled = ""] = line.split("\t");
        // Peeled wins: an annotated tag's own object id is not the commit.
        const commit = peeled || objectName;
        return name && commit ? [{ name, commit }] : [];
      });
  }
}

const gitOptions = () => ({
  env: { ...process.env, ...NON_INTERACTIVE },
  timeout: GIT_TIMEOUT_MS,
});

// A run we cut off got no answer at all, which is the offline class —
// reading it as a reply would put words in the remote's mouth. Anything else
// is a reply, worded by the caller's own classifier.
const classifyGitError = <T>(
  error: unknown,
  classify: (stderr: string) => T,
): "offline" | T => {
  const killed = (error as { killed?: boolean }).killed === true;
  return killed
    ? "offline"
    : classify(String((error as { stderr?: string }).stderr));
};

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

const byName = (skills: HarnessSkillTree[]): Record<string, string> =>
  Object.fromEntries(skills.map((skill) => [skill.name, skill.treeHash]));
