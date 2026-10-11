import type { DeployTarget } from "../inventory/use-deploy-skill";
import { targetLabel } from "./target-label";

// The one owner of a target's name: every other file asks here, so a dialog
// cannot shorten a path without the other registered repositories (#1476).

/** A repository's short name: the tail that tells it from every registered one. */
export const repoTargetName = (
  repoPath: string,
  registered: readonly string[],
): string => targetLabel(repoPath, registered);

/** A target's whole name, for an accessible name that must tell every target apart. */
export const wholeTargetName = (
  target: DeployTarget,
  shortName: string,
): string => (target.kind === "repo" ? target.repoPath : shortName);

// One Harness, so no other path competes for its name.
export const harnessName = (path: string): string => targetLabel(path, []);
