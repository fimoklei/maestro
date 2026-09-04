// Joins apm's Behind judgment with the release-tree facts ADR-0027 and ADR-0028
// separate from it. Behind is the fallback wherever those facts are unanswered.

import type { DeployTarget } from "../deploy/deploy-skill";
import type { DeployedLocation } from "../deploy/deployed-location";
import type { GitOrigin } from "../deploy/git-origin";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import { claudeSkillName, parseLockfile } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { OutdatedResult, VersionDrift } from "./parse-outdated";

// "behind" claims a newer release exists and this skill moved in it;
// "older-tag" claims the same release with the skill's content unchanged;
// "no-longer-released" proves this deployed name vanished from the release.
export type DriftReading = "behind" | "older-tag" | "no-longer-released";

export type ReadDriftEntry = VersionDrift & { reading: DriftReading };

export type DriftResult =
  | { ok: true; behind: ReadDriftEntry[] }
  | { ok: false; reason?: "unverified" };

// The content side of the join. Structural, not `HarnessGitPort`: only these
// three reads answer the content question.
export type HarnessContentPort = {
  fetch(root: string): Promise<unknown>;
  readOrigin(root: string): Promise<GitOrigin | null>;
  // Read at a published tag, resolved in the namespace Maestro fetches tags
  // into — never `refs/tags`, which may hold an unpushed local tag (#516).
  readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null>;
};

export class ReadDrift {
  private readonly deps: {
    drift: {
      execute(input: { target: DeployTarget }): Promise<OutdatedResult>;
    };
    fs: Pick<FileSystemPort, "readFile">;
    location: DeployedLocation;
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessContentPort;
  };

  constructor(deps: ReadDrift["deps"]) {
    this.deps = deps;
  }

  async execute(input: { target: DeployTarget }): Promise<DriftResult> {
    const outdated = await this.deps.drift.execute(input);
    if (!outdated.ok) {
      return outdated;
    }
    if (outdated.behind.length === 0) {
      return { ok: true, behind: [] };
    }

    const readings = await this.contentReadings(input.target, outdated.behind);
    return {
      ok: true,
      behind: outdated.behind.map((entry) => ({
        ...entry,
        reading: readings.noLongerReleased.has(entry.name)
          ? "no-longer-released"
          : readings.unmoved.has(entry.name)
            ? "older-tag"
            : "behind",
      })),
    };
  }

  // Names proven identical at both tags, and names proven absent from the
  // latest release. Every other name falls back to Behind, so an unreadable
  // clone, ref or pin never invents a content answer.
  private async contentReadings(
    target: DeployTarget,
    behind: readonly VersionDrift[],
  ): Promise<{ unmoved: Set<string>; noLongerReleased: Set<string> }> {
    const unmoved = new Set<string>();
    const noLongerReleased = new Set<string>();
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { unmoved, noLongerReleased };
    }
    // The latest tag is a remote fact and the trees are read locally, so the
    // tags must be current before any ref resolves (ADR-0027 §5). A fetch that
    // fails leaves the read to the tags already on disk.
    await this.deps.git.fetch(root).catch(() => undefined);
    const origin = await this.deps.git.readOrigin(root);
    if (origin === null) {
      return { unmoved, noLongerReleased };
    }

    const pins = await this.readPins(target);
    // One ls-tree per tag, not per skill: a target's skills share few tags.
    const byTag = new Map<string, Promise<Map<string, string> | null>>();
    const treesAt = (tag: string) => {
      const cached = byTag.get(tag);
      if (cached !== undefined) {
        return cached;
      }
      const read = this.deps.git
        .readSkillTreesAtTag(root, tag)
        .then((skills) =>
          skills === null
            ? null
            : new Map(skills.map((skill) => [skill.name, skill.treeHash])),
        );
      byTag.set(tag, read);
      return read;
    };

    for (const entry of behind) {
      const pin = pins.get(entry.name);
      // A skill pinned to another repository never gets a content answer; its
      // name matching one here proves nothing (ADR-0027 §5).
      if (
        pin === undefined ||
        pin.host !== origin.host ||
        pin.ownerRepo !== origin.ownerRepo
      ) {
        continue;
      }
      if (
        !RELEASE_TAG_PATTERN.test(entry.current) ||
        !RELEASE_TAG_PATTERN.test(entry.latest)
      ) {
        continue;
      }
      const [pinned, latest] = await Promise.all([
        treesAt(entry.current),
        treesAt(entry.latest),
      ]);
      if (pinned === null || latest === null) {
        continue;
      }
      const before = pinned.get(entry.name);
      const after = latest.get(entry.name);
      if (before !== undefined && after === undefined) {
        noLongerReleased.add(entry.name);
      } else if (before !== undefined && before === after) {
        unmoved.add(entry.name);
      }
    }

    return { unmoved, noLongerReleased };
  }

  // Which repository each deployed skill is pinned to, read from the target's
  // own lockfile. A name pinned twice gets no answer: picking one of the two
  // would decide the reading on a guess.
  private async readPins(
    target: DeployTarget,
  ): Promise<Map<string, GitOrigin>> {
    const pins = new Map<string, GitOrigin>();
    const raw = await this.deps.fs.readFile(
      this.deps.location.lockfilePath(target),
    );
    if (raw === null) {
      return pins;
    }
    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return pins;
    }

    const duplicated = new Set<string>();
    for (const entry of parsed.entries) {
      const name = claudeSkillName(entry);
      if (
        name === null ||
        entry.host === undefined ||
        entry.repo_url === undefined ||
        // The row names one skill; the pin must name that same skill.
        entry.virtual_path !== harnessSkillSubpath(name)
      ) {
        continue;
      }
      if (pins.has(name)) {
        duplicated.add(name);
      }
      pins.set(name, { host: entry.host, ownerRepo: entry.repo_url });
    }
    for (const name of duplicated) {
      pins.delete(name);
    }
    return pins;
  }
}
