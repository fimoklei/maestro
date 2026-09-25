// apm writes ONE entry per skill even for a two-tool install, listing both
// copies in deployed_files (apm-behavior.md § Lockfile), so an entry is
// attributed per prefix found there and to no other tool (ADR-0011). A
// root-package entry works the same way, one row for many skills (ADR-0031).
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
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

export type ToolDeployState = {
  tool: SupportedTool;
  primitives: DeployedPrimitive[];
  // Absent where this target follows no single release (ADR-0031).
  releaseHead?: ReleaseHead;
  // Absent unless this tool still holds per-skill dependencies on the connected
  // Harness (#950).
  pinnedPerSkill?: PinnedPerSkill;
  // Absent where this tool's subtree holds no file outside the selected skills.
  extraFiles?: number;
  // The release's page in the connected Harness; absent where nothing links.
  releaseGitHub?: GitHubPage;
};

const SKILLS_DIR_PREFIX = new Map<SupportedTool, string>(
  DEPLOY_TOOLS.map((tool) => [tool.apmTarget, tool.skillsDirPrefix]),
);

export async function groupPrimitivesByTool(
  entries: LockfileEntry[],
  detectedTools: readonly SupportedTool[],
  deps: {
    fileExists: (path: string) => Promise<boolean>;
    // The connected Harness, or null while it is unknown (#950).
    origin?: GitOrigin | null;
    // The connected Harness's page, read only once an entry could link to it.
    harnessPage?: () => Promise<GitHubPage | null>;
  },
): Promise<{
  tools: ToolDeployState[];
  skipped: SkippedEntry[];
  otherOrigins: string[];
  // The release the root-package dependency follows, when there is one.
  release?: string;
}> {
  // An empty group is the honest "detected but nothing deployed" state.
  const tools: ToolDeployState[] = detectedTools.map((tool) => ({
    tool,
    primitives: [],
  }));
  const skipped: SkippedEntry[] = [];
  // A skill entry no detected tool's prefix claims is not "nothing deployed" —
  // it is deployed by a repo this read cannot attribute, so its origin is
  // named instead of the entry vanishing (#655).
  const otherOrigins = new Set<string>();
  // One list per tool, so a pin decides the status of the subtree it landed in
  // and of no other.
  const pins = new Map<SupportedTool, SkillPin[]>(
    tools.map((group) => [group.tool, []]),
  );
  let release: string | undefined;

  for (const entry of entries) {
    const reading = readPackage(entry);
    if (reading.kind === "package") {
      // The first root package is the Harness dependency in every shape apm
      // writes today; a second one is a shape this read cannot attribute.
      if (release !== undefined) {
        continue;
      }
      release = entry.resolved_ref;
      const pages = harnessPages(entry, (await deps.harnessPage?.()) ?? null);
      const deployed = await deployedRootPackageSkills(
        entry,
        tools.map((group) => SKILLS_DIR_PREFIX.get(group.tool) ?? ""),
        deps.fileExists,
      );
      for (const group of tools) {
        const prefix = SKILLS_DIR_PREFIX.get(group.tool);
        const extra = countExtraRootPackageFiles(
          entry,
          prefix === undefined ? [] : [prefix],
        );
        if (extra > 0) {
          group.extraFiles = extra;
        }
        if (pages !== undefined) {
          group.releaseGitHub = pages.release;
        }
        for (const skill of deployed) {
          if (skill.prefix === prefix) {
            const github = pages?.skill(skill.name);
            group.primitives.push({
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
      // Parsing rejects a non-root row that names no path, so this one has it.
      skipped.push(skippedFromReading(reading, entry.virtual_path ?? ""));
      continue;
    }
    const pin = harnessSkillPin(entry, deps.origin ?? null);
    const github = perSkillPage(
      entry,
      reading.name,
      (await deps.harnessPage?.()) ?? null,
    );
    let claimed = false;
    for (const group of tools) {
      const prefix = SKILLS_DIR_PREFIX.get(group.tool);
      if (prefix !== undefined && entryTargetsPrefix(entry, prefix)) {
        claimed = true;
        group.primitives.push({
          type: "skill",
          name: reading.name,
          version: entry.resolved_ref,
          ...(github === undefined ? {} : { github }),
        });
        if (pin !== null) {
          pins.get(group.tool)?.push(pin);
        }
      }
    }
    if (!claimed && entry.repo_url !== undefined) {
      otherOrigins.add(entry.repo_url);
    }
  }
  for (const group of tools) {
    const tallied = tallyPins(pins.get(group.tool) ?? []);
    if (tallied !== undefined) {
      group.pinnedPerSkill = tallied;
    }
  }
  return release === undefined
    ? { tools, skipped, otherOrigins: [...otherOrigins] }
    : { tools, skipped, otherOrigins: [...otherOrigins], release };
}

// The trailing slash keeps `.claude` from matching a `.claudex` sibling.
function entryTargetsPrefix(entry: LockfileEntry, prefix: string): boolean {
  return (entry.deployed_files ?? []).some((file) =>
    file.startsWith(`${prefix}/`),
  );
}
