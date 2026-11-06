// apm writes ONE entry per skill even for a two-tool install, listing both
// copies in deployed_files, so an entry is attributed per prefix found there.
import {
  DEPLOY_TOOLS,
  type GlobalFolder,
  globalFolders,
  type SupportedTool,
} from "../deploy/deploy-tools";
import type { GitOrigin } from "../deploy/git-origin";
import type { GitHubPage } from "../git/github-page";
import { type LockfileEntry, readPackage } from "../lockfile/lockfile";
import {
  type DeployedPrimitive,
  type PinnedPerSkill,
  type ReleaseHead,
  type SkippedEntry,
  skippedFromReading,
} from "./deploy-state-types";
import { harnessPages, perSkillPage } from "./harness-pages";
import { harnessSkillPin, type SkillPin, tallyPins } from "./pinned-per-skill";
import {
  countExtraRootPackageFiles,
  deployedRootPackageSkills,
} from "./root-package-skills";

/** An unedited copy Global did not move to its Target release; `stillAt` null where no older release matches. */
export type NotUpdatedCopy = { name: string; stillAt: string | null };

/** A copy Global no longer updates, in a folder whose tool is not detected. */
export type StrayCopy = { name: string; atRelease: boolean };

/** A Global folder with the copies Global wrote there; none where its tool is not detected. */
export type GlobalFolderState = GlobalFolder & {
  primitives: DeployedPrimitive[];
  // Absent where every copy is at the Target release.
  notUpdated?: NotUpdatedCopy[];
  // Undetected folder only: Selection skills with a copy here and in a written
  // folder. Absent where there are none.
  strayCopies?: StrayCopy[];
};

/** Global as one target: one release, one skill list, and the folders it writes. */
export type GlobalTargetState = {
  primitives: DeployedPrimitive[];
  folders: GlobalFolderState[];
  releaseHead?: ReleaseHead;
  pinnedPerSkill?: PinnedPerSkill;
  extraFiles?: number;
  // The release's page in the connected Harness; absent where nothing links.
  releaseGitHub?: GitHubPage;
  // The latest release's page, where Global is behind it.
  latestReleaseGitHub?: GitHubPage;
};

const PREFIX = new Map<SupportedTool, string>(
  DEPLOY_TOOLS.map((tool) => [tool.apmTarget, tool.skillsDirPrefix]),
);

export async function readGlobalTarget(
  entries: LockfileEntry[],
  detectedTools: readonly SupportedTool[],
  deps: {
    fileExists: (path: string) => Promise<boolean>;
    origin?: GitOrigin | null;
    // The connected Harness's page, read only once an entry could link to it.
    harnessPage?: () => Promise<GitHubPage | null>;
  },
): Promise<
  Omit<GlobalTargetState, "releaseHead" | "latestReleaseGitHub"> & {
    skipped: SkippedEntry[];
    otherOrigins: string[];
    release?: string;
  }
> {
  const folders: GlobalFolderState[] = globalFolders(detectedTools).map(
    (folder) => ({ ...folder, primitives: [] }),
  );
  const written = folders.filter((folder) => folder.detected);
  const skipped: SkippedEntry[] = [];
  // Entries no detected tool claims are named by origin, never dropped (#655).
  const otherOrigins = new Set<string>();
  const pins: SkillPin[] = [];
  let release: string | undefined;
  let extraFiles = 0;
  let releaseGitHub: GitHubPage | undefined;

  for (const entry of entries) {
    const reading = readPackage(entry);
    if (reading.kind === "package") {
      // Only the first root package is the Harness dependency.
      if (release !== undefined) {
        continue;
      }
      release = entry.resolved_ref;
      const pages = harnessPages(entry, (await deps.harnessPage?.()) ?? null);
      releaseGitHub = pages?.release;
      const prefixes = written.map((folder) => prefixOf(folder));
      extraFiles = countExtraRootPackageFiles(entry, prefixes);
      const deployed = await deployedRootPackageSkills(
        entry,
        prefixes,
        deps.fileExists,
      );
      for (const folder of written) {
        for (const skill of deployed) {
          if (skill.prefix === prefixOf(folder)) {
            const github = pages?.skill(skill.name);
            folder.primitives.push({
              type: "skill",
              name: skill.name,
              version: entry.resolved_ref,
              ...(github === undefined ? {} : { github }),
            });
          }
        }
      }
      continue;
    }
    if (reading.kind !== "skill") {
      skipped.push(skippedFromReading(reading, entry.virtual_path ?? ""));
      continue;
    }
    const github = perSkillPage(
      entry,
      reading.name,
      (await deps.harnessPage?.()) ?? null,
    );
    const holders = written.filter((folder) =>
      entryTargetsPrefix(entry, prefixOf(folder)),
    );
    for (const folder of holders) {
      folder.primitives.push({
        type: "skill",
        name: reading.name,
        version: entry.resolved_ref,
        ...(github === undefined ? {} : { github }),
      });
    }
    if (holders.length === 0) {
      if (entry.repo_url !== undefined) {
        otherOrigins.add(entry.repo_url);
      }
      continue;
    }
    const pin = harnessSkillPin(entry, deps.origin ?? null);
    if (pin !== null) {
      pins.push(pin);
    }
  }
  const pinnedPerSkill = tallyPins(pins);
  return {
    primitives: oneSkillList(folders),
    folders,
    skipped,
    otherOrigins: [...otherOrigins],
    ...(pinnedPerSkill === undefined ? {} : { pinnedPerSkill }),
    ...(extraFiles === 0 ? {} : { extraFiles }),
    ...(releaseGitHub === undefined ? {} : { releaseGitHub }),
    ...(release === undefined ? {} : { release }),
  };
}

/**
 * Global's one skill list: each skill once, in folder order. A skill reads
 * Local edits where any folder's copy does, else Unverified where any does.
 */
export function oneSkillList(
  folders: readonly GlobalFolderState[],
): DeployedPrimitive[] {
  const byName = new Map<string, DeployedPrimitive>();
  for (const folder of folders) {
    for (const primitive of folder.primitives) {
      const held = byName.get(primitive.name);
      if (
        held === undefined ||
        (primitive.copy === "local-edits" && held.copy !== "local-edits") ||
        (primitive.copy === "unverified" && held.copy === undefined)
      ) {
        byName.set(primitive.name, { ...primitive });
      }
    }
  }
  return [...byName.values()];
}

function prefixOf(folder: GlobalFolder): string {
  return PREFIX.get(folder.tool) ?? "";
}

// The trailing slash keeps `.claude` from matching a `.claudex` sibling.
function entryTargetsPrefix(entry: LockfileEntry, prefix: string): boolean {
  return (entry.deployed_files ?? []).some((file) =>
    file.startsWith(`${prefix}/`),
  );
}
