// Kept out of the build (tsconfig.build excludes *.fake.ts).
// One in-memory Harness clone behind `HarnessGitPort`: commits hold skill
// contents, refs point at commits, and every read derives from them, so a
// test states content and never a tree hash.
import { createHash } from "node:crypto";
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import type { ProposalKind } from "./proposal-request";
import type {
  CloneSync,
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

// Skill name → its SKILL.md text, which stands for the whole folder; null is
// a folder with no SKILL.md.
export type Skills = Record<string, string | null>;

type Commit = { parent: string | null; skills: Skills; author: string };

// The tree hash git would give this content.
export const treeHash = (content: string | null): string =>
  createHash("sha1")
    .update(content ?? "\0no-manifest")
    .digest("hex");

const treesOf = (skills: Skills): HarnessSkillTree[] =>
  Object.entries(skills).map(([name, content]) => ({
    name,
    treeHash: treeHash(content),
  }));

const hashes = (skills: Skills): Record<string, string> =>
  Object.fromEntries(
    Object.entries(skills).map(([name, content]) => [name, treeHash(content)]),
  );

export class InMemoryHarnessGit implements HarnessGitPort {
  // The one clone this world holds; any other root is no clone at all.
  root = "/harness";
  originUrl: string | null = "git@github.com:fimoklei/agent-harness.git";
  defaultBranch: string | null = "main";
  // origin/HEAD as the last fetch left it; null where it could not be read.
  tip: string | null = null;
  // Release tags as fetched; null is an unreadable namespace.
  tags: HarnessTag[] | null = [];
  // Skill → its fetched `maestro/<skill>` tip; null is an unreadable tip.
  promote: Record<string, string | null> = {};
  head: string | null = null;
  working: Skills = {};
  // Refs (commit ids, "HEAD", "working") whose skills cannot be listed.
  readonly unreadable = new Set<string>();
  cloneSync: CloneSync = "current";
  ambiguity: WorktreeAmbiguity | null = null;
  // Per skill: a difference staged in the author's index; null is no answer.
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

  // Every write that leaves this machine or touches the author's files.
  readonly published: { name: string; commit: string; branch: string }[] = [];
  readonly pushed: {
    name: string;
    base: string;
    kind: ProposalKind;
  }[] = [];
  readonly written: { name: string; commit: string; into: string }[] = [];
  readonly caughtUp: string[] = [];
  readonly treeReads: string[] = [];
  movementReads = 0;
  readonly mergeBaseAsks: string[] = [];

  private readonly commits = new Map<string, Commit>();

  commit(
    id: string,
    skills: Skills,
    options: { parent?: string; author?: string } = {},
  ): string {
    this.commits.set(id, {
      parent: options.parent ?? null,
      skills,
      author: options.author ?? "fimoklei",
    });
    return id;
  }

  // One commit everywhere: origin/HEAD, local HEAD and disk agree.
  settled(skills: Skills, id = "settled"): this {
    this.commit(id, skills);
    this.tip = id;
    this.head = id;
    this.working = { ...skills };
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

  private skillsAt(ref: string): Skills | null {
    if (this.unreadable.has(ref)) {
      return null;
    }
    if (ref === "working") {
      return this.working;
    }
    const id = this.resolve(ref);
    return id === null || this.unreadable.has(id)
      ? null
      : (this.commits.get(id)?.skills ?? null);
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
    this.working = { ...(this.skillsAt(this.tip) ?? {}) };
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

  async readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null> {
    this.at(root);
    const commit = this.tags?.find((t) => t.name === tag)?.commit;
    return commit === undefined ? null : this.readSkillTrees(root, commit);
  }

  // The newest commit in `ref`'s history that changed the skill, as `git log -1 -- <path>`.
  async readSkillAuthors(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>> {
    this.at(root);
    return Object.fromEntries(
      names.map((name) => [name, this.lastAuthor(ref, name)]),
    );
  }

  private lastAuthor(ref: string, name: string): string | null {
    let id: string | null = ref === "HEAD" ? this.head : ref;
    while (id !== null) {
      const commit = this.commits.get(id);
      if (commit === undefined) {
        return null;
      }
      const before =
        commit.parent === null
          ? undefined
          : this.commits.get(commit.parent)?.skills[name];
      if (commit.skills[name] !== before) {
        return commit.author;
      }
      id = commit.parent;
    }
    return null;
  }

  async readMovementTrees(root: string): Promise<HarnessSkillTrees | null> {
    this.at(root);
    this.movementReads += 1;
    const remote = this.tip === null ? null : this.skillsAt(this.tip);
    const local = this.skillsAt("HEAD");
    const working = this.skillsAt("working");
    if (remote === null || local === null || working === null) {
      return null;
    }
    return {
      remote: hashes(remote),
      promote: Object.fromEntries(
        Object.entries(this.promote).map(([skill, commit]) => {
          const content =
            commit === null ? undefined : this.skillsAt(commit)?.[skill];
          return [
            skill,
            { tree: content === undefined ? null : treeHash(content), commit },
          ];
        }),
      ),
      local: hashes(local),
      working: hashes(working),
    };
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

  async pushSkillPromotion(
    root: string,
    name: string,
    base: string,
    kind: Exclude<ProposalKind, "deletion">,
  ): Promise<PromoteSkillOutcome> {
    this.at(root);
    const content = this.working[name];
    if (content === undefined) {
      return "skill-missing";
    }
    return this.pushProposal(name, base, kind, content);
  }

  async pushSkillDeletion(
    root: string,
    name: string,
    base: string,
  ): Promise<SkillPushOutcome> {
    this.at(root);
    if (Object.hasOwn(this.working, name)) {
      return "source-changed";
    }
    return this.pushProposal(name, base, "deletion", undefined);
  }

  private pushProposal(
    name: string,
    base: string,
    kind: ProposalKind,
    content: string | null | undefined,
  ): SkillPushOutcome {
    const outcome = this.pushOutcome ?? "pushed";
    if (outcome !== "pushed") {
      return outcome;
    }
    const { [name]: _replaced, ...rest } = this.skillsAt(base) ?? {};
    const id = this.commit(
      `${name}-proposal-${this.pushed.length + 1}`,
      content === undefined ? rest : { ...rest, [name]: content },
      { parent: this.promote[name] ?? base },
    );
    this.promote[name] = id;
    this.pushed.push({ name, base, kind });
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

  async readStagedSkillDifference(
    root: string,
    name: string,
  ): Promise<boolean | null> {
    this.at(root);
    return Object.hasOwn(this.staged, name)
      ? (this.staged[name] ?? null)
      : false;
  }

  async writeSkillTreeInto(
    root: string,
    name: string,
    commit: string,
    into: string,
  ): Promise<"written" | "missing" | "failed"> {
    this.at(root);
    const skills = this.skillsAt(commit);
    if (this.writeOutcome !== null) {
      return this.writeOutcome;
    }
    if (skills === null) {
      return "failed";
    }
    if (skills[name] === undefined) {
      return "missing";
    }
    this.written.push({ name, commit, into });
    return "written";
  }
}
