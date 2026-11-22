import type { DeployTarget } from "../deploy/deploy-skill";
import type { DeployedLocation } from "../deploy/deployed-location";
import type { GitOrigin } from "../deploy/git-origin";
import {
  attributeRootPackageFiles,
  isRootPackage,
  skillPrefixes,
} from "../deploy-state/root-package-skills";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/released-content";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import {
  claudeSkillName,
  type LockfileEntry,
  parseLockfile,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import {
  lastSegment,
  type OutdatedResult,
  type VersionDrift,
} from "./parse-outdated";

type DriftReading = "behind" | "older-tag" | "no-longer-released";

export type ReadDriftEntry = VersionDrift & { reading: DriftReading };

export type DriftResult =
  | { ok: true; behind: ReadDriftEntry[] }
  | Extract<OutdatedResult, { ok: false }>;

export type HarnessContentPort = {
  readOrigin(root: string): Promise<GitOrigin | null>;
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
    fetchHarness: (root: string) => Promise<unknown>;
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
      behind: [
        ...outdated.behind.map((entry) => ({
          ...entry,
          reading: readings.pinReadings.get(entry.name) ?? ("behind" as const),
        })),
        ...readings.packageSkills,
      ],
    };
  }

  private async contentReadings(
    target: DeployTarget,
    behind: readonly VersionDrift[],
  ): Promise<{
    pinReadings: Map<string, DriftReading>;
    packageSkills: ReadDriftEntry[];
  }> {
    const pinReadings = new Map<string, DriftReading>();
    const packageSkills: ReadDriftEntry[] = [];
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { pinReadings, packageSkills };
    }
    await this.deps.fetchHarness(root).catch(() => undefined);
    const origin = await this.deps.git.readOrigin(root);
    if (origin === null) {
      return { pinReadings, packageSkills };
    }

    const entries = await this.readLockEntries(target);
    const pins = pinsFrom(entries);
    const rootPackage = rootPackageFrom(
      entries,
      origin,
      skillPrefixes(this.deps.location.toolRoots(target)),
    );
    const treesAt = (tag: string) =>
      this.deps.git
        .readSkillTreesAtTag(root, tag)
        .then((skills) =>
          skills === null
            ? null
            : new Map(skills.map((skill) => [skill.name, skill.treeHash])),
        );
    const releasesOf = async (entry: VersionDrift) => {
      if (
        !RELEASE_TAG_PATTERN.test(entry.current) ||
        !RELEASE_TAG_PATTERN.test(entry.latest)
      ) {
        return null;
      }
      const [current, latest] = await Promise.all([
        treesAt(entry.current),
        treesAt(entry.latest),
      ]);
      return current === null || latest === null ? null : { current, latest };
    };

    for (const entry of behind) {
      if (rootPackage !== undefined && entry.name === rootPackage.name) {
        const releases = await releasesOf(entry);
        if (releases === null) {
          continue;
        }
        for (const name of rootPackage.selection) {
          const reading = contentReading(
            releases.current.get(name),
            releases.latest.get(name),
          );
          if (reading !== undefined && reading !== "older-tag") {
            packageSkills.push({ ...entry, name, reading });
          }
        }
        continue;
      }
      const pin = pins.get(entry.name);
      if (
        pin === undefined ||
        pin.host !== origin.host ||
        pin.ownerRepo !== origin.ownerRepo
      ) {
        continue;
      }
      const releases = await releasesOf(entry);
      const reading =
        releases === null
          ? undefined
          : contentReading(
              releases.current.get(entry.name),
              releases.latest.get(entry.name),
            );
      if (reading !== undefined) {
        pinReadings.set(entry.name, reading);
      }
    }

    return { pinReadings, packageSkills };
  }

  private async readLockEntries(
    target: DeployTarget,
  ): Promise<LockfileEntry[]> {
    const raw = await this.deps.fs.readFile(
      this.deps.location.lockfilePath(target),
    );
    if (raw === null) {
      return [];
    }
    const parsed = parseLockfile(raw);
    return parsed.ok ? parsed.entries : [];
  }
}

function contentReading(
  before: string | undefined,
  after: string | undefined,
): DriftReading | undefined {
  if (before === undefined) {
    return undefined;
  }
  if (after === undefined) {
    return "no-longer-released";
  }
  return before === after ? "older-tag" : "behind";
}

function rootPackageFrom(
  entries: readonly LockfileEntry[],
  origin: GitOrigin,
  prefixes: readonly string[],
): { name: string; selection: string[] } | undefined {
  const roots = entries.filter(
    (entry) =>
      isRootPackage(entry) &&
      entry.host === origin.host &&
      entry.repo_url === origin.ownerRepo,
  );
  const [root] = roots;
  if (roots.length !== 1 || root === undefined) {
    return undefined;
  }
  return {
    name: lastSegment(origin.ownerRepo),
    selection: [
      ...new Set(
        attributeRootPackageFiles(root, prefixes).map((skill) => skill.name),
      ),
    ],
  };
}

function pinsFrom(entries: readonly LockfileEntry[]): Map<string, GitOrigin> {
  const pins = new Map<string, GitOrigin>();
  const duplicated = new Set<string>();
  for (const entry of entries) {
    const name = claudeSkillName(entry);
    if (
      name === null ||
      entry.host === undefined ||
      entry.repo_url === undefined ||
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
