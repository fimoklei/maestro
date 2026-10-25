// One in-memory Harness clone behind `HarnessGitPort`: commits hold skill and
// prompt contents, refs point at commits, and every read derives from them, so
// a test states content and never a hash.
import { createHash } from "node:crypto";
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  type HarnessObject,
  type HarnessPrimitiveType,
  type PrimitiveRef,
  parsePrimitiveListing,
  parseProposalBranch,
  primitiveEntry,
  primitiveKey,
  proposalBranch,
  proposalBranchLeaf,
} from "./harness-primitive";
import type { ProposalKind } from "./proposal-request";
import type {
  CloneSync,
  HarnessFacts,
  HarnessFetchOutcome,
  HarnessGitPort,
  HarnessHashes,
  HarnessMovementTrees,
  HarnessPromoteRef,
  HarnessTag,
  PromoteSkillOutcome,
  PublishTagOutcome,
  SkillPushOutcome,
  WorktreeAmbiguity,
} from "./read-harness-state";
import type { HarnessSkillTree } from "./released-content";

// Skill name → its SKILL.md text, which stands for the whole folder; null is
// a folder with no SKILL.md.
export type Skills = Record<string, string | null>;

// Prompt name → its file text.
export type Prompts = Record<string, string>;

type Content = { skills: Skills; prompts: Prompts };

type Commit = Content & {
  parent: string | null;
  author: string;
  rootFiles: string[];
};

// The tree hash git would give this content.
export const treeHash = (content: string | null): string =>
  createHash("sha1")
    .update(content ?? "\0no-manifest")
    .digest("hex");

export const skillRef = (name: string): PrimitiveRef => ({
  type: "skill",
  name,
});

// The blob hash git would give this text; never a tree hash of the same text.
export const blobHash = (text: string): string =>
  createHash("sha1").update(`blob\0${text}`).digest("hex");

const treesOf = (skills: Skills): HarnessSkillTree[] =>
  Object.entries(skills).map(([name, content]) => ({
    name,
    treeHash: treeHash(content),
  }));

const hashesOf = (
  content: Content,
  type: HarnessPrimitiveType,
): Record<string, string> =>
  type === "skill"
    ? Object.fromEntries(
        Object.entries(content.skills).map(([name, text]) => [
          name,
          treeHash(text),
        ]),
      )
    : Object.fromEntries(
        Object.entries(content.prompts).map(([name, text]) => [
          name,
          blobHash(text),
        ]),
      );

const objectsOf = (content: Content): HarnessObject[] => [
  ...Object.entries(hashesOf(content, "skill")).map(([name, hash]) => ({
    type: "skill" as const,
    name,
    hash,
  })),
  ...Object.entries(hashesOf(content, "prompt")).map(([name, hash]) => ({
    type: "prompt" as const,
    name,
    hash,
  })),
];

// `undefined` is a primitive the content lacks.
const textOf = (
  content: Content,
  { type, name }: PrimitiveRef,
): string | null | undefined =>
  type === "skill" ? content.skills[name] : content.prompts[name];

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
  writeOutcome: "missing" | "failed" | null = null;
  deleteOutcome: "deleted" | "failed" = "deleted";
  pushesWhereItFetched = true;
  // Per branch name, as `promote`: the files only the working tree holds;
  // null is no answer.
  unproposed: Record<string, string[] | null> = {};

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
    } = {},
  ): string {
    this.commits.set(id, {
      parent: options.parent ?? null,
      skills,
      prompts: options.prompts ?? {},
      author: options.author ?? "fimoklei",
      rootFiles: options.rootFiles ?? ["apm.yml"],
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
      return { skills: this.working, prompts: this.listedWorkingPrompts() };
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

  // The newest commit in `ref`'s history that changed the primitive, as
  // `git log -1 -- <path>`. Keyed by `primitiveKey`.
  async readAuthors(
    root: string,
    ref: string,
    refs: PrimitiveRef[],
  ): Promise<Record<string, string | null>> {
    this.at(root);
    return Object.fromEntries(
      refs.map((each) => [primitiveKey(each), this.lastAuthor(ref, each)]),
    );
  }

  private lastAuthor(ref: string, primitive: PrimitiveRef): string | null {
    let id: string | null = ref === "HEAD" ? this.head : ref;
    while (id !== null) {
      const commit = this.commits.get(id);
      if (commit === undefined) {
        return null;
      }
      const parent =
        commit.parent === null ? undefined : this.commits.get(commit.parent);
      const before =
        parent === undefined ? undefined : textOf(parent, primitive);
      if (textOf(commit, primitive) !== before) {
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
      refs[ref.name] = { tree: hash ?? null, commit };
    }
    return refs;
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
    if (content === null) {
      return null;
    }
    const texts: Record<string, string> = {};
    for (const name of names) {
      const text = content.prompts[name];
      if (text !== undefined) {
        texts[name] = text;
      }
    }
    return texts;
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

  private pushProposal(
    ref: PrimitiveRef,
    base: string,
    kind: ProposalKind,
    content: string | null | undefined,
  ): SkillPushOutcome {
    const outcome = this.pushOutcome ?? "pushed";
    if (outcome !== "pushed") {
      return outcome;
    }
    const leaf = proposalBranchLeaf(ref);
    const at = this.contentAt(base) ?? { skills: {}, prompts: {} };
    const placed = <T>(map: Record<string, T>, value: T | undefined) => {
      const { [ref.name]: _replaced, ...rest } = map;
      return value === undefined ? rest : { ...rest, [ref.name]: value };
    };
    const id = this.commit(
      `${leaf}-proposal-${this.pushed.length + 1}`,
      ref.type === "skill" ? placed(at.skills, content) : at.skills,
      {
        parent: this.promote[leaf] ?? base,
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
    ref: PrimitiveRef,
  ): Promise<"deleted" | "failed"> {
    this.at(root);
    if (this.deleteOutcome === "failed") {
      return "failed";
    }
    delete this.promote[proposalBranchLeaf(ref)];
    this.deletedBranches.push(proposalBranch(ref));
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

  async readPushesWhereItFetched(root: string): Promise<boolean> {
    this.at(root);
    return this.pushesWhereItFetched;
  }
}
