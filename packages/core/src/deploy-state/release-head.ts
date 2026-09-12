// Which release a target follows, and how much of its selection the newest
// release actually touches (ADR-0031). Read from the connected Harness clone's
// own tags and trees, so the answer is content, never commit ancestry
// (ADR-0027). Every unknown stays null: a fabricated count reads as work that
// is not there.
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag, RELEASE_TAG_PATTERN } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { ReleaseHead } from "./deploy-state-types";

// The two reads the comparison needs, structural so any Harness git adapter
// satisfies it.
export type ReleaseHeadGitPort = {
  readTags(root: string): Promise<HarnessTag[] | null>;
  readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null>;
};

type LastRead = { latestRelease: string; comparedAt: string };

export class ReleaseHeadReader {
  private readonly deps: {
    git: ReleaseHeadGitPort;
    resolveRoot: () => Promise<string | undefined>;
    now: () => Date;
  };

  // Per target, so an unreadable comparison can still say when the last one
  // succeeded. In memory only: a restart honestly forgets.
  private readonly last = new Map<string, LastRead>();

  constructor(deps: ReleaseHeadReader["deps"]) {
    this.deps = deps;
  }

  // `key` names the target the remembered read belongs to; `selection` is what
  // this target has deployed, which is what the count speaks about.
  async read(input: {
    key: string;
    release: string;
    selection: readonly string[];
  }): Promise<ReleaseHead> {
    const remembered = this.last.get(input.key);
    const base = { release: input.release, selected: input.selection.length };
    const unread = (latestRelease: string | null): ReleaseHead => ({
      ...base,
      latestRelease: latestRelease ?? remembered?.latestRelease ?? null,
      changed: null,
      comparedAt: remembered?.comparedAt ?? null,
    });

    const root = await this.deps.resolveRoot().catch(() => undefined);
    if (root === undefined) {
      return unread(null);
    }
    // No fetch: the drift read already catches the clone up, and this one runs
    // on every open of the Deploy-state.
    const tags = await this.deps.git.readTags(root).catch(() => null);
    const latest = tags === null ? null : highestReleaseTag(tags);
    const latestRelease = latest?.name ?? remembered?.latestRelease ?? null;
    if (latestRelease === null) {
      return unread(null);
    }

    const comparedAt = this.deps.now().toISOString();
    if (latestRelease === input.release) {
      return this.remember(input.key, {
        ...base,
        latestRelease,
        changed: 0,
        comparedAt,
      });
    }
    if (
      !RELEASE_TAG_PATTERN.test(input.release) ||
      !RELEASE_TAG_PATTERN.test(latestRelease)
    ) {
      return unread(latestRelease);
    }

    const [current, next] = await Promise.all([
      this.treesAt(root, input.release),
      this.treesAt(root, latestRelease),
    ]);
    if (current === null || next === null) {
      return unread(latestRelease);
    }
    // An identical tree hash is identical content; a name the newer release
    // dropped has no hash there, which is a change to this target too.
    const changed = input.selection.filter(
      (name) => current.get(name) !== next.get(name),
    ).length;
    return this.remember(input.key, {
      ...base,
      latestRelease,
      changed,
      comparedAt,
    });
  }

  private remember(key: string, head: ReleaseHead): ReleaseHead {
    if (head.latestRelease !== null && head.comparedAt !== null) {
      this.last.set(key, {
        latestRelease: head.latestRelease,
        comparedAt: head.comparedAt,
      });
    }
    return head;
  }

  private async treesAt(
    root: string,
    tag: string,
  ): Promise<Map<string, string> | null> {
    const skills = await this.deps.git
      .readSkillTreesAtTag(root, tag)
      .catch(() => null);
    return skills === null
      ? null
      : new Map(skills.map((skill) => [skill.name, skill.treeHash]));
  }
}
