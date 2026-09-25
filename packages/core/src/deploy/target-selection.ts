// Read from `deployed_files` plus file existence, never from `skill_subset` or
// `skills:`: both keep names apm already dropped (#941).

import { harnessSkillPin } from "../deploy-state/pinned-per-skill";
import {
  DEPLOY_SKILL_PREFIXES,
  deployedRootPackageSkills,
  isRootPackage,
} from "../deploy-state/root-package-skills";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { parseLockfile } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget } from "./deploy-skill";
import type { DeployedLocation } from "./deployed-location";
import type { GitOrigin } from "./git-origin";
import { buildHarnessPackageRef } from "./package-ref";

// A write must never read an unanswerable lockfile as an empty target (#58).
export type TargetSelection =
  | { kind: "empty" }
  | { kind: "root"; release: string; ref: string; deployed: string[] }
  | { kind: "pinned-per-skill" }
  | {
      kind: "unreadable";
      reason: "lockfile-malformed" | "ref-unresolvable";
    };

export async function readTargetSelection(deps: {
  fs: Pick<FileSystemPort, "readFile" | "isFileEntry">;
  location: Pick<DeployedLocation, "lockfilePath" | "treeRoot">;
  target: DeployTarget;
  origin: GitOrigin;
}): Promise<TargetSelection> {
  const raw = await deps.fs.readFile(deps.location.lockfilePath(deps.target));
  // apm deletes the lockfile with the last dependency: absent means empty.
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
    // Only after ruling out a root package: a target mid-migration holds both.
    return parsed.entries.some(
      (entry) => harnessSkillPin(entry, deps.origin) !== null,
    )
      ? { kind: "pinned-per-skill" }
      : { kind: "empty" };
  }

  // The lockfile is user data that reaches an apm command: check its shape.
  if (!RELEASE_TAG_PATTERN.test(root.resolved_ref)) {
    return { kind: "unreadable", reason: "ref-unresolvable" };
  }
  const treeRoot = deps.location.treeRoot(deps.target);
  const skills = await deployedRootPackageSkills(
    root,
    DEPLOY_SKILL_PREFIXES,
    (file) => deps.fs.isFileEntry(`${treeRoot}/${file}`),
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
  };
}
