// Nothing leaves as stdout or stderr: a failure leaves as a class, a read as a named field.
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  readConfiguredGitOriginUrl,
  readGitOriginUrl,
} from "../deploy/git-origin-url";
import { catchUpClone, readCloneSync } from "../git/catch-up-clone";
import { gitOptions, indexOptions, NO_HOOKS } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { readRemoteDefaultBranch } from "../inventory/default-branch";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { classifyFetchFailure } from "./classify-fetch-failure";
import { classifyPushFailure } from "./classify-push-failure";
import {
  readLocalHeadCommit as readLocalHead,
  readStagedSkillDifference as readStagedDifference,
  writeSkillTreeInto as writeSkillTree,
} from "./harness-git-restore";
import { PROMOTE_NAMESPACE, promoteBranch } from "./promote-branch";
import { pushesWhereItFetched } from "./push-destination";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessPromoteRef,
  HarnessSkillTrees,
  HarnessTag,
  PromoteSkillOutcome,
  PublishTagOutcome,
  SkillPushOutcome,
  WorktreeAmbiguity,
} from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

const run = promisify(execFile);

const REMOTE_HEAD = "refs/remotes/origin/HEAD";

// Never `refs/tags`: an unpushed local tag must not read as a release, and
// pruning must never delete a tag the author made (#516).
const MAESTRO_TAGS = "refs/maestro/tags";
const TAG_REFSPEC = `+refs/tags/*:${MAESTRO_TAGS}/*`;
const BRANCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

const PROMOTE_BRANCHES = `refs/remotes/origin/${PROMOTE_NAMESPACE}`;

// Tab-separated so a name containing spaces stays one field.
const PROMOTE_FORMAT = `%(refname:lstrip=${PROMOTE_BRANCHES.split("/").length})\t%(objectname)`;

const PROMOTE_SUBJECT = "Promote skill: ";
const REMOVE_SUBJECT = "Remove skill: ";

// The third field is the commit an annotated tag points at; empty for a lightweight tag.
const TAG_FORMAT = `%(refname:lstrip=${MAESTRO_TAGS.split("/").length})\t%(objectname)\t%(*objectname)`;

export class HarnessGitAdapter implements HarnessGitPort {
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

  // The branch refspec is a lease on the tip, never an update: `--atomic`
  // refuses the tag along with a stale lease.
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
          ...NO_HOOKS,
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
    // The push is the commit point: a failed local mirror must never report a
    // published release as failed. A later fetch reconciles it (#520).
    await run(
      "git",
      ["-C", root, "update-ref", `${MAESTRO_TAGS}/${name}`, commit],
      options,
    ).catch(() => {});
    return "pushed";
  }

  // A push can time out after the remote already wrote the tag, so anything
  // but a worded refusal asks the remote (#520).
  private async settlePush(
    root: string,
    name: string,
    commit: string,
    failure: PublishTagOutcome,
  ): Promise<PublishTagOutcome> {
    if (failure === "already-exists" || failure === "stale-tip") {
      return failure;
    }
    // Not `read`: the remote may be unreachable, so this needs gitOptions' timeout and no-prompt env.
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
    // A different object is another author's tag: never force over it.
    return published === commit ? "pushed" : "already-exists";
  }

  // Built in throwaway indexes only: never checks out, stages in the author's
  // index, moves HEAD, or names a local branch (#574, #578).
  async pushSkillPromotion(
    root: string,
    name: string,
    base: string,
  ): Promise<PromoteSkillOutcome> {
    const subpath = harnessSkillSubpath(name);
    if (!(await pathExists(join(root, subpath)))) {
      // A deletion is its own confirmed route (#580), never inferred here.
      return "skill-missing";
    }

    // Before any object is written: a push to another destination than the
    // fetch would publish this skill somewhere else.
    if (!(await this.pushLandsWhereItFetched(root))) {
      return "push-elsewhere";
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-promote-"));
    try {
      const skillTree = await this.hashWorkingSkill(root, subpath, indexDir);

      // Re-fetched right before trusting it: another author's promotion may
      // have landed since the last fetch (#578).
      const branchRef = `${PROMOTE_BRANCHES}/${name}`;
      await this.refreshPromoteBranchRef(root, name);
      const existingTip = await this.read(root, ["rev-parse", branchRef]);
      if (existingTip !== null) {
        const existingTree = await this.read(root, [
          "rev-parse",
          `${branchRef}:${subpath}`,
        ]);
        // Unchanged content leaves no new commit. Re-hash first: the directory
        // can still change under a concurrent save.
        if (existingTree === skillTree) {
          if (
            (await this.hashWorkingSkill(root, subpath, indexDir)) !== skillTree
          ) {
            return "source-changed";
          }
          return "pushed";
        }
      }

      const commit = await this.commitSkillOnto(
        root,
        { subpath, tree: skillTree },
        base,
        existingTip ?? base,
        indexDir,
        `${PROMOTE_SUBJECT}${name}`,
      );
      // A save halfway through `git add` mixes two revisions: refuse a tree
      // that moved, since a pushed branch cannot be taken back.
      // ponytail: detects the race, does not prevent it.
      if (
        (await this.hashWorkingSkill(root, subpath, indexDir)) !== skillTree
      ) {
        return "source-changed";
      }
      return await this.pushPromotion(root, name, commit);
    } catch {
      // Only the class crosses, never git's words or a path.
      return "push-failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async pushSkillDeletion(
    root: string,
    name: string,
    base: string,
  ): Promise<SkillPushOutcome> {
    const subpath = harnessSkillSubpath(name);
    // Re-read: the author may restore the directory while confirmation is in flight.
    if (await pathExists(join(root, subpath))) {
      return "source-changed";
    }
    if (!(await this.pushLandsWhereItFetched(root))) {
      return "push-elsewhere";
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-delete-"));
    try {
      const branchRef = `${PROMOTE_BRANCHES}/${name}`;
      await this.refreshPromoteBranchRef(root, name);
      const existingTip = await this.read(root, ["rev-parse", branchRef]);
      if (existingTip !== null) {
        const existingTree = await this.read(root, [
          "rev-parse",
          `${branchRef}:${subpath}`,
        ]);
        if (existingTree === null) {
          return "pushed";
        }
      }

      const commit = await this.commitSkillOnto(
        root,
        { subpath, tree: null },
        base,
        existingTip ?? base,
        indexDir,
        `${REMOVE_SUBJECT}${name}`,
      );
      // Reappeared since the guard: refuse, a pushed branch cannot be taken back.
      if (await pathExists(join(root, subpath))) {
        return "source-changed";
      }
      return await this.pushPromotion(root, name, commit);
    } catch {
      return "push-failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  // Fixed order, so a tree that is several at once always refuses under the
  // same name. A check that could not run is fail-closed (#580).
  async readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null> {
    // `--type=bool` normalises `1` and `on` to `true`.
    const sparse = await this.read(root, [
      "config",
      "--type=bool",
      "--get",
      "core.sparseCheckout",
    ]);
    if (sparse === "true") {
      return "sparse-checkout";
    }
    if (await this.refExists(root, "MERGE_HEAD")) {
      return "merge-in-progress";
    }
    for (const dir of ["rebase-merge", "rebase-apply"]) {
      const path = await this.read(root, ["rev-parse", "--git-path", dir]);
      if (path !== null && (await pathExists(join(root, path)))) {
        return "rebase-in-progress";
      }
    }
    // Raw stdout: empty means nothing unmerged; only a failed command is null.
    const unmerged = await this.readOutput(root, ["ls-files", "--unmerged"]);
    if (unmerged === null) {
      return "unreadable";
    }
    return unmerged.trim() === "" ? null : "unresolved-conflicts";
  }

  private async refExists(root: string, ref: string): Promise<boolean> {
    return (
      (await this.read(root, ["rev-parse", "--verify", "--quiet", ref])) !==
      null
    );
  }

  // Both sides as git resolves them, after `pushurl`, `pushInsteadOf` and `insteadOf`.
  private async pushLandsWhereItFetched(root: string): Promise<boolean> {
    const listed = await this.read(root, [
      "remote",
      "get-url",
      "--push",
      "--all",
      "origin",
    ]);
    return pushesWhereItFetched(
      await readGitOriginUrl(root),
      listed === null ? [] : listed.split("\n").filter((url) => url !== ""),
    );
  }

  // Failure (offline, branch deleted) leaves the existing local ref standing.
  private async refreshPromoteBranchRef(
    root: string,
    name: string,
  ): Promise<void> {
    await run(
      "git",
      [
        "-C",
        root,
        "fetch",
        "origin",
        `+refs/heads/${promoteBranch(name)}:${PROMOTE_BRANCHES}/${name}`,
      ],
      gitOptions(),
    ).catch(() => {});
  }

  // Seeded from HEAD: git exempts only tracked files from the ignore rules, so
  // an index built from nothing would drop tracked-but-ignored files.
  private async hashWorkingSkill(
    root: string,
    subpath: string,
    indexDir: string,
  ): Promise<string> {
    const options = indexOptions(join(indexDir, "working"));
    // Only an unborn HEAD fails here.
    await run("git", ["-C", root, "read-tree", "HEAD"], options).catch(
      () => {},
    );
    await run("git", ["-C", root, "add", "-A", "--", subpath], options);
    const { stdout } = await run("git", ["-C", root, "write-tree"], options);
    return (
      await run(
        "git",
        ["-C", root, "rev-parse", `${stdout.trim()}:${subpath}`],
        options,
      )
    ).stdout.trim();
  }

  // `read-tree --prefix` refuses a path the index already holds, so the base's
  // copy is dropped first; `tree: null` stops there (a removal). `parent` is the
  // promote branch's tip when one exists, so the push fast-forwards (#578).
  private async commitSkillOnto(
    root: string,
    skill: { subpath: string; tree: string | null },
    treeBase: string,
    parent: string,
    indexDir: string,
    subject: string,
  ): Promise<string> {
    const options = indexOptions(join(indexDir, "promote"));
    await run("git", ["-C", root, "read-tree", treeBase], options);
    await run(
      "git",
      [
        "-C",
        root,
        "rm",
        "-r",
        "-f",
        "-q",
        "--cached",
        "--ignore-unmatch",
        "--",
        skill.subpath,
      ],
      options,
    );
    if (skill.tree !== null) {
      await run(
        "git",
        ["-C", root, "read-tree", `--prefix=${skill.subpath}/`, skill.tree],
        options,
      );
    }
    const { stdout: tree } = await run(
      "git",
      ["-C", root, "write-tree"],
      options,
    );
    // No author, no signing flag: the author's own git config applies (#574).
    const { stdout: commit } = await run(
      "git",
      ["-C", root, "commit-tree", tree.trim(), "-p", parent, "-m", subject],
      options,
    );
    return commit.trim();
  }

  // Never `--force`: a branch this commit does not descend from is a refusal,
  // not a history to overwrite (#578).
  private async pushPromotion(
    root: string,
    name: string,
    commit: string,
  ): Promise<SkillPushOutcome> {
    try {
      await run(
        "git",
        [
          "-C",
          root,
          ...NO_HOOKS,
          "push",
          "origin",
          `${commit}:refs/heads/${promoteBranch(name)}`,
        ],
        gitOptions(),
      );
      return "pushed";
    } catch (error) {
      const failure =
        classifyGitError(error, classifyFetchFailure) === "offline"
          ? "offline"
          : "push-failed";
      return await this.settlePromotion(root, name, commit, failure);
    }
  }

  // A push can fail after the remote already moved the branch, so the remote is
  // asked (#577). A teammate may have fast-forwarded past this commit since, so
  // being an ancestor of the tip also counts as pushed.
  private async settlePromotion(
    root: string,
    name: string,
    commit: string,
    failure: SkillPushOutcome,
  ): Promise<SkillPushOutcome> {
    const branchRef = `refs/heads/${promoteBranch(name)}`;
    const listing = await run(
      "git",
      ["-C", root, "ls-remote", "origin", branchRef],
      gitOptions(),
    ).then(
      ({ stdout }) => stdout.trim(),
      () => "",
    );
    const [pushed] = listing.split("\t");
    if (pushed === undefined || pushed === "") {
      return failure;
    }
    if (pushed === commit) {
      return "pushed";
    }
    // `merge-base` needs the tip's object locally.
    const fetched = await run(
      "git",
      [
        "-C",
        root,
        "fetch",
        "origin",
        `+${branchRef}:${PROMOTE_BRANCHES}/${name}`,
      ],
      gitOptions(),
    ).then(
      () => true,
      () => false,
    );
    if (!fetched) {
      return failure;
    }
    const isAncestor = await run(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", commit, pushed],
      gitOptions(),
    ).then(
      () => true,
      () => false,
    );
    return isAncestor ? "pushed" : failure;
  }

  async readFacts(root: string): Promise<HarnessFacts> {
    return {
      originUrl: await readConfiguredGitOriginUrl(root),
      defaultBranch: await readRemoteDefaultBranch(root),
      defaultBranchCommit: await this.read(root, ["rev-parse", REMOTE_HEAD]),
      tags: await this.readTags(root),
    };
  }

  // Null where a ref could not be read, so an unreadable clone never reads as one with nothing waiting.
  async readMovementTrees(root: string): Promise<HarnessSkillTrees | null> {
    const remote = await this.readSkillTrees(root, REMOTE_HEAD);
    const local = await this.readSkillTrees(root, "HEAD");
    const working = await this.workingSkillTrees(root);
    if (remote === null || local === null || working === null) {
      return null;
    }
    return {
      remote: byName(remote),
      promote: await this.promoteRefs(root),
      local: byName(local),
      working: byName(working),
    };
  }

  // Takes the exact commit, never `origin/HEAD`: a concurrent fetch can re-point
  // that ref and mix two snapshots of the remote (#579).
  async mergeBaseCommit(
    root: string,
    remoteCommit: string,
  ): Promise<string | null> {
    return this.read(root, ["merge-base", remoteCommit, "HEAD"]);
  }

  catchUp = catchUpClone;
  readCloneSync = readCloneSync;

  readLocalHeadCommit = readLocalHead;
  readStagedSkillDifference = readStagedDifference;
  writeSkillTreeInto = writeSkillTree;

  // Each branch is read only for the skill it is named for; a null tree is a
  // branch proposing to delete its skill.
  private async promoteRefs(
    root: string,
  ): Promise<Record<string, HarnessPromoteRef>> {
    const listing = await this.read(root, [
      "for-each-ref",
      `--format=${PROMOTE_FORMAT}`,
      PROMOTE_BRANCHES,
    ]);
    if (listing === null) {
      return {};
    }

    const named = await Promise.all(
      listing.split("\n").map(async (line) => {
        const [skill = "", commit = ""] = line.split("\t");
        const tree = await this.read(root, [
          "rev-parse",
          `${PROMOTE_BRANCHES}/${skill}:${harnessSkillSubpath(skill)}`,
        ]);
        return [skill, { tree, commit: commit || null }] as const;
      }),
    );
    return Object.fromEntries(named);
  }

  // A throwaway index, so the author's staged work never moves.
  private async workingSkillTrees(
    root: string,
  ): Promise<HarnessSkillTree[] | null> {
    // Every other failure below must throw: read as "nothing on disk" it would
    // show the whole harness as locally deleted.
    if (!(await pathExists(join(root, HARNESS_SKILLS_DIR)))) {
      return [];
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-index-"));
    const options = indexOptions(join(indexDir, "index"));
    try {
      // Seeded from HEAD, as in `hashWorkingSkill`.
      await run("git", ["-C", root, "read-tree", "HEAD"], options).catch(
        () => {},
      );
      await run(
        "git",
        ["-C", root, "add", "-A", "--", HARNESS_SKILLS_DIR],
        options,
      );
      const { stdout } = await run("git", ["-C", root, "write-tree"], options);
      return await this.readSkillTrees(root, stdout.trim());
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async readOrigin(root: string): Promise<GitOrigin | null> {
    const url = await readConfiguredGitOriginUrl(root);
    return url === null ? null : parseGitOrigin(url);
  }

  async readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null> {
    return this.readSkillTrees(root, `${MAESTRO_TAGS}/${tag}`);
  }

  async readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    return this.readSkillManifests(root, `${MAESTRO_TAGS}/${tag}`, names);
  }

  // Null on an unreadable ref or a listing this parser does not recognise.
  async readSkillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    // `-z`: otherwise git quotes any non-ASCII name.
    const listing = await this.readOutput(root, [
      "ls-tree",
      "-z",
      `${ref}:${HARNESS_SKILLS_DIR}`,
    ]);
    if (listing === null) {
      // Tells an unresolvable ref from one with no skills directory. `^{tree}`:
      // `workingSkillTrees` passes a bare tree hash (#580).
      const resolves = await this.readOutput(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref}^{tree}`,
      ]);
      return resolves === null ? null : [];
    }

    const skills: HarnessSkillTree[] = [];
    for (const entry of listing.split("\0")) {
      if (entry === "") {
        continue;
      }
      const [meta = "", name = ""] = entry.split("\t");
      const [mode, type, treeHash] = meta.split(" ");
      if (!mode || !type || !treeHash || !name) {
        // Skipping the line would read as a removal nobody made.
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

  // Null where the SKILL.md is missing at `ref`.
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

  // Null only when the command failed; raw stdout, since `-z` names must stay untouched.
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

  private read(root: string, args: string[]): Promise<string | null> {
    return runGitText(root, args);
  }

  // `readOutput`, not `read`: a failed command must not read as a harness never released (#519).
  async readTags(root: string): Promise<HarnessTag[] | null> {
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

// A run we cut off got no answer, so it is offline, never a reply.
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
