// One in-memory Harness clone behind `HarnessGitPort`: commits hold skill and
// prompt contents, refs point at commits, and every read derives from them, so
// a test states content and never a hash.
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import { HARNESS_CATEGORIES_FILE } from "../inventory/harness-layout";
import { fileAtRef } from "./file-at-ref.fake";
import {
  blobHash,
  type Content,
  hashesOf,
  listFileHash,
  objectsOf,
  type Prompts,
  type Skills,
  subjectTextOf,
  textOf,
  treesOf,
  withSubjectsFrom,
} from "./harness-content.fake";
import {
  type HarnessObject,
  type HarnessPrimitiveType,
  type PrimitiveRef,
  parsePrimitiveListing,
  parseProposalBranch,
  primitiveEntry,
  primitivePath,
  proposalBranchLeaf,
} from "./harness-primitive";
import type { ProposalKind } from "./proposal-request";
import {
  type ListSubject,
  type ProposalSubject,
  subjectBranch,
  subjectBranchLeaf,
  subjectKey,
} from "./proposal-subject";
import type {
  BranchAuthorship,
  CloneSync,
  DefaultBranchWithdrawal,
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessHashes,
  HarnessMovementTrees,
  HarnessPromoteRef,
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
import type { HarnessSkillTree } from "./released-content";

export {
  blobHash,
  type Prompts,
  type Skills,
  treeHash,
} from "./harness-content.fake";

type Commit = Content & {
  parent: string | null;
  author: string;
  rootFiles: string[];
};

export const skillRef = (name: string): PrimitiveRef => ({
  type: "skill",
  name,
});

export class InMemoryHarnessGit implements HarnessGitPort {
  // The one clone this world holds; any other root is no clone at all.
  root = "/harness";
  originUrl: string | null = "git@github.com:fimoklei/agent-harness.git";
  defaultBranch: string | null = "main";
  // origin/HEAD as the last fetch left it; null where it could not be read.
  tip: string | null = null;
  // Release tags as fetched; null is an unreadable namespace.
  tags: HarnessTag[] | null = [];
  // Branch name under `maestro/` (a skill's name, `prompt.<name>` for a
  // prompt) → its fetched tip; null is an unreadable tip.
  promote: Record<string, string | null> = {};
  head: string | null = null;
  working: Skills = {};
  workingPrompts: Prompts = {};
  // Prompt names whose working file is a symlink.
  readonly workingPromptLinks = new Set<string>();
  // Refs (commit ids, "HEAD", "working") whose skills cannot be listed.
  readonly unreadable = new Set<string>();
  // Commit ids whose root alone cannot be listed.
  readonly unlistableRoots = new Set<string>();
  cloneSync: CloneSync = "current";
  ambiguity: WorktreeAmbiguity | null = null;
  // Per branch name, as `promote`: a difference staged in the author's index;
  // null is no answer.
  staged: Record<string, boolean | null> = {};

  // One outcome per fetch, in order; the last repeats. A fetch also lands the
  // next queued remote change, as a teammate's push arrives.
  fetchOutcomes: HarnessFetchOutcome[] = ["fetched"];
  fetchHold: Promise<void> | null = null;
  readonly arrivals: (() => void)[] = [];
  fetches = 0;

  // What the remote answers; `null` lets the world decide.
  publishOutcome: PublishTagOutcome | null = null;
  pushOutcome: SkillPushOutcome | null = null;
  // Per branch name, as `promote`: what that branch's push answers, ahead of
  // `pushOutcome`.
  pushOutcomes: Record<string, SkillPushOutcome> = {};
  writeOutcome: "missing" | "failed" | null = null;
  deleteOutcome: "deleted" | "failed" = "deleted";
  withdrawOutcome: WithdrawalPushOutcome | null = null;
  pushesWhereItFetched = true;
  // Per branch name, as `promote`: the files only the working tree holds;
  // null is no answer.
  unproposed: Record<string, string[] | null> = {};
  // Per branch name, as `promote`; absent is the author's own.
  authorship: Record<string, BranchAuthorship> = {};

  // Every write that leaves this machine or touches the author's files.
  readonly published: { name: string; commit: string; branch: string }[] = [];
  readonly pushed: {
    type: HarnessPrimitiveType;
    name: string;
    base: string;
    kind: ProposalKind;
  }[] = [];
  readonly written: {
    type: HarnessPrimitiveType;
    name: string;
    commit: string;
    into: string;
  }[] = [];
  // Every list file pushed, with the parents its commit took.
  readonly listPushes: { branch: string; parents: string[]; text: string }[] =
    [];
  // Commits pushed to the default branch by a withdrawal.
  readonly withdrawals: { commit: string; message: string }[] = [];
  // Proposal branch names deleted on the remote.
  readonly deletedBranches: string[] = [];
  readonly caughtUp: string[] = [];
  readonly treeReads: string[] = [];
  movementReads = 0;
  readonly mergeBaseAsks: string[] = [];

  private readonly commits = new Map<string, Commit>();

  commit(
    id: string,
    skills: Skills,
    options: {
      parent?: string;
      author?: string;
      prompts?: Prompts;
      rootFiles?: string[];
      files?: Record<string, string>;
    } = {},
  ): string {
    this.commits.set(id, {
      parent: options.parent ?? null,
      skills,
      prompts: options.prompts ?? {},
      author: options.author ?? "fimoklei",
      rootFiles: options.rootFiles ?? ["apm.yml"],
      files: options.files ?? {},
    });
    return id;
  }

  // One commit everywhere: origin/HEAD, local HEAD and disk agree.
  settled(skills: Skills, id = "settled", prompts: Prompts = {}): this {
    this.commit(id, skills, { prompts });
    this.tip = id;
    this.head = id;
    this.working = { ...skills };
    this.workingPrompts = { ...prompts };
    return this;
  }

  // Lands with the next fetch, never before.
  teammatePushes(id: string, skills: Skills, author = "teammate"): void {
    this.arrivals.push(() => {
      this.commit(id, skills, {
        ...(this.tip === null ? {} : { parent: this.tip }),
        author,
      });
      this.tip = id;
    });
  }

  private at(root: string): void {
    if (root !== this.root) {
      throw new Error(`no clone at ${root}`);
    }
  }

  // Through the real listing parser, so a link drops out as it does in git.
  private listedWorkingPrompts(): Prompts {
    const listing = Object.entries(this.workingPrompts)
      .map(([name, text]) => {
        const mode = this.workingPromptLinks.has(name) ? "120000" : "100644";
        return `${mode} blob ${blobHash(text)}\t${primitiveEntry({ type: "prompt", name })}\0`;
      })
      .join("");
    const listed = new Set(
      (parsePrimitiveListing("prompt", listing) ?? []).map(({ name }) => name),
    );
    return Object.fromEntries(
      Object.entries(this.workingPrompts).filter(([name]) => listed.has(name)),
    );
  }

  private contentAt(ref: string): Content | null {
    if (this.unreadable.has(ref)) {
      return null;
    }
    if (ref === "working") {
      return {
        skills: this.working,
        prompts: this.listedWorkingPrompts(),
        files: {},
      };
    }
    const id = this.resolve(ref);
    return id === null || this.unreadable.has(id)
      ? null
      : (this.commits.get(id) ?? null);
  }

  private skillsAt(ref: string): Skills | null {
    return this.contentAt(ref)?.skills ?? null;
  }

  // A commit id, `HEAD`, or a fetched promote branch's ref.
  private resolve(ref: string): string | null {
    const branch = ref.match(/^refs\/remotes\/origin\/maestro\/(.+)$/)?.[1];
    if (branch !== undefined) {
      return this.promote[branch] ?? null;
    }
    return ref === "HEAD" ? this.head : ref;
  }

  async fetch(root: string): Promise<HarnessFetchOutcome> {
    this.at(root);
    const outcome =
      this.fetchOutcomes[Math.min(this.fetches, this.fetchOutcomes.length - 1)];
    this.fetches += 1;
    await this.fetchHold;
    if (outcome === "fetched") {
      this.arrivals.shift()?.();
    }
    return outcome ?? "fetched";
  }

  async readFacts(root: string): Promise<HarnessFacts> {
    this.at(root);
    return {
      originUrl: this.originUrl,
      defaultBranch: this.defaultBranch,
      defaultBranchCommit: this.tip,
      tags: this.tags,
    };
  }

  async catchUp(root: string): Promise<void> {
    this.at(root);
    if (this.cloneSync !== "behind" || this.tip === null) {
      return;
    }
    this.caughtUp.push(this.tip);
    this.head = this.tip;
    const content = this.contentAt(this.tip);
    this.working = { ...(content?.skills ?? {}) };
    this.workingPrompts = { ...(content?.prompts ?? {}) };
    this.cloneSync = "current";
  }

  async readCloneSync(root: string): Promise<CloneSync> {
    this.at(root);
    return this.cloneSync;
  }

  async readSkillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    this.at(root);
    this.treeReads.push(ref);
    const skills = this.skillsAt(ref);
    return skills === null ? null : treesOf(skills);
  }

  async readPrimitives(
    root: string,
    ref: string,
  ): Promise<HarnessObject[] | null> {
    this.at(root);
    this.treeReads.push(ref);
    const content = this.contentAt(ref);
    return content === null ? null : objectsOf(content);
  }

  async readRootFiles(root: string, ref: string): Promise<string[] | null> {
    this.at(root);
    const id = this.resolve(ref);
    if (
      id === null ||
      this.unlistableRoots.has(id) ||
      this.unreadable.has(id)
    ) {
      return null;
    }
    return this.commits.get(id)?.rootFiles ?? null;
  }

  async readFileAt(root: string, ref: string, path: string, maxBytes: number) {
    this.at(root);
    const id = this.resolve(ref) ?? "";
    const commit = this.unreadable.has(id) ? null : this.commits.get(id);
    return commit ? fileAtRef(commit.files[path], maxBytes) : null;
  }

  async readPrimitivesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessObject[] | null> {
    this.at(root);
    const commit = this.tags?.find((t) => t.name === tag)?.commit;
    return commit === undefined ? null : this.readPrimitives(root, commit);
  }

  async readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null> {
    this.at(root);
    const commit = this.tags?.find((t) => t.name === tag)?.commit;
    return commit === undefined ? null : this.readSkillTrees(root, commit);
  }

  async readListHash(root: string, ref: string, _subject: ListSubject) {
    this.at(root);
    const content = this.contentAt(ref);
    return content === null ? null : { hash: listFileHash(content) };
  }

  // The newest commit in `ref`'s history that changed the subject, as
  // `git log -1 -- <path>`. Keyed by `subjectKey`.
  async readAuthors(
    root: string,
    ref: string,
    refs: ProposalSubject[],
  ): Promise<Record<string, string | null>> {
    this.at(root);
    return Object.fromEntries(
      refs.map((each) => [subjectKey(each), this.lastAuthor(ref, each)]),
    );
  }

  private lastAuthor(ref: string, subject: ProposalSubject): string | null {
    let id: string | null = ref === "HEAD" ? this.head : ref;
    while (id !== null) {
      const commit = this.commits.get(id);
      if (commit === undefined) {
        return null;
      }
      const parent =
        commit.parent === null ? undefined : this.commits.get(commit.parent);
      const before =
        parent === undefined ? undefined : subjectTextOf(parent, subject);
      if (subjectTextOf(commit, subject) !== before) {
        return commit.author;
      }
      id = commit.parent;
    }
    return null;
  }

  async readMovementTrees(root: string): Promise<HarnessMovementTrees | null> {
    this.at(root);
    this.movementReads += 1;
    const remote = this.tip === null ? null : this.contentAt(this.tip);
    const local = this.contentAt("HEAD");
    const working = this.contentAt("working");
    if (remote === null || local === null || working === null) {
      return null;
    }
    const typed = (type: HarnessPrimitiveType): HarnessHashes => ({
      remote: hashesOf(remote, type),
      promote: this.proposalRefs(type),
      local: hashesOf(local, type),
      working: hashesOf(working, type),
    });
    return { skill: typed("skill"), prompt: typed("prompt") };
  }

  private proposalRefs(
    type: HarnessPrimitiveType,
  ): Record<string, HarnessPromoteRef> {
    const refs: Record<string, HarnessPromoteRef> = {};
    for (const [leaf, commit] of Object.entries(this.promote)) {
      const ref = parseProposalBranch(leaf);
      if (ref === null || ref.type !== type) {
        continue;
      }
      const content = commit === null ? null : this.contentAt(commit);
      const hash =
        content === null ? undefined : hashesOf(content, type)[ref.name];
      refs[ref.name] = {
        tree: hash ?? null,
        commit,
        authorship: this.authorshipOf(leaf),
        landed: this.hasLanded(
          commit,
          (at) => (hashesOf(at, type)[ref.name] ?? null) === (hash ?? null),
        ),
      };
    }
    return refs;
  }

  async readListProposal(
    root: string,
    subject: ListSubject,
  ): Promise<ListProposalRefs | null> {
    this.at(root);
    const atTip = this.tip === null ? null : this.contentAt(this.tip);
    if (atTip === null) return null;
    const remote = listFileHash(atTip);
    const leaf = subjectBranchLeaf(subject);
    if (!Object.hasOwn(this.promote, leaf)) return { remote, promote: null };
    const commit = this.promote[leaf] ?? null;
    const content = commit === null ? null : this.contentAt(commit);
    const tree = content === null ? null : listFileHash(content);
    const authorship = this.authorshipOf(leaf);
    const landed = this.hasLanded(commit, (at) => listFileHash(at) === tree);
    return { remote, promote: { tree, commit, authorship, landed } };
  }

  // As the adapter: the tip is on origin/HEAD, or a commit the branch lacks
  // holds its content.
  private hasLanded(
    branch: string | null,
    holds: (content: Content) => boolean,
  ): boolean {
    if (branch === null || this.tip === null) {
      return false;
    }
    const onBranch = new Set(this.history(branch));
    const base = this.history(this.tip);
    return (
      base.includes(branch) ||
      base
        .filter((id) => !onBranch.has(id))
        .some((id) => {
          const content = this.contentAt(id);
          return content !== null && holds(content);
        })
    );
  }

  async mergeBaseCommit(
    root: string,
    remoteCommit: string,
  ): Promise<string | null> {
    this.at(root);
    this.mergeBaseAsks.push(remoteCommit);
    const ours = new Set(this.history(this.head));
    return this.history(remoteCommit).find((id) => ours.has(id)) ?? null;
  }

  private history(from: string | null): string[] {
    const ids: string[] = [];
    let id = from;
    while (id !== null && this.commits.has(id)) {
      ids.push(id);
      id = this.commits.get(id)?.parent ?? null;
    }
    return ids;
  }

  async readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    this.at(root);
    const skills = this.skillsAt(ref) ?? {};
    return Object.fromEntries(
      names.map((name) => [name, skills[name] ?? null]),
    );
  }

  async readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    const commit = this.tags?.find((t) => t.name === tag)?.commit;
    return commit === undefined
      ? Object.fromEntries(names.map((name) => [name, null]))
      : this.readSkillManifests(root, commit, names);
  }

  async readPromptTextsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string> | null> {
    this.at(root);
    const commit = this.tags?.find((t) => t.name === tag)?.commit;
    const content = commit === undefined ? null : this.contentAt(commit);
    if (content === null) return null;
    return Object.fromEntries(
      names.flatMap((name) => {
        const text = content.prompts[name];
        return text === undefined ? [] : [[name, text]];
      }),
    );
  }

  async readTags(root: string): Promise<HarnessTag[] | null> {
    this.at(root);
    return this.tags;
  }

  async readOrigin(root: string): Promise<GitOrigin | null> {
    this.at(root);
    return this.originUrl === null ? null : parseGitOrigin(this.originUrl);
  }

  async publishTag(
    root: string,
    name: string,
    commit: string,
    defaultBranch: string,
  ): Promise<PublishTagOutcome> {
    this.at(root);
    const outcome = this.publishOutcome ?? "pushed";
    if (outcome === "pushed") {
      this.published.push({ name, commit, branch: defaultBranch });
      this.tags = [...(this.tags ?? []), { name, commit }];
    }
    return outcome;
  }

  async pushPromotion(
    root: string,
    ref: PrimitiveRef,
    base: string,
    kind: Exclude<ProposalKind, "deletion">,
  ): Promise<PromoteSkillOutcome> {
    this.at(root);
    const content = textOf(
      { skills: this.working, prompts: this.workingPrompts },
      ref,
    );
    if (content === undefined) {
      return "skill-missing";
    }
    return this.pushProposal(ref, base, kind, content);
  }

  async pushDeletion(
    root: string,
    ref: PrimitiveRef,
    base: string,
  ): Promise<SkillPushOutcome> {
    this.at(root);
    const working = ref.type === "skill" ? this.working : this.workingPrompts;
    if (Object.hasOwn(working, ref.name)) {
      return "source-changed";
    }
    return this.pushProposal(ref, base, "deletion", undefined);
  }

  // As the adapter: the default-branch tree with the file; a branch that
  // lacks the tip gains it as a second parent.
  async pushListFile(
    root: string,
    { subject, text, defaultTip }: ListFilePush,
  ): Promise<ListPushOutcome> {
    this.at(root);
    if (!this.pushesWhereItFetched) return "push-elsewhere";
    const leaf = subjectBranchLeaf(subject);
    const outcome = this.pushOutcomes[leaf] ?? this.pushOutcome ?? "pushed";
    if (outcome === "source-changed") return "push-failed";
    if (outcome !== "pushed") return outcome;
    const at = this.contentAt(defaultTip);
    if (at === null) return "push-failed";
    const tip = this.promote[leaf] ?? null;
    const parents =
      tip === null
        ? [defaultTip]
        : this.history(tip).includes(defaultTip)
          ? [tip]
          : [tip, defaultTip];
    const id = this.commit(`${leaf}-${this.listPushes.length + 1}`, at.skills, {
      parent: parents[0],
      prompts: at.prompts,
      files: { ...at.files, [HARNESS_CATEGORIES_FILE]: text },
    });
    this.promote[leaf] = id;
    this.listPushes.push({ branch: subjectBranch(subject), parents, text });
    return "pushed";
  }

  private pushProposal(
    ref: PrimitiveRef,
    base: string,
    kind: ProposalKind,
    content: string | null | undefined,
  ): SkillPushOutcome {
    const leaf = proposalBranchLeaf(ref);
    const outcome = this.pushOutcomes[leaf] ?? this.pushOutcome ?? "pushed";
    if (outcome !== "pushed") {
      return outcome;
    }
    const at = this.contentAt(base) ?? { skills: {}, prompts: {}, files: {} };
    const placed = <T>(map: Record<string, T>, value: T | undefined) => {
      const { [ref.name]: _replaced, ...rest } = map;
      return value === undefined ? rest : { ...rest, [ref.name]: value };
    };
    const id = this.commit(
      `${leaf}-proposal-${this.pushed.length + 1}`,
      ref.type === "skill" ? placed(at.skills, content) : at.skills,
      {
        parent: this.promote[leaf] ?? base,
        files: at.files,
        prompts:
          ref.type === "prompt"
            ? placed(at.prompts, content ?? undefined)
            : at.prompts,
      },
    );
    this.promote[leaf] = id;
    this.pushed.push({ type: ref.type, name: ref.name, base, kind });
    return "pushed";
  }

  // The remote's answer is checked after the clone's own checks, as in git.
  async withdrawOnDefaultBranch(
    root: string,
    withdrawal: DefaultBranchWithdrawal,
  ): Promise<WithdrawalPushOutcome> {
    this.at(root);
    if (this.head !== withdrawal.tip) {
      return "clone-not-current";
    }
    if (!this.pushesWhereItFetched) {
      return "push-elsewhere";
    }
    if (this.withdrawOutcome !== null && this.withdrawOutcome !== "pushed") {
      return this.withdrawOutcome;
    }
    if (this.tip !== withdrawal.tip) {
      return "stale-tip";
    }
    const at = this.contentAt(withdrawal.tip);
    const source =
      withdrawal.source === null
        ? { skills: {}, prompts: {}, files: {} }
        : this.contentAt(withdrawal.source);
    if (at === null || source === null) {
      return "push-failed";
    }
    const { skills, prompts, files } = withSubjectsFrom(
      at,
      source,
      withdrawal.refs,
    );
    const id = this.commit(
      `withdrawal-${this.withdrawals.length + 1}`,
      skills,
      { parent: withdrawal.tip, prompts, files },
    );
    this.withdrawals.push({ commit: id, message: withdrawal.message });
    this.tip = id;
    this.head = id;
    return "pushed";
  }

  async readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null> {
    this.at(root);
    return this.ambiguity;
  }

  async readLocalHeadCommit(root: string): Promise<string | null> {
    this.at(root);
    return this.head;
  }

  async readStagedDifference(
    root: string,
    ref: PrimitiveRef,
  ): Promise<boolean | null> {
    this.at(root);
    const leaf = proposalBranchLeaf(ref);
    return Object.hasOwn(this.staged, leaf)
      ? (this.staged[leaf] ?? null)
      : false;
  }

  async writePrimitiveInto(
    root: string,
    ref: PrimitiveRef,
    commit: string,
    into: string,
  ): Promise<"written" | "missing" | "failed"> {
    this.at(root);
    const content = this.contentAt(commit);
    if (this.writeOutcome !== null) {
      return this.writeOutcome;
    }
    if (content === null) {
      return "failed";
    }
    if (textOf(content, ref) === undefined) {
      return "missing";
    }
    this.written.push({ type: ref.type, name: ref.name, commit, into });
    return "written";
  }

  async deleteProposalBranch(
    root: string,
    subject: ProposalSubject,
  ): Promise<"deleted" | "failed"> {
    this.at(root);
    if (this.deleteOutcome === "failed") {
      return "failed";
    }
    delete this.promote[subjectBranchLeaf(subject)];
    this.deletedBranches.push(subjectBranch(subject));
    return "deleted";
  }

  async readUnproposedFiles(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string[] | null> {
    this.at(root);
    const leaf = proposalBranchLeaf(ref);
    return Object.hasOwn(this.unproposed, leaf)
      ? (this.unproposed[leaf] ?? null)
      : [];
  }

  // A skill's SKILL.md stands for its folder, as in the content model.
  async readWorkingDifferences(
    root: string,
    refs: readonly PrimitiveRef[],
    commit: string,
  ): Promise<string[] | null> {
    this.at(root);
    const at = this.contentAt(commit);
    const working = this.contentAt("working");
    if (at === null || working === null) {
      return null;
    }
    return refs
      .filter((ref) => {
        const text = textOf(working, ref);
        return text !== undefined && text !== textOf(at, ref);
      })
      .map((ref) =>
        ref.type === "skill"
          ? `${primitivePath(ref)}/SKILL.md`
          : primitivePath(ref),
      )
      .sort();
  }

  private authorshipOf(leaf: string): BranchAuthorship {
    return this.authorship[leaf] ?? "own";
  }

  async readAuthoredHere(
    root: string,
    subject: ProposalSubject,
    _base: string,
  ): Promise<BranchAuthorship> {
    this.at(root);
    return this.authorshipOf(subjectBranchLeaf(subject));
  }

  async readPushesWhereItFetched(root: string): Promise<boolean> {
    this.at(root);
    return this.pushesWhereItFetched;
  }
}
