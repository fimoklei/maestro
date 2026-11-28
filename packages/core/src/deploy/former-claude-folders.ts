import { isAbsolute, join, sep } from "node:path";
import type { DeploymentRow } from "../lockfile/lockfile";
import { type GlobalLayout, REPO_TOOL_ROOTS } from "./deploy-tools";

export type FormerClaudeProfile = { configDir: string | null };

const CLAUDE_DEPLOY_ROOT = "claude";
const SKILLS_SEGMENT = "/skills/";

const staysInHome = (root: string) =>
  !isAbsolute(root) &&
  root.split("/").every((part) => part !== "" && part !== "." && part !== "..");

export function formerClaudeRoots(
  deployments: readonly DeploymentRow[],
  layout: GlobalLayout,
): string[] {
  const roots = new Set<string>();
  for (const row of deployments) {
    const at = row.value.indexOf(SKILLS_SEGMENT);
    const root = at > 0 ? row.value.slice(0, at) : null;
    if (
      row.target === CLAUDE_DEPLOY_ROOT &&
      root !== null &&
      root !== layout.roots.claude &&
      staysInHome(root)
    ) {
      roots.add(root);
    }
  }
  return [...roots].sort();
}

export const formerFolderPath = (root: string) => `~/${root}/skills`;

export function formerClaudeFoldersHolding(
  deployments: readonly DeploymentRow[],
  layout: GlobalLayout,
  name: string,
): string[] {
  const holding = deployments.filter((row) =>
    `${row.value}/`.includes(`${SKILLS_SEGMENT}${name}/`),
  );
  return formerClaudeRoots(holding, layout).map(formerFolderPath);
}

export function formerClaudeProfiles(input: {
  deployments: readonly DeploymentRow[];
  layout: GlobalLayout;
  home: string;
  realpath: (path: string) => string;
}): FormerClaudeProfile[] {
  return formerClaudeRoots(input.deployments, input.layout)
    .filter((root) =>
      input.realpath(join(input.home, root)).startsWith(`${input.home}${sep}`),
    )
    .map((root) => ({
      configDir:
        root === REPO_TOOL_ROOTS.claude ? null : join(input.home, root),
    }));
}
