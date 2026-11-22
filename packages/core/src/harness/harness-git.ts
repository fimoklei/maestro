import { execFile } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import { catchUpClone, readCloneSync } from "../git/catch-up-clone";
import { readConfiguredGitOriginUrl } from "../git/configured-origin";
import { gitOptions, NO_HOOKS } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { readRemoteDefaultBranch } from "../inventory/default-branch";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { classifyFetchFailure } from "./classify-fetch-failure";
import { classifyGitError } from "./classify-git-error";
import { classifyPushFailure } from "./classify-push-failure";
import { withdrawOnDefaultBranch } from "./default-branch-withdrawal-git";
import {
  type HarnessObject,
  type HarnessPrimitiveType,
  PROPOSAL_REFS,
  type PrimitiveRef,
  proposalBranch,
  proposalBranchLeaf,
} from "./harness-primitive";
import {
  commitSubjectsOnto,
  hashWorkingPrimitive,
  listPrimitivesAt,
  listWorkingPrimitives,
  primitiveOnDisk,
  readAuthors,
  readListHash,
  readListProposal,
  readPrimitiveHash,
  readProposalRefs,
  readStagedDifference,
  readWorkingDifferences,
  writePrimitiveInto,
} from "./harness-primitive-git";
import { pushListFile } from "./list-file-git";
import {
  deleteProposalBranch,
  readBranchAuthorship,
  readCommitEmail,
  readUnproposedFiles,
} from "./proposal-branch-git";
import { type ProposalKind, proposalTitle } from "./proposal-request";
import type { ListSubject, ProposalSubject } from "./proposal-subject";
import { pushesWhereItFetched } from "./push-destination";
import type {
  BranchAuthorship,
  DefaultBranchWithdrawal,
  FileAtRef,
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessMovementTrees,
  HarnessTag,
  ListFilePush,
  ListProposalRefs,
  ListPushOutcome,
  PromoteSkillOutcome,
  PublishTagOutcome,
  SkillPushOutcome,
  WithdrawalPushOutcome,
  WorktreeAmbiguity,
} from "./read-harness-state";
import {
  type HarnessSkillTree,
  parseSkillTreeListing,
  type ReleasedContentReader,
} from "./released-content";
import { remoteBranchHolds } from "./remote-branch-holds";

const run = promisify(execFile);

const REMOTE_HEAD = "refs/remotes/origin/HEAD";

export const MAESTRO_TAGS = "refs/maestro/tags";
const TAG_REFSPEC = `+refs/tags/*:${MAESTRO_TAGS}/*`;
const BRANCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

const UNQUOTED_NAMES = "-z";

const TAG_FORMAT = `%(refname:lstrip=${MAESTRO_TAGS.split("/").length})\t%(objectname)\t%(*objectname)`;

export class HarnessGitAdapter implements HarnessGitPort {
  private readonly released: ReleasedContentReader;

  // One reader per server, shared with the inventory adapter, so released
  // content read once is remembered across requests.
  constructor(deps: { released: ReleasedContentReader }) {
    this.released = deps.released;
  }

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
      const settled = await this.settlePush(
        root,
        name,
        commit,
        failure === "refused" ? "push-failed" : failure,
      );
      if (settled !== "pushed") {
        return settled;
      }
    }
    await run(
      "git",
      ["-C", root, "update-ref", `${MAESTRO_TAGS}/${name}`, commit],
      options,
    ).catch(() => {});
    return "pushed";
  }

  private async settlePush(
    root: string,
    name: string,
    commit: string,
    failure: PublishTagOutcome,
  ): Promise<PublishTagOutcome> {
    if (failure === "already-exists" || failure === "stale-tip") {
      return failure;
    }
    const listing = await runGitText(root, [
      "ls-remote",
      "origin",
      `refs/tags/${name}`,
    ]);
    if (listing === null) {
      return failure;
    }
    const [published] = listing.split("\t");
    // A different object is another author's tag: never force over it.
    return published === commit ? "pushed" : "already-exists";
  }

  // Built in throwaway indexes only: never checks out, stages in the author's
  // index, moves HEAD, or names a local branch (#574, #578).
  async pushPromotion(
    root: string,
    ref: PrimitiveRef,
    base: string,
    kind: Exclude<ProposalKind, "deletion">,
  ): Promise<PromoteSkillOutcome> {
    if (!(await primitiveOnDisk(root, ref))) {
      return "skill-missing";
    }

    if (!(await this.pushLandsWhereItFetched(root))) {
      return "push-elsewhere";
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-promote-"));
    try {
      const object = await hashWorkingPrimitive(root, ref, indexDir);

      const branchRef = `${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`;
      await this.refreshProposalRef(root, ref);
      const existingTip = await runGitText(root, ["rev-parse", branchRef]);
      if (existingTip !== null) {
        const existing = await readPrimitiveHash(root, branchRef, ref);
        if (existing === object.hash) {
          if (
            (await hashWorkingPrimitive(root, ref, indexDir)).hash !==
            object.hash
          ) {
            return "source-changed";
          }
          return "pushed";
        }
      }

      const commit = await commitSubjectsOnto(
        root,
        [{ subject: ref, object }],
        {
          treeBase: base,
          parents: [existingTip ?? base],
          indexDir,
          message: proposalTitle(ref, kind),
        },
      );
      if (
        (await hashWorkingPrimitive(root, ref, indexDir)).hash !== object.hash
      ) {
        return "source-changed";
      }
      return await this.pushProposal(root, ref, commit);
    } catch {
      return "push-failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async pushDeletion(
    root: string,
    ref: PrimitiveRef,
    base: string,
  ): Promise<SkillPushOutcome> {
    // Re-read: the author may restore it while confirmation is in flight.
    if (await primitiveOnDisk(root, ref)) {
      return "source-changed";
    }
    if (!(await this.pushLandsWhereItFetched(root))) {
      return "push-elsewhere";
    }

    const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-delete-"));
    try {
      const branchRef = `${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`;
      await this.refreshProposalRef(root, ref);
      const existingTip = await runGitText(root, ["rev-parse", branchRef]);
      if (existingTip !== null) {
        const existing = await readPrimitiveHash(root, branchRef, ref);
        if (existing === null) {
          return "pushed";
        }
      }

      const commit = await commitSubjectsOnto(
        root,
        [{ subject: ref, object: null }],
        {
          treeBase: base,
          parents: [existingTip ?? base],
          indexDir,
          message: proposalTitle(ref, "deletion"),
        },
      );
      // Reappeared since the guard: refuse, a pushed branch cannot be taken back.
      if (await primitiveOnDisk(root, ref)) {
        return "source-changed";
      }
      return await this.pushProposal(root, ref, commit);
    } catch {
      return "push-failed";
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  }

  async withdrawOnDefaultBranch(
    root: string,
    withdrawal: DefaultBranchWithdrawal,
  ): Promise<WithdrawalPushOutcome> {
    return await withdrawOnDefaultBranch(root, withdrawal, {
      pushLandsWhereItFetched: () => this.pushLandsWhereItFetched(root),
    });
  }

  async pushListFile(
    root: string,
    push: ListFilePush,
  ): Promise<ListPushOutcome> {
    return await pushListFile(root, push, {
      pushLandsWhereItFetched: () => this.pushLandsWhereItFetched(root),
    });
  }

  async readUnproposedFiles(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string[] | null> {
    return await readUnproposedFiles(root, ref);
  }

  async readWorkingDifferences(
    root: string,
    refs: readonly PrimitiveRef[],
    commit: string,
  ): Promise<string[] | null> {
    return await readWorkingDifferences(root, refs, commit);
  }

  async readAuthoredHere(
    root: string,
    subject: ProposalSubject,
    base: string,
  ): Promise<BranchAuthorship> {
    return await readBranchAuthorship(
      root,
      subject,
      base,
      await readCommitEmail(root),
    );
  }

  async readPushesWhereItFetched(root: string): Promise<boolean> {
    return await this.pushLandsWhereItFetched(root);
  }

  async deleteProposalBranch(
    root: string,
    subject: ProposalSubject,
  ): Promise<"deleted" | "failed"> {
    if (!(await this.pushLandsWhereItFetched(root))) {
      return "failed";
    }
    return await deleteProposalBranch(root, subject);
  }

  async readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null> {
    const sparse = await runGitText(root, [
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
      const path = await runGitText(root, ["rev-parse", "--git-path", dir]);
      if (path !== null && (await pathExists(join(root, path)))) {
        return "rebase-in-progress";
      }
    }
    const unmerged = await this.readRawOutput(root, ["ls-files", "--unmerged"]);
    if (unmerged === null) {
      return "unreadable";
    }
    return unmerged.trim() === "" ? null : "unresolved-conflicts";
  }

  private async refExists(root: string, ref: string): Promise<boolean> {
    return (
      (await runGitText(root, ["rev-parse", "--verify", "--quiet", ref])) !==
      null
    );
  }

  private async pushLandsWhereItFetched(root: string): Promise<boolean> {
    const listed = await runGitText(root, [
      "remote",
      "get-url",
      "--push",
      "--all",
      "origin",
    ]);
    return pushesWhereItFetched(
      await runGitText(root, ["remote", "get-url", "origin"]),
      listed === null ? [] : listed.split("\n").filter((url) => url !== ""),
    );
  }

  private async refreshProposalRef(
    root: string,
    ref: PrimitiveRef,
  ): Promise<void> {
    await run(
      "git",
      [
        "-C",
        root,
        "fetch",
        "origin",
        `+refs/heads/${proposalBranch(ref)}:${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`,
      ],
      gitOptions(),
    ).catch(() => {});
  }

  // Never `--force`: a branch this commit does not descend from is a refusal,
  // not a history to overwrite (#578).
  private async pushProposal(
    root: string,
    ref: PrimitiveRef,
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
          `${commit}:refs/heads/${proposalBranch(ref)}`,
        ],
        gitOptions(),
      );
      return "pushed";
    } catch (error) {
      const failure =
        classifyGitError(error, classifyFetchFailure) === "offline"
          ? "offline"
          : "push-failed";
      return await this.settlePromotion(root, ref, commit, failure);
    }
  }

  private async settlePromotion(
    root: string,
    ref: PrimitiveRef,
    commit: string,
    failure: SkillPushOutcome,
  ): Promise<SkillPushOutcome> {
    const branchRef = `refs/heads/${proposalBranch(ref)}`;
    const holds = await remoteBranchHolds(
      root,
      branchRef,
      commit,
      `+${branchRef}:${PROPOSAL_REFS}/${proposalBranchLeaf(ref)}`,
    );
    return holds ? "pushed" : failure;
  }

  async readFacts(root: string): Promise<HarnessFacts> {
    return {
      originUrl: await readConfiguredGitOriginUrl(root),
      defaultBranch: await readRemoteDefaultBranch(root),
      defaultBranchCommit: await runGitText(root, ["rev-parse", REMOTE_HEAD]),
      tags: await this.readTags(root),
    };
  }

  async readMovementTrees(root: string): Promise<HarnessMovementTrees | null> {
    const remote = await listPrimitivesAt(root, REMOTE_HEAD);
    const local = await listPrimitivesAt(root, "HEAD");
    const working = await listWorkingPrimitives(root);
    if (remote === null || local === null || working === null) {
      return null;
    }
    const promote = await readProposalRefs(root, REMOTE_HEAD);
    const hashesOf = (objects: HarnessObject[], type: HarnessPrimitiveType) =>
      Object.fromEntries(
        objects
          .filter((object) => object.type === type)
          .map((object) => [object.name, object.hash]),
      );
    const typed = (type: HarnessPrimitiveType) => ({
      remote: hashesOf(remote, type),
      promote: promote[type],
      local: hashesOf(local, type),
      working: hashesOf(working, type),
    });
    return { skill: typed("skill"), prompt: typed("prompt") };
  }

  readListProposal(
    root: string,
    subject: ListSubject,
  ): Promise<ListProposalRefs | null> {
    return readListProposal(root, subject, REMOTE_HEAD);
  }

  // Takes the exact commit, never `origin/HEAD`: a concurrent fetch can re-point
  // that ref and mix two snapshots of the remote (#579).
  async mergeBaseCommit(
    root: string,
    remoteCommit: string,
  ): Promise<string | null> {
    return runGitText(root, ["merge-base", remoteCommit, "HEAD"]);
  }

  catchUp = catchUpClone;
  readCloneSync = readCloneSync;

  readLocalHeadCommit(root: string): Promise<string | null> {
    return runGitText(root, ["rev-parse", "HEAD"]);
  }

  readPrimitives = listPrimitivesAt;

  async readRootFiles(root: string, ref: string): Promise<string[] | null> {
    const listing = await this.readRawOutput(root, [
      "ls-tree",
      UNQUOTED_NAMES,
      ref,
    ]);
    return listing === null
      ? null
      : listing.split("\0").flatMap((line) => {
          const [meta = "", name] = line.split("\t");
          return name !== undefined && meta.split(" ")[1] === "blob"
            ? [name]
            : [];
        });
  }

  async readFileAt(
    root: string,
    ref: string,
    path: string,
    maxBytes: number,
  ): Promise<FileAtRef | null> {
    const listing = await this.readRawOutput(root, [
      "ls-tree",
      UNQUOTED_NAMES,
      "-l",
      ref,
      "--",
      path,
    ]);
    if (listing === null) return null;
    const [meta = "", name] = listing.split("\0")[0]?.split("\t") ?? [];
    const [, type, hash, size] = meta.split(/\s+/);
    if (name !== path || type !== "blob" || hash === undefined) {
      return { kind: "absent" };
    }
    if (Number(size) > maxBytes) return { kind: "too-large" };
    const text = await this.readRawOutput(root, ["cat-file", "blob", hash]);
    return text === null ? null : { kind: "text", text };
  }

  readAuthors = readAuthors;
  readListHash = readListHash;
  readStagedDifference = readStagedDifference;
  writePrimitiveInto = writePrimitiveInto;

  async readOrigin(root: string): Promise<GitOrigin | null> {
    const url = await readConfiguredGitOriginUrl(root);
    return url === null ? null : parseGitOrigin(url);
  }

  async readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null> {
    return this.released.skillTrees(root, `${MAESTRO_TAGS}/${tag}`);
  }

  async readPrimitivesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessObject[] | null> {
    return this.released.primitives(root, `${MAESTRO_TAGS}/${tag}`);
  }

  async readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    return this.released.skillManifests(root, `${MAESTRO_TAGS}/${tag}`, names);
  }

  async readPromptTextsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string> | null> {
    return this.released.promptTexts(root, `${MAESTRO_TAGS}/${tag}`, names);
  }

  async readSkillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    const listing = await this.readRawOutput(root, [
      "ls-tree",
      UNQUOTED_NAMES,
      `${ref}:${HARNESS_SKILLS_DIR}`,
    ]);
    if (listing === null) {
      // Tells an unresolvable ref from one with no skills directory. `^{tree}`:
      // a caller may pass a bare tree hash (#580).
      const resolves = await this.readRawOutput(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref}^{tree}`,
      ]);
      return resolves === null ? null : [];
    }

    return parseSkillTreeListing(listing);
  }

  async readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    const manifests = await Promise.all(
      names.map(async (name) => [
        name,
        await this.readRawOutput(root, [
          "show",
          `${ref}:${harnessSkillSubpath(name)}/SKILL.md`,
        ]),
      ]),
    );
    return Object.fromEntries(manifests);
  }

  private async readRawOutput(
    root: string,
    args: string[],
  ): Promise<string | null> {
    try {
      const { stdout } = await run("git", ["-C", root, ...args], gitOptions());
      return stdout;
    } catch {
      return null;
    }
  }

  async readTags(root: string): Promise<HarnessTag[] | null> {
    const listing = await this.readRawOutput(root, [
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
