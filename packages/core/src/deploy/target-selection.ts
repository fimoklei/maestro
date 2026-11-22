import { resolve } from "node:path";
import { harnessSkillPin } from "../deploy-state/pinned-per-skill";
import {
  deployedRootPackageSkills,
  isRootPackage,
  skillPrefixes,
} from "../deploy-state/root-package-skills";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { parseLockfile } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget } from "./deploy-skill";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";
import type { GitOrigin } from "./git-origin";
import { buildHarnessPackageRef } from "./package-ref";

type DeployedCopy = { name: string; tool: SupportedTool };

export type TargetSelection =
  | { kind: "empty" }
  | {
      kind: "root";
      release: string;
      ref: string;
      deployed: string[];
      copies: DeployedCopy[];
    }
  | { kind: "pinned-per-skill" }
  | {
      kind: "unreadable";
      reason: "lockfile-malformed" | "ref-unresolvable";
    };

export async function readTargetSelection(deps: {
  fs: Pick<FileSystemPort, "readFile" | "isFileEntry">;
  location: Pick<DeployedLocation, "lockfilePath" | "treeRoot" | "toolRoots">;
  target: DeployTarget;
  origin: GitOrigin;
}): Promise<TargetSelection> {
  const raw = await deps.fs.readFile(deps.location.lockfilePath(deps.target));
  if (raw === null) {
    return { kind: "empty" };
  }
  const parsed = parseLockfile(raw);
  if (!parsed.ok || parsed.unreadable.length > 0) {
    return { kind: "unreadable", reason: "lockfile-malformed" };
  }

  const roots = parsed.entries.filter(
    (entry) =>
      isRootPackage(entry) &&
      entry.host === deps.origin.host &&
      entry.repo_url === deps.origin.ownerRepo,
  );
  if (roots.length > 1) {
    return { kind: "unreadable", reason: "ref-unresolvable" };
  }
  const root = roots[0];
  if (root === undefined) {
    return parsed.entries.some(
      (entry) => harnessSkillPin(entry, deps.origin) !== null,
    )
      ? { kind: "pinned-per-skill" }
      : { kind: "empty" };
  }

  if (!RELEASE_TAG_PATTERN.test(root.resolved_ref)) {
    return { kind: "unreadable", reason: "ref-unresolvable" };
  }
  const treeRoot = deps.location.treeRoot(deps.target);
  const toolRoots = deps.location.toolRoots(deps.target);
  const skills = await deployedRootPackageSkills(
    root,
    skillPrefixes(toolRoots),
    (file) => deps.fs.isFileEntry(resolve(treeRoot, file)),
  );
  return {
    kind: "root",
    release: root.resolved_ref,
    ref: buildHarnessPackageRef({
      host: deps.origin.host,
      ownerRepo: deps.origin.ownerRepo,
      tag: root.resolved_ref,
    }),
    deployed: [...new Set(skills.map((skill) => skill.name))],
    copies: skills.flatMap((skill) =>
      SUPPORTED_TOOLS.filter((tool) => toolRoots[tool] === skill.prefix).map(
        (tool) => ({ name: skill.name, tool }),
      ),
    ),
  };
}
