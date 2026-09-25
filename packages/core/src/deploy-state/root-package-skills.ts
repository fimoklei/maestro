// Which skills a root package deployed is read from its recorded files, never
// from `skill_subset` or `skills:`: both keep names the last narrow dropped.
import { DEPLOY_TOOLS } from "../deploy/deploy-tools";
import { classifyPackageType, type LockfileEntry } from "../lockfile/lockfile";

// `files` are lockfile paths, relative to the target's tree root.
export type RootPackageSkill = {
  name: string;
  prefix: string;
  files: string[];
};

export const DEPLOY_SKILL_PREFIXES = DEPLOY_TOOLS.map(
  (tool) => tool.skillsDirPrefix,
);

export function isRootPackage(entry: LockfileEntry): boolean {
  return classifyPackageType(entry.package_type) === "package";
}

// A row naming the skill directory itself is dropped: a directory can outlive
// its contents.
export function attributeRootPackageFiles(
  entry: LockfileEntry,
  prefixes: readonly string[],
): RootPackageSkill[] {
  const byKey = new Map<string, RootPackageSkill>();
  for (const prefix of prefixes) {
    for (const file of entry.deployed_files ?? []) {
      const name = skillNameUnder(file, prefix);
      if (name === null) {
        continue;
      }
      const key = `${prefix}/${name}`;
      const skill = byKey.get(key) ?? { name, prefix, files: [] };
      skill.files.push(file);
      byKey.set(key, skill);
    }
  }
  return [...byKey.values()];
}

// apm keeps rows for files it failed or refused to delete: probe the disk.
export async function deployedRootPackageSkills(
  entry: LockfileEntry,
  prefixes: readonly string[],
  fileExists: (path: string) => Promise<boolean>,
): Promise<RootPackageSkill[]> {
  const attributed = attributeRootPackageFiles(entry, prefixes);
  const present = await Promise.all(
    attributed.map(async (skill) => {
      const probes = await Promise.all(skill.files.map(fileExists));
      return probes.some(Boolean);
    }),
  );
  return attributed.filter((_skill, index) => present[index] === true);
}

// Files the deploy put in a tool's subtree that belong to no skill.
export function countExtraRootPackageFiles(
  entry: LockfileEntry,
  prefixes: readonly string[],
): number {
  return (entry.deployed_files ?? []).filter((file) =>
    prefixes.some(
      (prefix) =>
        file.startsWith(`${prefix}/`) &&
        !file.startsWith(`${prefix}/skills/`) &&
        file !== `${prefix}/skills`,
    ),
  ).length;
}

// Matches `<prefix>/skills/<name>/<rest>` only; no `<rest>` is the directory row.
function skillNameUnder(file: string, prefix: string): string | null {
  const head = `${prefix}/skills/`;
  if (!file.startsWith(head)) {
    return null;
  }
  const [name = "", ...rest] = file.slice(head.length).split("/");
  return name.length > 0 && rest.length > 0 ? name : null;
}
