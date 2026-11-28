import {
  type GlobalFolder,
  type GlobalLayout,
  globalFolders,
  type SupportedTool,
} from "../deploy/deploy-tools";
import {
  formerClaudeRoots,
  formerFolderPath,
} from "../deploy/former-claude-folders";
import type { GitOrigin } from "../deploy/git-origin";
import type { GitHubPage } from "../git/github-page";
import {
  type DeploymentRow,
  type LockfileEntry,
  readPackage,
} from "../lockfile/lockfile";
import {
  type DeployedPrimitive,
  type PinnedPerSkill,
  type ReleaseHead,
  type SkippedEntry,
  skippedFromReading,
} from "./deploy-state-types";
import { harnessPages, perSkillPage } from "./harness-pages";
import { harnessSkillPin, type SkillPin, tallyPins } from "./pinned-per-skill";
import { COPY_READINGS } from "./reading-order";
import {
  countExtraRootPackageFiles,
  deployedRootPackageSkills,
} from "./root-package-skills";

export type NotUpdatedCopy = { name: string; stillAt: string | null };

export type NotUpdatedCopies = {
  targetRelease: string;
  copies: NotUpdatedCopy[];
};

export type StrayCopy = { name: string; atRelease: boolean };

export type GlobalFolderState = GlobalFolder & {
  primitives: DeployedPrimitive[];
  notUpdated?: NotUpdatedCopies;
  missing?: string[];
  strayCopies?: StrayCopy[];
};

export type GlobalTargetState = {
  primitives: DeployedPrimitive[];
  folders: GlobalFolderState[];
  releaseHead?: ReleaseHead;
  pinnedPerSkill?: PinnedPerSkill;
  extraFiles?: number;
  releaseGitHub?: GitHubPage;
  latestReleaseGitHub?: GitHubPage;
};

export async function readGlobalTarget(
  entries: LockfileEntry[],
  detectedTools: readonly SupportedTool[],
  deps: {
    layout: GlobalLayout;
    deployments: readonly DeploymentRow[];
    fileExists: (path: string) => Promise<boolean>;
    origin?: GitOrigin | null;
    harnessPage?: () => Promise<GitHubPage | null>;
  },
): Promise<
  Omit<GlobalTargetState, "releaseHead" | "latestReleaseGitHub"> & {
    skipped: SkippedEntry[];
    otherOrigins: string[];
    release?: string;
  }
> {
  const formerRoots = new Map<GlobalFolder, string>();
  const prefixOf = (folder: GlobalFolder) =>
    formerRoots.get(folder) ?? deps.layout.roots[folder.tool];
  const folders: GlobalFolderState[] = globalFolders(
    detectedTools,
    deps.layout,
  ).map((folder) => ({ ...folder, primitives: [] }));
  for (const root of formerClaudeRoots(deps.deployments, deps.layout)) {
    const folder: GlobalFolderState = {
      path: formerFolderPath(root),
      tool: "claude",
      detected: false,
      former: true,
      primitives: [],
    };
    formerRoots.set(folder, root);
    folders.push(folder);
  }
  const written = folders.filter(
    (folder) => folder.detected || folder.former === true,
  );
  const skipped: SkippedEntry[] = [];
  const otherOrigins = new Set<string>();
  const pins: SkillPin[] = [];
  let page: Promise<GitHubPage | null> | undefined;
  const harnessPage = () => {
    page = page ?? deps.harnessPage?.() ?? Promise.resolve(null);
    return page;
  };
  const addSkill = (
    folder: GlobalFolderState,
    name: string,
    version: string,
    github: GitHubPage | undefined,
  ) =>
    folder.primitives.push({
      type: "skill",
      name,
      version,
      ...(github === undefined ? {} : { github }),
    });
  let release: string | undefined;
  let extraFiles = 0;
  let releaseGitHub: GitHubPage | undefined;

  for (const entry of entries) {
    const reading = readPackage(entry);
    if (reading.kind === "package") {
      if (release !== undefined) {
        continue;
      }
      release = entry.resolved_ref;
      const pages = harnessPages(entry, await harnessPage());
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
            addSkill(
              folder,
              skill.name,
              entry.resolved_ref,
              pages?.skill(skill.name),
            );
          }
        }
      }
      continue;
    }
    if (reading.kind !== "skill") {
      skipped.push(skippedFromReading(reading, entry.virtual_path ?? ""));
      continue;
    }
    const github = perSkillPage(entry, reading.name, await harnessPage());
    const holders: GlobalFolderState[] = [];
    for (const folder of written) {
      if (
        entryTargetsPrefix(entry, prefixOf(folder)) &&
        (folder.former !== true ||
          (await holdsOnDisk(entry, prefixOf(folder), deps.fileExists)))
      ) {
        holders.push(folder);
      }
    }
    for (const folder of holders) {
      addSkill(folder, reading.name, entry.resolved_ref, github);
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
  const shown = folders.filter(
    (folder) => folder.former !== true || folder.primitives.length > 0,
  );
  return {
    primitives: oneSkillList(shown),
    folders: shown,
    skipped,
    otherOrigins: [...otherOrigins],
    ...(pinnedPerSkill === undefined ? {} : { pinnedPerSkill }),
    ...(extraFiles === 0 ? {} : { extraFiles }),
    ...(releaseGitHub === undefined ? {} : { releaseGitHub }),
    ...(release === undefined ? {} : { release }),
  };
}

const copyRank = (copy: DeployedPrimitive["copy"]) =>
  copy === undefined ? COPY_READINGS.length : COPY_READINGS.indexOf(copy);

export function oneSkillList(
  folders: readonly GlobalFolderState[],
): DeployedPrimitive[] {
  const byName = new Map<string, DeployedPrimitive>();
  for (const folder of folders) {
    for (const primitive of folder.primitives) {
      const held = byName.get(primitive.name);
      if (
        held === undefined ||
        copyRank(primitive.copy) < copyRank(held.copy)
      ) {
        byName.set(primitive.name, { ...primitive });
      }
    }
  }
  return [...byName.values()];
}

async function holdsOnDisk(
  entry: LockfileEntry,
  prefix: string,
  fileExists: (path: string) => Promise<boolean>,
): Promise<boolean> {
  for (const file of entry.deployed_files ?? []) {
    if (file.startsWith(`${prefix}/`) && (await fileExists(file))) {
      return true;
    }
  }
  return false;
}

function entryTargetsPrefix(entry: LockfileEntry, prefix: string): boolean {
  return (entry.deployed_files ?? []).some((file) =>
    file.startsWith(`${prefix}/`),
  );
}
