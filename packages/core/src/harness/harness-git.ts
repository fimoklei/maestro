// The Harness home base's git surface: fine-grained reads and one fetch, always
// through argument arrays (security.md). Nothing leaves as stdout or stderr — a
// failure leaves as a class, a read as a named field (ADR-0021).
import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  readConfiguredGitOriginUrl,
  readGitOriginUrl,
} from "../deploy/git-origin-url";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { readRemoteDefaultBranch } from "../inventory/default-branch";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { classifyFetchFailure } from "./classify-fetch-failure";
import { classifyPushFailure } from "./classify-push-failure";
import { PROMOTE_NAMESPACE, promoteBranch } from "./promote-branch";
import { pushesWhereItFetched } from "./push-destination";
import type {
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
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

// Remote tags land in a namespace Maestro owns, never in `refs/tags`: an
// unpushed local tag must not be read as a release, and pruning here can never
// delete a tag the author made (#516).
const MAESTRO_TAGS = "refs/maestro/tags";
const TAG_REFSPEC = `+refs/tags/*:${MAESTRO_TAGS}/*`;
const BRANCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

// One branch per skill under review, named after the skill it carries. Fetched
// by the branch refspec above, so what is read here is what the team pushed.
const PROMOTE_BRANCHES = `refs/remotes/origin/${PROMOTE_NAMESPACE}`;

// Fixed, so a pull request starts legibly without Maestro asking for a message.
const PROMOTE_SUBJECT = "Promote skill: ";
const REMOVE_SUBJECT = "Remove skill: ";

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

  // The promotion commit, built entirely in loose objects and two throwaway
  // indexes: `base`'s tree with exactly this skill's directory replaced by
  // what is on disk. Nothing here checks out, stages in the author's index,
  // moves HEAD, or names a local branch (#574, #578).
  async pushSkillPromotion(
    root: string,
    name: string,
    base: string,
  ): Promise<PromoteSkillOutcome> {
    const subpath = harnessSkillSubpath(name);
    if (!(await pathExists(join(root, subpath)))) {
      // A skill that is not on disk is a deletion, and a deletion is its own
      // confirmed route (#580) — never something a promotion infers.
      return "skill-missing";
    }

    // Asked before any object is written: `git push origin` resolves its own
    // destination, and one that is not where the fetch came from would publish
    // this skill under a link naming somewhere else.
    if (!(await this.pushLandsWhereItFetched(root))) {
      return "push-elsewhere";
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-promote-"));
    try {
      const skillTree = await this.hashWorkingSkill(root, subpath, indexDir);

      // The branch this fetch already brought back can be stale by now: local
      // object work between that fetch and here takes time, and another
      // author's own promotion can land on the real branch in that window.
      // Re-fetching this one ref, right before trusting it, closes most of
      // that window (#578).
      const branchRef = `${PROMOTE_BRANCHES}/${name}`;
      await this.refreshPromoteBranchRef(root, name);
      const existingTip = await this.read(root, ["rev-parse", branchRef]);
      if (existingTip !== null) {
        const existingTree = await this.read(root, [
          "rev-parse",
          `${branchRef}:${subpath}`,
        ]);
        // Already carries exactly this content: a press with nothing changed
        // leaves no new commit behind. Re-hashed once more first: the working
        // directory can still mutate under a clean filter or a concurrent
        // save between the read above and this decision.
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
      // `git add` walks the directory file by file, so a save landing halfway
      // through leaves a tree mixing two revisions. Read again and refuse a
      // tree that moved: a pushed branch is not something to take back.
      // ponytail: detects the race, does not prevent it — a promotion of a
      // directory being written to is refused, never silently repaired.
      if (
        (await this.hashWorkingSkill(root, subpath, indexDir)) !== skillTree
      ) {
        return "source-changed";
      }
      // The push classifies its own reply; everything above it is local object
      // work, and any way git refuses that is one failure to retry. Whatever it
      // said about it stays here: a class crosses, never git's words or a path
      // (ADR-0021, security.md).
      return await this.pushPromotion(root, name, commit);
    } catch {
      return "push-failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  // The removal commit, built in one throwaway index: `base`'s tree with this
  // skill's directory taken out. Nothing here checks out, stages in the
  // author's index, moves HEAD, or names a local branch (#580).
  async pushSkillDeletion(
    root: string,
    name: string,
    base: string,
  ): Promise<SkillPushOutcome> {
    const subpath = harnessSkillSubpath(name);
    // A skill that is back on disk is an edit, and takes the promotion route.
    // The use-case already read this; re-read here because the directory is
    // the author's to restore while the confirmation is in flight.
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
        // The branch already carries the removal: a second confirmation with
        // nothing left to remove leaves no new commit behind.
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
      // The directory reappearing between the guard above and here would make
      // this a removal the author no longer intends. Refuse rather than push:
      // a pushed branch is not something to take back.
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

  // Every way the working tree stops answering for the author's whole intent,
  // asked in a fixed order so a tree that is several at once always refuses
  // under the same name. A check that could not run is fail-closed (#580).
  async readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null> {
    // `--type=bool` normalises git's own spellings, so `1` and `on` read the
    // same as `true`. Absent is exit 1, which `read` reports as null.
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
    // Raw stdout: an empty listing is a tree with nothing unmerged, and only a
    // failed command is null — collapsing the two would read a git failure as
    // a clean working tree.
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

  // Both sides as git itself resolves them: `--push --all` names every push
  // destination after `pushurl` and `pushInsteadOf`, and `get-url` the fetch one
  // after `insteadOf`. An unreadable side is no destination at all.
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

  // Updates just this one remote-tracking ref to the branch's live tip,
  // rather than trusting whatever the harness's last general fetch found.
  // Failure (offline, branch deleted) leaves the existing local ref standing
  // — the caller's own read of it then answers exactly as before this call.
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

  // The skill exactly as it sits on disk. Seeded from HEAD for the same reason
  // `workingSkillTrees` is: git exempts only already-tracked files from the
  // ignore rules, so an index built from nothing would drop them.
  private async hashWorkingSkill(
    root: string,
    subpath: string,
    indexDir: string,
  ): Promise<string> {
    const options = indexOptions(join(indexDir, "working"));
    // Only an unborn HEAD has no tree to seed from; every other failure here is
    // left to the caller's own classification.
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

  // `read-tree --prefix` refuses a path the index already holds, so the tree
  // base's own copy is dropped from the index first. `treeBase` is always the
  // freshly fetched tip; `parent` is the existing promote branch's own tip
  // when there is one, so the push that follows is a fast-forward (#578).
  //
  // `tree: null` stops after the drop, which is the whole of a removal: the
  // base's tree with exactly this one subpath gone (#580).
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
    // No author, no signing flag: whatever the author's own git is configured
    // to do is what this commit carries (#574).
    const { stdout: commit } = await run(
      "git",
      ["-C", root, "commit-tree", tree.trim(), "-p", parent, "-m", subject],
      options,
    );
    return commit.trim();
  }

  // Never `--force`: a branch this commit does not descend from is a refusal
  // to report, not a history to overwrite. A cumulative commit descends from
  // the branch's own tip, so its push is an ordinary fast-forward (#578).
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

  // The lost reply `settlePush` settles for a tag: a push can fail on the way
  // back from a remote that already moved the branch, and reported as a failure
  // it strands the author — their retry builds a second commit on the same tip,
  // which their own pushed branch then refuses. So the remote is asked (#577).
  //
  // The live tip need not equal this push's own commit to count as settled: a
  // teammate's own promotion can fast-forward the branch again in the time it
  // takes the reply to come back, and this commit is still on the branch,
  // just no longer its tip.
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
    // The tip moved past this commit — fetch it locally so ancestry can
    // actually be checked; without the object, `merge-base` cannot answer.
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

  // The fork point local HEAD and one exact remote commit last agreed on —
  // the one commit-level fact tree hashes alone cannot give (ADR-0021). Takes
  // the commit rather than resolving `origin/HEAD` itself: that ref is
  // mutable, and a concurrent fetch elsewhere in the app can re-point it
  // between the caller's own read of it and this call — comparing against a
  // ref instead of the exact commit the caller already has would then mix
  // two different snapshots of the remote (#579). Null is unreadable —
  // unrelated histories, or a clone this fetch never reached.
  async mergeBaseCommit(
    root: string,
    remoteCommit: string,
  ): Promise<string | null> {
    return this.read(root, ["merge-base", remoteCommit, "HEAD"]);
  }

  // The clone's own HEAD, not `origin/HEAD`: a restoration is confirmed
  // against the author's last local commit (ADR-0030).
  async readLocalHeadCommit(root: string): Promise<string | null> {
    return this.read(root, ["rev-parse", "HEAD"]);
  }

  // Exit 0 is a clean entry, exit 1 is a staged difference, and anything else
  // — a killed run included — is a question that got no answer (#888).
  async readStagedSkillDifference(
    root: string,
    name: string,
  ): Promise<boolean | null> {
    try {
      await run(
        "git",
        [
          "-C",
          root,
          "diff-index",
          "--cached",
          "--quiet",
          "HEAD",
          "--",
          harnessSkillSubpath(name),
        ],
        gitOptions(),
      );
      return false;
    } catch (error) {
      const killed = (error as { killed?: boolean }).killed === true;
      return !killed && (error as { code?: number }).code === 1 ? true : null;
    }
  }

  // git writes the bytes and the mode bits from the commit itself, through a
  // throwaway index, so nothing here is re-implemented and nothing the author
  // staged moves. The caller publishes the result with one rename (#888).
  async writeSkillTreeInto(
    root: string,
    name: string,
    commit: string,
    into: string,
  ): Promise<"written" | "missing" | "failed"> {
    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-restore-"));
    const options = indexOptions(join(indexDir, "index"));
    try {
      try {
        await run(
          "git",
          [
            "-C",
            root,
            "read-tree",
            `--prefix=${name}/`,
            `${commit}:${harnessSkillSubpath(name)}`,
          ],
          options,
        );
      } catch {
        // The commit does not hold that path. Every other failure below stays
        // `failed`: a read that broke must never be reported as absence.
        return "missing";
      }
      await run(
        "git",
        ["-C", root, "checkout-index", "-a", "-f", `--prefix=${into}/`],
        options,
      );
      return "written";
    } catch {
      return "failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
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
    const options = indexOptions(join(indexDir, "index"));
    try {
      // Seeded from HEAD, because git exempts only already-tracked files from
      // the ignore rules — from an empty index a tracked-but-ignored skill
      // file would silently drop out of the hash. An unborn HEAD has none.
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

  // The repository the connected clone releases from, in the terms apm's ref
  // names it. Null where it cannot be read or cannot carry a deploy (ADR-0014).
  async readOrigin(root: string): Promise<GitOrigin | null> {
    const url = await readConfiguredGitOriginUrl(root);
    return url === null ? null : parseGitOrigin(url);
  }

  // Skill trees at a published tag. Read from the namespace `fetch` brings
  // remote tags into, so an unpushed local `refs/tags/<name>` never answers.
  async readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null> {
    return this.readSkillTrees(root, `${MAESTRO_TAGS}/${tag}`);
  }

  // Each named skill's SKILL.md at a published tag, read from the same
  // namespace `readSkillTreesAtTag` reads.
  async readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    return this.readSkillManifests(root, `${MAESTRO_TAGS}/${tag}`, names);
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
      // `^{tree}`, not `^{commit}`: `workingSkillTrees` passes a bare tree
      // hash, and deleting the last skill leaves nothing git tracks there —
      // asked as a commit, an empty harness reads as unreadable (#580).
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
  private read(root: string, args: string[]): Promise<string | null> {
    return runGitText(root, args);
  }

  // `readOutput`, not `read`: an empty listing is a namespace with no tags,
  // and only a failed command is null. Collapsing the two would read a git
  // failure as a harness that has never been released (#519).
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

// The author's hooks are theirs, and these commands promise to leave the
// checkout alone: a `pre-push` hook is free to write in the working tree, or to
// fail after the remote already took the push. `devNull` is a hooks directory
// git finds nothing in, so none of them run. Passed as `-c` rather than through
// `GIT_CONFIG_*`, which would silently drop config the caller's env already
// carries (#574).
const NO_HOOKS = ["-c", `core.hooksPath=${devNull}`];

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
